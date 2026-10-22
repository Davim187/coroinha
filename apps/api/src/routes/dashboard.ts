import { hasPermission, type DashboardData } from '@coroinha/contracts'
import type { FastifyInstance } from 'fastify'
import Decimal from 'decimal.js'
import { addDays, asDate, dateOnly, money, todayInBrazil } from '../domain.js'
import { actor } from '../http.js'
import { summaryOf } from '../services/scales.js'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (request) => {
    const auth = actor(request)
    const today = asDate(todayInBrazil())
    const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
    const canScales = hasPermission(auth.role, auth.permissions, 'scales.read')
    const canRaffles = hasPermission(auth.role, auth.permissions, 'raffles.read')
    const canFundraising = hasPermission(auth.role, auth.permissions, 'fundraising.read')
    const canMeetings = hasPermission(auth.role, auth.permissions, 'meetings.read')

    const [coroinhasActive, celebrations, attendanceRows, raffles, fundraisings, meetings, participation] =
      await Promise.all([
        app.prisma.coroinha.count({ where: { status: 'ACTIVE', archivedAt: null } }),
        canScales
          ? app.prisma.celebration.findMany({
              where: { date: { gte: today } },
              include: { scale: { include: { roles: true, assignments: { include: { attendance: true } } } } },
              orderBy: [{ date: 'asc' }, { time: 'asc' }],
              take: 30,
            })
          : Promise.resolve([]),
        canScales
          ? app.prisma.celebration.findMany({
              where: { date: { lte: today }, scale: { status: { in: ['PUBLISHED', 'COMPLETED'] } } },
              include: { scale: { include: { assignments: { include: { attendance: true } }, roles: true } } },
              orderBy: { date: 'desc' },
              take: 8,
            })
          : Promise.resolve([]),
        canRaffles
          ? app.prisma.raffleCampaign.findMany({ where: { status: 'ACTIVE' }, include: { blocks: true } })
          : Promise.resolve([]),
        canFundraising
          ? app.prisma.fundraisingCampaign.findMany({
              where: { status: 'ONGOING' },
              include: { transactions: true, participants: true },
            })
          : Promise.resolve([]),
        canMeetings
          ? app.prisma.meeting.findMany({
              where: { status: 'SCHEDULED', date: { gte: today } },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
              take: 5,
            })
          : Promise.resolve([]),
        canScales
          ? app.prisma.scaleAssignment.groupBy({
              by: ['coroinhaId'],
              where: { scale: { celebration: { date: { gte: addDays(today, -settings.balanceWindowDays) } } } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ])

    const upcoming = celebrations.map(summaryOf).slice(0, 5)
    const pendingRoles = celebrations.reduce((sum, celebration) => {
      const summary = summaryOf(celebration)
      return sum + Math.max(summary.requiredRoles - summary.filledRoles, 0)
    }, 0)
    const attendancePending = canScales
      ? await app.prisma.celebration.count({
          where: {
            date: { lte: today },
            scale: {
              status: { in: ['PUBLISHED', 'COMPLETED'] },
              assignments: { some: { attendance: { is: null } } },
            },
          },
        })
      : 0

    const raffleReceived = raffles.reduce(
      (sum, campaign) =>
        sum.plus(campaign.blocks.reduce((inner, block) => inner.plus(block.amountReceived.toString()), new Decimal(0))),
      new Decimal(0),
    )
    const fundraisingBalance = fundraisings.reduce((sum, campaign) => {
      const income = campaign.transactions
        .filter((item) => item.type === 'INCOME')
        .reduce((inner, item) => inner.plus(item.amount.toString()), new Decimal(0))
      const expense = campaign.transactions
        .filter((item) => item.type === 'EXPENSE')
        .reduce((inner, item) => inner.plus(item.amount.toString()), new Decimal(0))
      return sum.plus(income.minus(expense))
    }, new Decimal(0))
    const participantIds = new Set(fundraisings.flatMap((campaign) => campaign.participants.map((item) => item.coroinhaId)))

    const names = participation.length
      ? await app.prisma.coroinha.findMany({
          where: { id: { in: participation.map((item) => item.coroinhaId) } },
          select: { id: true, fullName: true },
        })
      : []
    const nameOf = new Map(names.map((person) => [person.id, person.fullName]))

    const data: DashboardData = {
      parishName: settings.parishName,
      coroinhasActive,
      upcomingCelebrations: upcoming,
      pendingRoles,
      attendancePending,
      rafflesActive: canRaffles ? raffles.length : null,
      raffleReceived: canRaffles ? money(raffleReceived) : null,
      fundraisingBalance: canFundraising ? money(fundraisingBalance) : null,
      fundraisingParticipants: canFundraising ? participantIds.size : null,
      upcomingMeetings: meetings.map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        date: dateOnly(meeting.date),
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        location: meeting.location,
        status: meeting.status,
        soon: true,
      })),
      attendanceChart: attendanceRows
        .slice()
        .reverse()
        .map((celebration) => {
          const records = (celebration.scale?.assignments ?? []).map((item) => item.attendance?.status)
          return {
            label: `${dateOnly(celebration.date).slice(8, 10)}/${dateOnly(celebration.date).slice(5, 7)}`,
            present: records.filter((status) => status === 'PRESENT' || status === 'LATE').length,
            absent: records.filter((status) => status === 'ABSENT' || status === 'JUSTIFIED').length,
          }
        }),
      participationChart: participation
        .map((item) => ({ name: nameOf.get(item.coroinhaId) ?? 'Coroinha', count: item._count._all }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 8),
    }
    return data
  })

  app.get('/api/settings', async (request) => {
    actor(request)
    const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
    return {
      parishName: settings.parishName,
      celebrationDurationMinutes: settings.celebrationDurationMinutes,
      balanceWindowDays: settings.balanceWindowDays,
    }
  })

  app.patch('/api/settings', async (request) => {
    const auth = actor(request)
    if (auth.role !== 'ADMIN') {
      const { ApiError } = await import('../errors.js')
      throw new ApiError(403, 'FORBIDDEN', 'Apenas um administrador pode alterar as configurações.')
    }
    const { settingsSchema } = await import('@coroinha/validators')
    const { parse, audit } = await import('../http.js')
    const body = parse(settingsSchema, request.body)
    const settings = await app.prisma.setting.update({
      where: { id: 'default' },
      data: body,
    })
    await audit(app.prisma, { userId: auth.id, action: 'settings.update', entity: 'Setting', entityId: settings.id, ip: request.ip })
    return {
      parishName: settings.parishName,
      celebrationDurationMinutes: settings.celebrationDurationMinutes,
      balanceWindowDays: settings.balanceWindowDays,
    }
  })

  app.get('/api/audit', async (request) => {
    const auth = actor(request)
    if (auth.role !== 'ADMIN') {
      const { ApiError } = await import('../errors.js')
      throw new ApiError(403, 'FORBIDDEN', 'Apenas um administrador pode consultar a auditoria.')
    }
    const rows = await app.prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 80,
    })
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
        userName: row.user?.name ?? null,
      })),
    }
  })
}
