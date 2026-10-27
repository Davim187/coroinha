import type { MeetingAttendanceView, MeetingDetail, MeetingSummary } from '@coroinha/contracts'
import { listQuerySchema, meetingAttendanceSchema, meetingBodySchema } from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { addDays, asDate, clean, dateOnly, todayInBrazil } from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import { actor, assertCan, audit, paging, parse } from '../http.js'

const meetingInclude = {
  organizer: true,
  participants: true,
  attendances: true,
} satisfies Prisma.MeetingInclude

type MeetingRecord = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>

function soon(date: string, status: string) {
  if (status !== 'SCHEDULED') return false
  const today = todayInBrazil()
  const tomorrow = dateOnly(addDays(asDate(today), 1))
  return date === today || date === tomorrow
}

async function activeCoroinhaCount(app: FastifyInstance) {
  return app.prisma.coroinha.count({ where: { status: 'ACTIVE', archivedAt: null } })
}

function present(meeting: MeetingRecord, totalCoroinhas: number): MeetingDetail {
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
    attendanceCounted: meeting.attendances.length,
    attendanceTotal: totalCoroinhas,
    agenda: meeting.agenda,
    notes: meeting.notes,
    decisions: meeting.decisions,
    organizer: { id: meeting.organizer.id, name: meeting.organizer.name },
    participants: meeting.participants.map((item) => ({ id: item.id, userId: item.userId, name: item.name })),
  }
}

function summaryOf(meeting: MeetingRecord, totalCoroinhas: number): MeetingSummary {
  const detail = present(meeting, totalCoroinhas)
  return {
    id: detail.id,
    title: detail.title,
    date: detail.date,
    startTime: detail.startTime,
    endTime: detail.endTime,
    location: detail.location,
    status: detail.status,
    soon: detail.soon,
    attendanceCounted: detail.attendanceCounted,
    attendanceTotal: detail.attendanceTotal,
  }
}

async function loadMeeting(app: FastifyInstance, id: string) {
  const meeting = await app.prisma.meeting.findUnique({
    where: { id },
    include: meetingInclude,
  })
  if (!meeting) throw notFound('Reunião não encontrada.')
  return meeting
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
    if (query.when === 'upcoming') {
      where.date = { ...(where.date as Prisma.DateTimeFilter | undefined), gte: asDate(todayInBrazil()) }
      where.status = where.status ?? { in: ['SCHEDULED', 'HELD'] }
    }
    if (query.when === 'past') {
      where.date = { ...(where.date as Prisma.DateTimeFilter | undefined), lt: asDate(todayInBrazil()) }
    }
    const [rows, totalCoroinhas] = await Promise.all([
      app.prisma.meeting.findMany({
        where,
        include: meetingInclude,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      activeCoroinhaCount(app),
    ])
    const items = rows.map((row) => summaryOf(row, totalCoroinhas))
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
    const meeting = await loadMeeting(app, created.id)
    return present(meeting, await activeCoroinhaCount(app))
  })

  app.get('/api/meetings/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.read')
    const params = request.params as { id: string }
    const meeting = await loadMeeting(app, params.id)
    return present(meeting, await activeCoroinhaCount(app))
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
    const meeting = await loadMeeting(app, current.id)
    return present(meeting, await activeCoroinhaCount(app))
  })

  app.post('/api/meetings/:id/cancel', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.write')
    const params = request.params as { id: string }
    const current = await app.prisma.meeting.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Reunião não encontrada.')
    await app.prisma.meeting.update({ where: { id: current.id }, data: { status: 'CANCELLED' } })
    await audit(app.prisma, { userId: auth.id, action: 'meeting.cancel', entity: 'Meeting', entityId: current.id, ip: request.ip })
    const meeting = await loadMeeting(app, current.id)
    return present(meeting, await activeCoroinhaCount(app))
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

  app.get('/api/meetings/:id/attendance', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.read')
    const params = request.params as { id: string }
    const meeting = await app.prisma.meeting.findUnique({
      where: { id: params.id },
      include: { attendances: true },
    })
    if (!meeting) throw notFound('Reunião não encontrada.')
    const coroinhas = await app.prisma.coroinha.findMany({
      where: { status: 'ACTIVE', archivedAt: null },
      orderBy: { fullName: 'asc' },
    })
    const byId = new Map(meeting.attendances.map((item) => [item.coroinhaId, item]))
    const payload: MeetingAttendanceView = {
      meetingId: meeting.id,
      title: meeting.title,
      date: dateOnly(meeting.date),
      status: meeting.status,
      items: coroinhas.map((person) => {
        const row = byId.get(person.id)
        return {
          coroinhaId: person.id,
          coroinhaName: person.fullName,
          status: row?.status ?? null,
          notes: row?.notes ?? null,
        }
      }),
    }
    return payload
  })

  app.put('/api/meetings/:id/attendance', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'meetings.write')
    const params = request.params as { id: string }
    const body = parse(meetingAttendanceSchema, request.body)
    const meeting = await app.prisma.meeting.findUnique({ where: { id: params.id } })
    if (!meeting) throw notFound('Reunião não encontrada.')
    if (meeting.status === 'CANCELLED') {
      throw new ApiError(409, 'LOCKED', 'Não é possível registrar presença em reunião cancelada.')
    }
    const coroinhas = await app.prisma.coroinha.findMany({
      where: { status: 'ACTIVE', archivedAt: null },
      select: { id: true },
    })
    const allowed = new Set(coroinhas.map((item) => item.id))
    const received = new Set(body.items.map((item) => item.coroinhaId))
    if (received.size !== body.items.length) {
      throw new ApiError(422, 'VALIDATION', 'Há coroinhas repetidos na presença.')
    }
    for (const id of received) {
      if (!allowed.has(id)) throw new ApiError(422, 'VALIDATION', 'Selecione apenas coroinhas ativos.')
    }
    if (allowed.size !== received.size || [...allowed].some((id) => !received.has(id))) {
      throw new ApiError(422, 'VALIDATION', 'Registre a presença de todos os coroinhas ativos.')
    }
    await app.prisma.$transaction(async (tx) => {
      for (const item of body.items) {
        await tx.meetingAttendance.upsert({
          where: { meetingId_coroinhaId: { meetingId: meeting.id, coroinhaId: item.coroinhaId } },
          create: {
            meetingId: meeting.id,
            coroinhaId: item.coroinhaId,
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
      if (body.markHeld !== false && meeting.status === 'SCHEDULED') {
        await tx.meeting.update({ where: { id: meeting.id }, data: { status: 'HELD' } })
      }
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'meeting.attendance',
      entity: 'Meeting',
      entityId: meeting.id,
      ip: request.ip,
    })
    return { ok: true }
  })
}
