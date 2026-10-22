import { LITURGICAL_ROLES, ROLE_LABELS, SCALE_STATUS_LABELS } from '@coroinha/contracts'
import {
  assignmentsSchema,
  attendanceSchema,
  celebrationBodySchema,
  duplicateScaleSchema,
  listQuerySchema,
  roleSettingsSchema,
} from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { asDate, clean, todayInBrazil } from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import { actor, assertCan, audit, csv, paging, parse, sendCsv, sendPdf } from '../http.js'
import { pdfHeading, renderPdf } from '../pdf.js'
import { getCelebration, saveAssignments, suggest, summaryOf } from '../services/scales.js'

const include = {
  scale: { include: { roles: true, assignments: true } },
} satisfies Prisma.CelebrationInclude

export async function scaleRoutes(app: FastifyInstance) {
  app.get('/api/celebrations', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.read')
    const query = parse(listQuerySchema, request.query)
    const where: Prisma.CelebrationWhereInput = {}
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' }
    if (query.from || query.to) {
      where.date = {}
      if (query.from) where.date.gte = asDate(query.from)
      if (query.to) where.date.lte = asDate(query.to)
    }
    if (query.when === 'upcoming') where.date = { gte: asDate(todayInBrazil()) }
    if (query.when === 'past') where.date = { lt: asDate(todayInBrazil()) }
    if (query.status === 'DRAFT' || query.status === 'PUBLISHED' || query.status === 'COMPLETED') {
      where.scale = { status: query.status }
    }
    if (query.pending === '1') {
      where.scale = { status: { in: ['DRAFT', 'PUBLISHED'] } }
    }
    const rows = await app.prisma.celebration.findMany({
      where,
      include,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    })
    let items = rows.map(summaryOf)
    if (query.pending === '1') items = items.filter((item) => item.filledRoles < item.requiredRoles)
    const { page, pageSize, skip } = paging(query)
    return {
      items: items.slice(skip, skip + pageSize),
      page,
      pageSize,
      total: items.length,
    }
  })

  app.post('/api/celebrations', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const body = parse(celebrationBodySchema, request.body)
    const created = await app.prisma.celebration.create({
      data: {
        title: body.title.trim(),
        date: asDate(body.date),
        time: body.time,
        location: clean(body.location),
        notes: clean(body.notes),
        scale: {
          create: {
            status: 'DRAFT',
            roles: { create: LITURGICAL_ROLES.map((role) => ({ role, enabled: true })) },
          },
        },
      },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.create',
      entity: 'Celebration',
      entityId: created.id,
      ip: request.ip,
    })
    return getCelebration(app.prisma, created.id)
  })

  app.get('/api/celebrations/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.read')
    const params = request.params as { id: string }
    return getCelebration(app.prisma, params.id)
  })

  app.patch('/api/celebrations/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const body = parse(celebrationBodySchema, request.body)
    const current = await getCelebration(app.prisma, params.id)
    if (current.status === 'COMPLETED') throw new ApiError(409, 'LOCKED', 'Reabra a escala para editá-la.')
    await app.prisma.celebration.update({
      where: { id: params.id },
      data: {
        title: body.title.trim(),
        date: asDate(body.date),
        time: body.time,
        location: clean(body.location),
        notes: clean(body.notes),
      },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.update',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return getCelebration(app.prisma, params.id)
  })

  app.delete('/api/celebrations/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const current = await getCelebration(app.prisma, params.id)
    if (current.status !== 'DRAFT') {
      throw new ApiError(409, 'LOCKED', 'Somente escalas em preparação podem ser excluídas.')
    }
    await app.prisma.celebration.delete({ where: { id: params.id } })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.delete',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return { ok: true }
  })

  app.patch('/api/celebrations/:id/roles', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const body = parse(roleSettingsSchema, request.body)
    const current = await app.prisma.celebration.findUnique({
      where: { id: params.id },
      include: { scale: { include: { roles: true, assignments: true } } },
    })
    if (!current?.scale) throw notFound('Celebração não encontrada.')
    if (current.scale.status === 'COMPLETED') throw new ApiError(409, 'LOCKED', 'Reabra a escala para alterar as funções.')
    for (const role of LITURGICAL_ROLES) {
      if (body.roles[role] === undefined) {
        throw new ApiError(422, 'VALIDATION', 'Informe a disponibilidade de todas as funções.')
      }
      const assigned = current.scale.assignments.some((item) => item.role === role)
      if (body.roles[role] === false && assigned) {
        throw new ApiError(409, 'ASSIGNED', `Remova o coroinha de ${ROLE_LABELS[role]} antes de desativar a função.`)
      }
    }
    await app.prisma.$transaction(
      LITURGICAL_ROLES.map((role) =>
        app.prisma.scaleRoleSetting.update({
          where: { scaleId_role: { scaleId: current.scale!.id, role } },
          data: { enabled: body.roles[role] },
        }),
      ),
    )
    return getCelebration(app.prisma, params.id)
  })

  app.put('/api/celebrations/:id/assignments', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const body = parse(assignmentsSchema, request.body)
    const saved = await saveAssignments(app.prisma, params.id, body.assignments, auth)
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.assign',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return saved
  })

  app.get('/api/celebrations/:id/suggestions', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.read')
    const params = request.params as { id: string }
    return suggest(app.prisma, params.id)
  })

  app.post('/api/celebrations/:id/duplicate', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const body = parse(duplicateScaleSchema, request.body)
    const source = await app.prisma.celebration.findUnique({
      where: { id: params.id },
      include: { scale: { include: { roles: true, assignments: { include: { coroinha: true } } } } },
    })
    if (!source?.scale) throw notFound('Celebração não encontrada.')
    const skipped: string[] = []
    const created = await app.prisma.celebration.create({
      data: {
        title: body.title?.trim() || source.title,
        date: asDate(body.date),
        time: body.time,
        location: source.location,
        notes: source.notes,
        scale: {
          create: {
            status: 'DRAFT',
            duplicatedFromId: source.scale.id,
            roles: {
              create: source.scale.roles.map((role) => ({ role: role.role, enabled: role.enabled })),
            },
          },
        },
      },
      include: { scale: true },
    })
    if (body.copyAssignments && created.scale) {
      const copies = []
      for (const assignment of source.scale.assignments) {
        if (assignment.coroinha.status !== 'ACTIVE' || assignment.coroinha.archivedAt) {
          skipped.push(assignment.coroinha.fullName)
          continue
        }
        copies.push({
          scaleId: created.scale.id,
          role: assignment.role,
          coroinhaId: assignment.coroinhaId,
          overrideReason: assignment.overrideReason,
        })
      }
      if (copies.length) await app.prisma.scaleAssignment.createMany({ data: copies })
    }
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.duplicate',
      entity: 'Celebration',
      entityId: created.id,
      metadata: { from: source.id },
      ip: request.ip,
    })
    return { celebration: await getCelebration(app.prisma, created.id), skipped }
  })

  app.post('/api/celebrations/:id/publish', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const current = await app.prisma.celebration.findUnique({
      where: { id: params.id },
      include: { scale: true },
    })
    if (!current?.scale) throw notFound('Celebração não encontrada.')
    if (current.scale.status === 'COMPLETED') throw new ApiError(409, 'LOCKED', 'A escala já foi concluída.')
    await app.prisma.scale.update({
      where: { id: current.scale.id },
      data: { status: 'PUBLISHED', publishedAt: current.scale.publishedAt ?? new Date() },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.publish',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return getCelebration(app.prisma, params.id)
  })

  app.post('/api/celebrations/:id/complete', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const current = await app.prisma.celebration.findUnique({ where: { id: params.id }, include: { scale: true } })
    if (!current?.scale) throw notFound('Celebração não encontrada.')
    if (current.scale.status !== 'PUBLISHED') {
      throw new ApiError(409, 'LOCKED', 'Publique a escala antes de concluí-la.')
    }
    await app.prisma.scale.update({
      where: { id: current.scale.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.complete',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return getCelebration(app.prisma, params.id)
  })

  app.post('/api/celebrations/:id/reopen', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.write')
    const params = request.params as { id: string }
    const current = await app.prisma.celebration.findUnique({ where: { id: params.id }, include: { scale: true } })
    if (!current?.scale) throw notFound('Celebração não encontrada.')
    await app.prisma.scale.update({
      where: { id: current.scale.id },
      data: { status: 'PUBLISHED', completedAt: null },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'scale.reopen',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return getCelebration(app.prisma, params.id)
  })

  app.get('/api/celebrations/:id/attendance', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'scales.read')
    const params = request.params as { id: string }
    const celebration = await getCelebration(app.prisma, params.id)
    const rows = await app.prisma.scaleAssignment.findMany({
      where: { scale: { celebrationId: params.id } },
      include: { attendance: true, coroinha: true },
    })
    return {
      status: celebration.status,
      items: rows.map((row) => ({
        assignmentId: row.id,
        role: row.role,
        coroinhaId: row.coroinhaId,
        coroinhaName: row.coroinha.fullName,
        status: row.attendance?.status ?? null,
        notes: row.attendance?.notes ?? null,
      })),
    }
  })

  app.put('/api/celebrations/:id/attendance', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'attendance.write')
    const params = request.params as { id: string }
    const body = parse(attendanceSchema, request.body)
    const celebration = await app.prisma.celebration.findUnique({
      where: { id: params.id },
      include: { scale: { include: { assignments: true } } },
    })
    if (!celebration?.scale) throw notFound('Celebração não encontrada.')
    if (celebration.scale.status === 'DRAFT') {
      throw new ApiError(409, 'LOCKED', 'Publique a escala antes de registrar a presença.')
    }
    const ids = celebration.scale.assignments.map((item) => item.id)
    if (ids.length === 0) throw new ApiError(409, 'EMPTY', 'Não há coroinhas escalados.')
    const received = new Set(body.items.map((item) => item.assignmentId))
    if (received.size !== body.items.length || ids.length !== received.size || ids.some((id) => !received.has(id))) {
      throw new ApiError(422, 'VALIDATION', 'Registre a presença de todos os coroinhas escalados.')
    }
    await app.prisma.$transaction(async (tx) => {
      for (const item of body.items) {
        await tx.attendance.upsert({
          where: { assignmentId: item.assignmentId },
          create: {
            assignmentId: item.assignmentId,
            status: item.status,
            notes: clean(item.notes),
            recordedById: auth.id,
          },
          update: {
            status: item.status,
            notes: clean(item.notes),
            recordedById: auth.id,
          },
        })
      }
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'attendance.save',
      entity: 'Celebration',
      entityId: params.id,
      ip: request.ip,
    })
    return { ok: true }
  })

  app.get('/api/celebrations/:id/export.csv', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'scales.read')
    const params = request.params as { id: string }
    const celebration = await getCelebration(app.prisma, params.id)
    const byRole = new Map(celebration.assignments.map((item) => [item.role, item.coroinhaName]))
    const content = csv(
      ['Celebração', 'Data', 'Horário', 'Local', 'Situação', 'Função', 'Coroinha'],
      celebration.roles
        .filter((role) => role.enabled)
        .map((role) => [
          celebration.title,
          celebration.date,
          celebration.time,
          celebration.location,
          SCALE_STATUS_LABELS[celebration.status],
          ROLE_LABELS[role.role],
          byRole.get(role.role) ?? '',
        ]),
    )
    return sendCsv(reply, `escala-${celebration.date}.csv`, content)
  })

  app.get('/api/celebrations/:id/export.pdf', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'scales.read')
    const params = request.params as { id: string }
    const celebration = await getCelebration(app.prisma, params.id)
    const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
    const byRole = new Map(celebration.assignments.map((item) => [item.role, item.coroinhaName]))
    const buffer = await renderPdf((doc) => {
      pdfHeading(doc, settings.parishName, 'Escala litúrgica')
      doc.font('Times-Bold').fontSize(16).text(celebration.title)
      doc.moveDown(0.3)
      doc.font('Times-Roman').fontSize(12)
      doc.text(`Data: ${celebration.date.split('-').reverse().join('/')}    Horário: ${celebration.time}`)
      if (celebration.location) doc.text(`Local: ${celebration.location}`)
      doc.text(`Situação: ${SCALE_STATUS_LABELS[celebration.status]}`)
      doc.moveDown(0.8)
      celebration.roles
        .filter((role) => role.enabled)
        .forEach((role) => {
          doc.font('Times-Bold').text(ROLE_LABELS[role.role])
          doc.font('Times-Roman').text(byRole.get(role.role) ?? 'Pendente')
          doc.moveDown(0.35)
        })
      if (celebration.notes) {
        doc.moveDown(0.4)
        doc.font('Times-Bold').text('Observações')
        doc.font('Times-Roman').text(celebration.notes)
      }
    })
    return sendPdf(reply, `escala-${celebration.date}.pdf`, buffer)
  })
}
