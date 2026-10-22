import type { CoroinhaDetail, CoroinhaSummary } from '@coroinha/contracts'
import { coroinhaBodySchema, listQuerySchema } from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { asDate, clean, dateOnly, todayInBrazil } from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import { actor, assertCan, audit, paging, parse } from '../http.js'

function summary(row: {
  id: string
  fullName: string
  birthDate: Date
  phone: string | null
  guardianName: string | null
  guardianPhone: string | null
  joinedAt: Date
  status: 'ACTIVE' | 'INACTIVE'
  archivedAt: Date | null
}): CoroinhaSummary {
  return {
    id: row.id,
    fullName: row.fullName,
    birthDate: dateOnly(row.birthDate),
    phone: row.phone,
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    joinedAt: dateOnly(row.joinedAt),
    status: row.status,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }
}

export async function coroinhaRoutes(app: FastifyInstance) {
  app.get('/api/coroinhas', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'coroinhas.read')
    const query = parse(listQuerySchema, request.query)
    const where: Prisma.CoroinhaWhereInput = {}
    if (query.q) where.fullName = { contains: query.q, mode: 'insensitive' }
    if (query.status === 'ACTIVE' || query.status === 'INACTIVE') where.status = query.status
    if (query.archived === 'true') where.archivedAt = { not: null }
    else if (query.archived !== 'all') where.archivedAt = null
    const { page, pageSize, skip } = paging(query)
    const [total, rows] = await Promise.all([
      app.prisma.coroinha.count({ where }),
      app.prisma.coroinha.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip,
        take: pageSize,
      }),
    ])
    return { items: rows.map(summary), page, pageSize, total }
  })

  app.post('/api/coroinhas', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'coroinhas.write')
    const body = parse(coroinhaBodySchema, request.body)
    if (body.birthDate > todayInBrazil()) {
      throw new ApiError(422, 'VALIDATION', 'A data de nascimento não pode ser futura.')
    }
    const duplicate = await app.prisma.coroinha.findFirst({
      where: {
        fullName: { equals: body.fullName, mode: 'insensitive' },
        birthDate: asDate(body.birthDate),
        archivedAt: null,
      },
    })
    if (duplicate) {
      throw new ApiError(409, 'CONFLICT', 'Já existe um coroinha com este nome e data de nascimento.')
    }
    const created = await app.prisma.coroinha.create({
      data: {
        fullName: body.fullName.trim(),
        birthDate: asDate(body.birthDate),
        phone: clean(body.phone),
        guardianName: clean(body.guardianName),
        guardianPhone: clean(body.guardianPhone),
        joinedAt: asDate(body.joinedAt),
        notes: clean(body.notes),
        status: body.status,
      },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'coroinha.create',
      entity: 'Coroinha',
      entityId: created.id,
      ip: request.ip,
    })
    return summary(created)
  })

  app.get('/api/coroinhas/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'coroinhas.read')
    const params = request.params as { id: string }
    const row = await app.prisma.coroinha.findUnique({ where: { id: params.id } })
    if (!row) throw notFound('Coroinha não encontrado.')
    const [assignments, participants, blocks] = await Promise.all([
      app.prisma.scaleAssignment.findMany({
        where: { coroinhaId: row.id },
        include: { attendance: true, scale: { include: { celebration: true } } },
        orderBy: { scale: { celebration: { date: 'desc' } } },
      }),
      app.prisma.fundraisingParticipant.findMany({
        where: { coroinhaId: row.id },
        include: { campaign: true },
        orderBy: { campaign: { startsAt: 'desc' } },
      }),
      app.prisma.raffleBlock.findMany({
        where: { coroinhaId: row.id },
        include: { campaign: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    const detail: CoroinhaDetail = {
      ...summary(row),
      notes: row.notes,
      history: {
        scales: assignments.map((item) => ({
          celebrationId: item.scale.celebrationId,
          title: item.scale.celebration.title,
          date: dateOnly(item.scale.celebration.date),
          time: item.scale.celebration.time,
          role: item.role,
          status: item.scale.status,
        })),
        attendance: assignments
          .filter((item) => item.attendance)
          .map((item) => ({
            celebrationId: item.scale.celebrationId,
            title: item.scale.celebration.title,
            date: dateOnly(item.scale.celebration.date),
            status: item.attendance!.status,
          })),
        fundraising: participants.map((item) => ({
          campaignId: item.campaignId,
          name: item.campaign.name,
          date: dateOnly(item.campaign.startsAt),
          status: item.campaign.status,
        })),
        raffleBlocks: blocks.map((item) => ({
          campaignId: item.campaignId,
          campaignName: item.campaign.name,
          label: item.label,
          quantity: item.quantity,
          soldQuantity: item.soldQuantity,
          status: item.status,
        })),
      },
    }
    return detail
  })

  app.patch('/api/coroinhas/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'coroinhas.write')
    const params = request.params as { id: string }
    const body = parse(coroinhaBodySchema, request.body)
    const current = await app.prisma.coroinha.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Coroinha não encontrado.')
    if (current.archivedAt) throw new ApiError(409, 'ARCHIVED', 'Restaure o cadastro antes de editá-lo.')
    if (body.birthDate > todayInBrazil()) {
      throw new ApiError(422, 'VALIDATION', 'A data de nascimento não pode ser futura.')
    }
    const duplicate = await app.prisma.coroinha.findFirst({
      where: {
        id: { not: current.id },
        fullName: { equals: body.fullName, mode: 'insensitive' },
        birthDate: asDate(body.birthDate),
        archivedAt: null,
      },
    })
    if (duplicate) {
      throw new ApiError(409, 'CONFLICT', 'Já existe um coroinha com este nome e data de nascimento.')
    }
    const updated = await app.prisma.coroinha.update({
      where: { id: current.id },
      data: {
        fullName: body.fullName.trim(),
        birthDate: asDate(body.birthDate),
        phone: clean(body.phone),
        guardianName: clean(body.guardianName),
        guardianPhone: clean(body.guardianPhone),
        joinedAt: asDate(body.joinedAt),
        notes: clean(body.notes),
        status: body.status,
      },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'coroinha.update',
      entity: 'Coroinha',
      entityId: updated.id,
      ip: request.ip,
    })
    return summary(updated)
  })

  app.post('/api/coroinhas/:id/archive', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'coroinhas.write')
    const params = request.params as { id: string }
    const current = await app.prisma.coroinha.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Coroinha não encontrado.')
    const updated = await app.prisma.coroinha.update({
      where: { id: current.id },
      data: { status: 'INACTIVE', archivedAt: new Date() },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'coroinha.archive',
      entity: 'Coroinha',
      entityId: updated.id,
      ip: request.ip,
    })
    return summary(updated)
  })

  app.post('/api/coroinhas/:id/restore', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'coroinhas.write')
    const params = request.params as { id: string }
    const current = await app.prisma.coroinha.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Coroinha não encontrado.')
    const duplicate = await app.prisma.coroinha.findFirst({
      where: {
        id: { not: current.id },
        fullName: { equals: current.fullName, mode: 'insensitive' },
        birthDate: current.birthDate,
        archivedAt: null,
      },
    })
    if (duplicate) {
      throw new ApiError(409, 'CONFLICT', 'Já existe um coroinha ativo com este nome e data de nascimento.')
    }
    const updated = await app.prisma.coroinha.update({
      where: { id: current.id },
      data: { status: 'ACTIVE', archivedAt: null },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'coroinha.restore',
      entity: 'Coroinha',
      entityId: updated.id,
      ip: request.ip,
    })
    return summary(updated)
  })
}
