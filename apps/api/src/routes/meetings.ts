import type { MeetingDetail, MeetingSummary } from '@coroinha/contracts'
import { listQuerySchema, meetingBodySchema } from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { addDays, asDate, clean, dateOnly, todayInBrazil } from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import { actor, assertCan, audit, paging, parse } from '../http.js'

function soon(date: string, status: string) {
  if (status !== 'SCHEDULED') return false
  const today = todayInBrazil()
  const tomorrow = dateOnly(addDays(asDate(today), 1))
  return date === today || date === tomorrow
}

function present(meeting: Prisma.MeetingGetPayload<{ include: { organizer: true; participants: true } }>): MeetingDetail {
  const date = dateOnly(meeting.date)
  return {
    id: meeting.id,
    title: meeting.title,
    date,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    location: meeting.location,
    status: meeting.status,
    soon: soon(date, meeting.status),
    agenda: meeting.agenda,
    notes: meeting.notes,
    decisions: meeting.decisions,
    organizer: { id: meeting.organizer.id, name: meeting.organizer.name },
    participants: meeting.participants.map((item) => ({ id: item.id, userId: item.userId, name: item.name })),
  }
}

export async function meetingRoutes(app: FastifyInstance) {
  app.get('/api/meetings', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.read')
    const query = parse(listQuerySchema, request.query)
    const where: Prisma.MeetingWhereInput = {}
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' }
    if (query.status === 'SCHEDULED' || query.status === 'HELD' || query.status === 'CANCELLED') where.status = query.status
    if (query.month) {
      const [year, month] = query.month.split('-').map(Number)
      const start = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 1))
      const end = new Date(Date.UTC(year ?? 2000, month ?? 1, 1))
      where.date = { gte: start, lt: end }
    }
    if (query.from || query.to) {
      where.date = {}
      if (query.from) where.date.gte = asDate(query.from)
      if (query.to) where.date.lte = asDate(query.to)
    }
    const rows = await app.prisma.meeting.findMany({
      where,
      include: { organizer: true, participants: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
    const items: MeetingSummary[] = rows.map((row) => {
      const detail = present(row)
      return {
        id: detail.id,
        title: detail.title,
        date: detail.date,
        startTime: detail.startTime,
        endTime: detail.endTime,
        location: detail.location,
        status: detail.status,
        soon: detail.soon,
      }
    })
    const { page, pageSize, skip } = paging(query)
    return { items: items.slice(skip, skip + pageSize), page, pageSize, total: items.length }
  })

  app.post('/api/meetings', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.write')
    const body = parse(meetingBodySchema, request.body)
    const names = new Set<string>()
    const participants = body.participants ?? []
    for (const participant of participants) {
      const key = participant.name.trim().toLocaleLowerCase('pt-BR')
      if (names.has(key)) throw new ApiError(422, 'VALIDATION', 'Há participantes repetidos na reunião.')
      names.add(key)
    }
    const created = await app.prisma.meeting.create({
      data: {
        title: body.title.trim(),
        agenda: clean(body.agenda),
        date: asDate(body.date),
        startTime: body.startTime,
        endTime: body.endTime,
        location: clean(body.location),
        organizerId: auth.id,
        notes: clean(body.notes),
        decisions: clean(body.decisions),
        status: body.status,
        participants: {
          create: participants.map((participant) => ({
            userId: participant.userId || null,
            name: participant.name.trim(),
          })),
        },
      },
    })
    await audit(app.prisma, { userId: auth.id, action: 'meeting.create', entity: 'Meeting', entityId: created.id, ip: request.ip })
    const meeting = await app.prisma.meeting.findUniqueOrThrow({
      where: { id: created.id },
      include: { organizer: true, participants: true },
    })
    return present(meeting)
  })

  app.get('/api/meetings/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.read')
    const params = request.params as { id: string }
    const meeting = await app.prisma.meeting.findUnique({
      where: { id: params.id },
      include: { organizer: true, participants: true },
    })
    if (!meeting) throw notFound('Reunião não encontrada.')
    return present(meeting)
  })

  app.patch('/api/meetings/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.write')
    const params = request.params as { id: string }
    const body = parse(meetingBodySchema, request.body)
    const current = await app.prisma.meeting.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Reunião não encontrada.')
    const names = new Set<string>()
    const participants = body.participants ?? []
    for (const participant of participants) {
      const key = participant.name.trim().toLocaleLowerCase('pt-BR')
      if (names.has(key)) throw new ApiError(422, 'VALIDATION', 'Há participantes repetidos na reunião.')
      names.add(key)
    }
    await app.prisma.$transaction(async (tx) => {
      await tx.meetingParticipant.deleteMany({ where: { meetingId: current.id } })
      await tx.meeting.update({
        where: { id: current.id },
        data: {
          title: body.title.trim(),
          agenda: clean(body.agenda),
          date: asDate(body.date),
          startTime: body.startTime,
          endTime: body.endTime,
          location: clean(body.location),
          notes: clean(body.notes),
          decisions: clean(body.decisions),
          status: body.status,
          participants: {
            create: participants.map((participant) => ({
              userId: participant.userId || null,
              name: participant.name.trim(),
            })),
          },
        },
      })
    })
    await audit(app.prisma, { userId: auth.id, action: 'meeting.update', entity: 'Meeting', entityId: current.id, ip: request.ip })
    const meeting = await app.prisma.meeting.findUniqueOrThrow({
      where: { id: current.id },
      include: { organizer: true, participants: true },
    })
    return present(meeting)
  })

  app.post('/api/meetings/:id/cancel', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.write')
    const params = request.params as { id: string }
    const current = await app.prisma.meeting.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Reunião não encontrada.')
    await app.prisma.meeting.update({ where: { id: current.id }, data: { status: 'CANCELLED' } })
    await audit(app.prisma, { userId: auth.id, action: 'meeting.cancel', entity: 'Meeting', entityId: current.id, ip: request.ip })
    const meeting = await app.prisma.meeting.findUniqueOrThrow({
      where: { id: current.id },
      include: { organizer: true, participants: true },
    })
    return present(meeting)
  })

  app.delete('/api/meetings/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.write')
    const params = request.params as { id: string }
    const current = await app.prisma.meeting.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Reunião não encontrada.')
    await app.prisma.meeting.delete({ where: { id: current.id } })
    await audit(app.prisma, { userId: auth.id, action: 'meeting.delete', entity: 'Meeting', entityId: current.id, ip: request.ip })
    return { ok: true }
  })
}
