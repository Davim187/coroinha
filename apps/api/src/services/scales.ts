import {
  LITURGICAL_ROLES,
  ROLE_LABELS,
  type CelebrationDetail,
  type CelebrationSummary,
  type LiturgicalRole,
  type ScaleAssignmentView,
} from '@coroinha/contracts'
import { hasPermission } from '@coroinha/contracts'
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  addDays,
  clean,
  dateOnly,
  frequencyWarning,
  overlaps,
} from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import type { AuthContext } from '../types.js'

const celebrationInclude = {
  scale: {
    include: {
      roles: true,
      assignments: {
        include: { coroinha: true, attendance: true },
        orderBy: { role: 'asc' as const },
      },
    },
  },
} satisfies Prisma.CelebrationInclude

type CelebrationRecord = Prisma.CelebrationGetPayload<{ include: typeof celebrationInclude }>

async function loadCelebration(prisma: PrismaClient, id: string) {
  const celebration = await prisma.celebration.findUnique({
    where: { id },
    include: celebrationInclude,
  })
  if (!celebration?.scale) throw notFound('Celebração não encontrada.')
  return celebration
}

async function contextFor(prisma: PrismaClient, celebration: CelebrationRecord) {
  const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
  const since = addDays(celebration.date, -settings.balanceWindowDays)
  const grouped = await prisma.scaleAssignment.groupBy({
    by: ['coroinhaId'],
    where: { scale: { celebration: { date: { gte: since, lte: celebration.date } } } },
    _count: { _all: true },
  })
  const active = await prisma.coroinha.findMany({
    where: { status: 'ACTIVE', archivedAt: null },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  })
  const counts = new Map(active.map((person) => [person.id, 0]))
  for (const row of grouped) counts.set(row.coroinhaId, row._count._all)
  const sameDay = await prisma.scaleAssignment.findMany({
    where: { scale: { celebration: { date: celebration.date, id: { not: celebration.id } } } },
    include: { scale: { include: { celebration: true } } },
  })
  return { settings, counts, active, sameDay }
}

function warningsFor(
  coroinhaId: string,
  projected: number,
  counts: Map<string, number>,
  sameDay: Awaited<ReturnType<typeof contextFor>>['sameDay'],
  celebration: CelebrationRecord,
  duration: number,
) {
  const warnings: string[] = []
  for (const other of sameDay) {
    if (other.coroinhaId !== coroinhaId) continue
    if (overlaps(celebration.time, other.scale.celebration.time, duration)) {
      warnings.push(
        `Conflito de horário com ${other.scale.celebration.title} às ${other.scale.celebration.time}.`,
      )
    }
  }
  const frequency = frequencyWarning(projected, [...counts.values()])
  if (frequency) warnings.push(frequency)
  return warnings
}

function present(
  celebration: CelebrationRecord,
  counts: Map<string, number>,
  sameDay: Awaited<ReturnType<typeof contextFor>>['sameDay'],
  duration: number,
): CelebrationDetail {
  const roles = LITURGICAL_ROLES.map((role) => ({
    role,
    enabled: celebration.scale?.roles.find((item) => item.role === role)?.enabled ?? false,
  }))
  const enabled = new Set(roles.filter((role) => role.enabled).map((role) => role.role))
  const assignments: ScaleAssignmentView[] = (celebration.scale?.assignments ?? [])
    .filter((assignment) => enabled.has(assignment.role))
    .map((assignment) => ({
      id: assignment.id,
      role: assignment.role,
      coroinhaId: assignment.coroinhaId,
      coroinhaName: assignment.coroinha.fullName,
      overrideReason: assignment.overrideReason,
      warnings: warningsFor(
        assignment.coroinhaId,
        counts.get(assignment.coroinhaId) ?? 0,
        counts,
        sameDay,
        celebration,
        duration,
      ),
      attendance: assignment.attendance?.status ?? null,
    }))
  const balanceAlerts = [
    ...new Set(assignments.flatMap((item) => item.warnings.filter((warning) => warning.includes('janela recente')))),
  ]
  return {
    id: celebration.id,
    title: celebration.title,
    date: dateOnly(celebration.date),
    time: celebration.time,
    location: celebration.location,
    notes: celebration.notes,
    status: celebration.scale?.status ?? 'DRAFT',
    requiredRoles: enabled.size,
    filledRoles: assignments.length,
    roles,
    assignments,
    balanceAlerts,
  }
}

export async function getCelebration(prisma: PrismaClient, id: string) {
  const celebration = await loadCelebration(prisma, id)
  const context = await contextFor(prisma, celebration)
  return present(celebration, context.counts, context.sameDay, context.settings.celebrationDurationMinutes)
}

export function summaryOf(celebration: {
  id: string
  title: string
  date: Date
  time: string
  location: string | null
  scale: {
    status: CelebrationSummary['status']
    roles: { role: LiturgicalRole; enabled: boolean }[]
    assignments: { role: LiturgicalRole }[]
  } | null
}): CelebrationSummary {
  const enabled = new Set(
    (celebration.scale?.roles ?? []).filter((role) => role.enabled).map((role) => role.role),
  )
  const filled = (celebration.scale?.assignments ?? []).filter((item) => enabled.has(item.role)).length
  return {
    id: celebration.id,
    title: celebration.title,
    date: dateOnly(celebration.date),
    time: celebration.time,
    location: celebration.location,
    status: celebration.scale?.status ?? 'DRAFT',
    requiredRoles: enabled.size,
    filledRoles: filled,
  }
}

type AssignmentInput = { role: LiturgicalRole; coroinhaId: string; overrideReason?: string | null }

export async function saveAssignments(
  prisma: PrismaClient,
  celebrationId: string,
  items: AssignmentInput[],
  auth: AuthContext,
) {
  const current = await loadCelebration(prisma, celebrationId)
  if (current.scale?.status === 'COMPLETED') {
    throw new ApiError(409, 'LOCKED', 'Reabra a escala para alterar as funções.')
  }
  const enabled = new Set((current.scale?.roles ?? []).filter((role) => role.enabled).map((role) => role.role))
  const seenRoles = new Set<LiturgicalRole>()
  const seenPeople = new Map<string, number>()
  for (const item of items) {
    if (!enabled.has(item.role)) {
      throw new ApiError(422, 'VALIDATION', `${ROLE_LABELS[item.role]} não está disponível nesta celebração.`)
    }
    if (seenRoles.has(item.role)) throw new ApiError(422, 'VALIDATION', 'Há uma função repetida na escala.')
    seenRoles.add(item.role)
    seenPeople.set(item.coroinhaId, (seenPeople.get(item.coroinhaId) ?? 0) + 1)
  }
  const canOverride = hasPermission(auth.role, auth.permissions, 'scales.override')
  const occurrences = new Map<string, number>()
  for (const item of items) {
    const count = (occurrences.get(item.coroinhaId) ?? 0) + 1
    occurrences.set(item.coroinhaId, count)
    if (count > 1) {
      if (!canOverride) {
        throw new ApiError(
          403,
          'OVERRIDE',
          'O mesmo coroinha não pode ocupar duas funções na mesma celebração.',
        )
      }
      if (!item.overrideReason || item.overrideReason.trim().length < 10) {
        throw new ApiError(
          422,
          'VALIDATION',
          'Para repetir um coroinha, informe uma justificativa com pelo menos 10 caracteres.',
        )
      }
    }
  }

  const scale = current.scale
  if (!scale) throw notFound('Celebração não encontrada.')

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Scale" WHERE id = ${scale.id} FOR UPDATE`
    const people = await tx.coroinha.findMany({ where: { id: { in: [...seenPeople.keys()] } } })
    if (people.length !== seenPeople.size) throw notFound('Um dos coroinhas selecionados não foi encontrado.')
    for (const person of people) {
      if (person.archivedAt) {
        throw new ApiError(409, 'ARCHIVED', `${person.fullName} está arquivado e não pode ser escalado.`)
      }
      if (person.status !== 'ACTIVE') {
        throw new ApiError(409, 'INACTIVE', `${person.fullName} está inativo e não pode ser escalado.`)
      }
    }
    const existing = await tx.scaleAssignment.findMany({
      where: { scaleId: scale.id },
      include: { attendance: true },
    })
    for (const assignment of existing) {
      const kept = items.some(
        (item) => item.role === assignment.role && item.coroinhaId === assignment.coroinhaId,
      )
      if (!kept && assignment.attendance) {
        throw new ApiError(
          409,
          'ATTENDANCE_LOCKED',
          'Não é possível alterar uma função que já possui presença registrada.',
        )
      }
    }
    for (const assignment of existing) {
      const kept = items.find(
        (item) => item.role === assignment.role && item.coroinhaId === assignment.coroinhaId,
      )
      if (!kept) {
        await tx.scaleAssignment.delete({ where: { id: assignment.id } })
      } else {
        const duplicate = (seenPeople.get(kept.coroinhaId) ?? 0) > 1
        await tx.scaleAssignment.update({
          where: { id: assignment.id },
          data: { overrideReason: duplicate ? clean(kept.overrideReason) : null },
        })
      }
    }
    for (const item of items) {
      const kept = existing.find(
        (assignment) => assignment.role === item.role && assignment.coroinhaId === item.coroinhaId,
      )
      if (kept) continue
      const duplicate = (seenPeople.get(item.coroinhaId) ?? 0) > 1
      await tx.scaleAssignment.create({
        data: {
          scaleId: scale.id,
          role: item.role,
          coroinhaId: item.coroinhaId,
          overrideReason: duplicate ? clean(item.overrideReason) : null,
        },
      })
    }
  })

  return getCelebration(prisma, celebrationId)
}

export async function suggest(prisma: PrismaClient, celebrationId: string) {
  const celebration = await loadCelebration(prisma, celebrationId)
  const context = await contextFor(prisma, celebration)
  const enabled = new Set((celebration.scale?.roles ?? []).filter((role) => role.enabled).map((role) => role.role))
  const used = new Set((celebration.scale?.assignments ?? []).map((item) => item.coroinhaId))
  const proposals: {
    role: LiturgicalRole
    coroinhaId: string
    coroinhaName: string
    recentCount: number
    warnings: string[]
  }[] = []

  for (const role of LITURGICAL_ROLES) {
    if (!enabled.has(role)) continue
    if (celebration.scale?.assignments.some((item) => item.role === role)) continue
    const ranked = context.active
      .filter((person) => !used.has(person.id))
      .map((person) => {
        const recentCount = (context.counts.get(person.id) ?? 0) + 1
        return {
          person,
          recentCount,
          warnings: warningsFor(
            person.id,
            recentCount,
            context.counts,
            context.sameDay,
            celebration,
            context.settings.celebrationDurationMinutes,
          ),
        }
      })
      .sort(
        (left, right) =>
          left.recentCount - right.recentCount ||
          left.person.fullName.localeCompare(right.person.fullName, 'pt-BR'),
      )
    const chosen = ranked.find((item) => !item.warnings.some((warning) => warning.startsWith('Conflito'))) ?? ranked[0]
    if (!chosen) continue
    used.add(chosen.person.id)
    context.counts.set(chosen.person.id, chosen.recentCount)
    proposals.push({
      role,
      coroinhaId: chosen.person.id,
      coroinhaName: chosen.person.fullName,
      recentCount: chosen.recentCount,
      warnings: chosen.warnings,
    })
  }
  return { proposals }
}
