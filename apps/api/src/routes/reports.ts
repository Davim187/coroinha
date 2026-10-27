import {
  ATTENDANCE_LABELS,
  FUNDRAISING_STATUS_LABELS,
  MEETING_STATUS_LABELS,
  RAFFLE_STATUS_LABELS,
  ROLE_LABELS,
  SCALE_STATUS_LABELS,
  hasPermission,
} from '@coroinha/contracts'
import { reportQuerySchema } from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { asDate, dateOnly, money, todayInBrazil } from '../domain.js'
import { ApiError } from '../errors.js'
import { actor, assertCan, audit, csv, parse, sendCsv, sendPdf } from '../http.js'
import { sendMonthlyAttendanceReport } from '../jobs/monthly-report.js'
import {
  buildMonthlyAttendanceReport,
  isValidMonth,
  previousMonth,
} from '../services/attendance-report.js'
import { mailConfigured } from '../services/mail.js'
import { renderMonthlyAttendancePdf } from '../services/report-pdf.js'

const monthlyQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
})

function range(query: { from?: string; to?: string }) {
  if (!query.from && !query.to) return undefined
  const filter: Prisma.DateTimeFilter = {}
  if (query.from) filter.gte = asDate(query.from)
  if (query.to) filter.lte = asDate(query.to)
  return filter
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/reports/coroinhas', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'coroinhas.read')
    const query = parse(reportQuerySchema, request.query)
    const where: Prisma.CoroinhaWhereInput = {}
    if (query.status === 'ACTIVE' || query.status === 'INACTIVE') where.status = query.status
    const rows = await app.prisma.coroinha.findMany({ where, orderBy: { fullName: 'asc' } })
    const items = rows.map((row) => ({
      nome: row.fullName,
      nascimento: dateOnly(row.birthDate),
      telefone: row.phone,
      responsavel: row.guardianName,
      situacao: row.status === 'ACTIVE' ? 'Ativo' : 'Inativo',
      arquivado: row.archivedAt ? 'Sim' : 'Não',
      entrada: dateOnly(row.joinedAt),
    }))
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        'coroinhas.csv',
        csv(
          ['Nome', 'Nascimento', 'Telefone', 'Responsável', 'Situação', 'Arquivado', 'Entrada'],
          items.map((item) => [item.nome, item.nascimento, item.telefone, item.responsavel, item.situacao, item.arquivado, item.entrada]),
        ),
      )
    }
    return { items }
  })

  app.get('/api/reports/escalas', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'scales.read')
    const query = parse(reportQuerySchema, request.query)
    const rows = await app.prisma.celebration.findMany({
      where: { date: range(query) },
      include: { scale: { include: { assignments: { include: { coroinha: true } }, roles: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    })
    const items = rows.flatMap((celebration) => {
      const enabled = (celebration.scale?.roles ?? []).filter((role) => role.enabled)
      if (!celebration.scale || enabled.length === 0) {
        return [{
          celebracao: celebration.title,
          data: dateOnly(celebration.date),
          horario: celebration.time,
          situacao: celebration.scale ? SCALE_STATUS_LABELS[celebration.scale.status] : '',
          funcao: '',
          coroinha: '',
        }]
      }
      return enabled.map((role) => ({
        celebracao: celebration.title,
        data: dateOnly(celebration.date),
        horario: celebration.time,
        situacao: SCALE_STATUS_LABELS[celebration.scale!.status],
        funcao: ROLE_LABELS[role.role],
        coroinha: celebration.scale?.assignments.find((item) => item.role === role.role)?.coroinha.fullName ?? '',
      }))
    })
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        'escalas.csv',
        csv(
          ['Celebração', 'Data', 'Horário', 'Situação', 'Função', 'Coroinha'],
          items.map((item) => [item.celebracao, item.data, item.horario, item.situacao, item.funcao, item.coroinha]),
        ),
      )
    }
    return { items }
  })

  app.get('/api/reports/presencas', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'scales.read')
    const query = parse(reportQuerySchema, request.query)
    const rows = await app.prisma.attendance.findMany({
      where: {
        assignment: {
          coroinhaId: query.coroinhaId,
          scale: { celebration: { date: range(query) } },
        },
      },
      include: { assignment: { include: { coroinha: true, scale: { include: { celebration: true } } } } },
      orderBy: { assignment: { scale: { celebration: { date: 'desc' } } } },
    })
    const items = rows.map((row) => ({
      data: dateOnly(row.assignment.scale.celebration.date),
      celebracao: row.assignment.scale.celebration.title,
      coroinha: row.assignment.coroinha.fullName,
      funcao: ROLE_LABELS[row.assignment.role],
      presenca: ATTENDANCE_LABELS[row.status],
    }))
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        'presencas.csv',
        csv(
          ['Data', 'Celebração', 'Coroinha', 'Função', 'Presença'],
          items.map((item) => [item.data, item.celebracao, item.coroinha, item.funcao, item.presenca]),
        ),
      )
    }
    return { items }
  })

  app.get('/api/reports/rifas', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    if (!hasPermission(auth.role, auth.permissions, 'raffles.read')) {
      const { ApiError } = await import('../errors.js')
      throw new ApiError(403, 'FORBIDDEN', 'Você não tem permissão para esta ação.')
    }
    const query = parse(reportQuerySchema, request.query)
    const rows = await app.prisma.raffleCampaign.findMany({ include: { blocks: true }, orderBy: { startsAt: 'desc' } })
    const items = rows.map((campaign) => ({
      nome: campaign.name,
      situacao: RAFFLE_STATUS_LABELS[campaign.status],
      blocos: campaign.totalNumbers / 10,
      blocoInicial: campaign.firstBlock,
      numeroInicial: campaign.firstNumber,
      minibloco: campaign.miniBlockSize,
      numeros: campaign.totalNumbers,
      vendidos: campaign.blocks.reduce((sum, block) => sum + block.soldQuantity, 0),
      recebido: money(
        campaign.blocks.reduce((sum, block) => sum.plus(block.amountReceived.toString()), new Decimal(0)),
      ),
    }))
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        'rifas.csv',
        csv(
          ['Nome', 'Situação', 'Blocos', 'Bloco inicial', 'Número inicial', 'Minibloco', 'Números', 'Vendidos', 'Recebido'],
          items.map((item) => [item.nome, item.situacao, item.blocos, item.blocoInicial, item.numeroInicial, item.minibloco, item.numeros, item.vendidos, item.recebido]),
        ),
      )
    }
    return { items }
  })

  app.get('/api/reports/arrecadacoes', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'fundraising.read')
    const query = parse(reportQuerySchema, request.query)
    const rows = await app.prisma.fundraisingCampaign.findMany({
      where: { startsAt: range(query) },
      include: { transactions: true, participants: true },
      orderBy: { startsAt: 'desc' },
    })
    const items = rows.map((campaign) => {
      const income = campaign.transactions
        .filter((item) => item.type === 'INCOME')
        .reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0))
      const expense = campaign.transactions
        .filter((item) => item.type === 'EXPENSE')
        .reduce((sum, item) => sum.plus(item.amount.toString()), new Decimal(0))
      return {
        nome: campaign.name,
        categoria: campaign.category,
        situacao: FUNDRAISING_STATUS_LABELS[campaign.status],
        inicio: dateOnly(campaign.startsAt),
        participantes: campaign.participants.length,
        entradas: money(income),
        saidas: money(expense),
        saldo: money(income.minus(expense)),
      }
    })
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        'arrecadacoes.csv',
        csv(
          ['Nome', 'Categoria', 'Situação', 'Início', 'Participantes', 'Entradas', 'Saídas', 'Saldo'],
          items.map((item) => [item.nome, item.categoria, item.situacao, item.inicio, item.participantes, item.entradas, item.saidas, item.saldo]),
        ),
      )
    }
    return { items }
  })

  app.get('/api/reports/reunioes', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'meetings.read')
    const query = parse(reportQuerySchema, request.query)
    const rows = await app.prisma.meeting.findMany({
      where: { date: range(query) },
      include: { organizer: true, participants: true },
      orderBy: { date: 'asc' },
    })
    const items = rows.map((meeting) => ({
      titulo: meeting.title,
      data: dateOnly(meeting.date),
      inicio: meeting.startTime,
      termino: meeting.endTime,
      local: meeting.location,
      situacao: MEETING_STATUS_LABELS[meeting.status],
      responsavel: meeting.organizer.name,
      participantes: meeting.participants.length,
    }))
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        'reunioes.csv',
        csv(
          ['Título', 'Data', 'Início', 'Término', 'Local', 'Situação', 'Responsável', 'Participantes'],
          items.map((item) => [item.titulo, item.data, item.inicio, item.termino, item.local, item.situacao, item.responsavel, item.participantes]),
        ),
      )
    }
    return { items }
  })

  app.get('/api/reports/presencas-mensal', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'scales.read')
    const query = parse(monthlyQuerySchema, request.query)
    const month = query.month ?? previousMonth(asDate(todayInBrazil()))
    if (!isValidMonth(month)) throw new ApiError(422, 'VALIDATION', 'Informe o mês no formato AAAA-MM.')
    const report = await buildMonthlyAttendanceReport(app.prisma, month)
    if (query.format === 'pdf') {
      const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
      const buffer = await renderMonthlyAttendancePdf(settings.parishName, report)
      return sendPdf(reply, `presencas-${month}.pdf`, buffer)
    }
    if (query.format === 'csv') {
      return sendCsv(
        reply,
        `presencas-mensal-${month}.csv`,
        csv(
          ['Coroinha', 'Funções', 'Presentes', 'Ausentes', 'Atrasos', 'Justificadas', 'Sem registro', 'Taxa de presença %'],
          report.people.map((item) => [
            item.name,
            item.assignments,
            item.present,
            item.absent,
            item.late,
            item.justified,
            item.unrecorded,
            item.presenceRate ?? '',
          ]),
        ),
      )
    }
    return report
  })

  app.post('/api/reports/presencas-mensal/enviar', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    assertCan(auth, 'scales.read')
    if (!mailConfigured()) {
      throw new ApiError(503, 'SMTP', 'Configure SMTP_HOST e SMTP_FROM para enviar o relatório por e-mail.')
    }
    const body = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), request.body ?? {})
    const month = body.month ?? previousMonth(asDate(todayInBrazil()))
    if (!isValidMonth(month)) throw new ApiError(422, 'VALIDATION', 'Informe o mês no formato AAAA-MM.')
    const result = await sendMonthlyAttendanceReport(app.prisma, month)
    if (!result.ok) {
      throw new ApiError(409, 'REPORT', result.reason === 'no-users' ? 'Não há usuários ativos para receber o e-mail.' : 'Não foi possível enviar o relatório.')
    }
    await audit(app.prisma, {
      userId: auth.id,
      action: 'report.attendance.email',
      entity: 'Report',
      entityId: month,
      ip: request.ip,
      metadata: { recipients: result.recipients, month },
    })
    return { ok: true, month, recipients: result.recipients, mailConfigured: true }
  })

  app.get('/api/reports/presencas-mensal/status', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'reports.read')
    const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
    return {
      mailConfigured: mailConfigured(),
      lastAttendanceReportMonth: settings.lastAttendanceReportMonth,
      suggestedMonth: previousMonth(asDate(todayInBrazil())),
    }
  })
}
