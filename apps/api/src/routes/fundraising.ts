import {
  FUNDRAISING_STATUS_LABELS,
  TRANSACTION_LABELS,
  type FundraisingDetail,
  type FundraisingListItem,
} from '@coroinha/contracts'
import { fundraisingBodySchema, listQuerySchema, participantSchema, transactionSchema } from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { asDate, clean, dateOnly, money, normalizeMoney, summarizeFundraising } from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import { actor, assertCan, audit, csv, paging, parse, sendCsv, sendPdf } from '../http.js'
import { pdfHeading, renderPdf } from '../pdf.js'

const include = {
  participants: { include: { coroinha: true }, orderBy: { createdAt: 'asc' as const } },
  transactions: { include: { coroinha: true, recordedBy: true, revisions: { include: { user: true }, orderBy: { createdAt: 'desc' as const } } }, orderBy: { date: 'desc' as const } },
} satisfies Prisma.FundraisingCampaignInclude

type CampaignRecord = Prisma.FundraisingCampaignGetPayload<{ include: typeof include }>

function present(campaign: CampaignRecord): FundraisingDetail {
  const totals = summarizeFundraising(
    campaign.transactions.map((item) => ({ type: item.type, amount: item.amount.toString() })),
    campaign.goalAmount?.toString() ?? null,
    campaign.participants.length,
  )
  return {
    id: campaign.id,
    name: campaign.name,
    category: campaign.category,
    status: campaign.status,
    startsAt: dateOnly(campaign.startsAt),
    endsAt: campaign.endsAt ? dateOnly(campaign.endsAt) : null,
    totals,
    description: campaign.description,
    notes: campaign.notes,
    participants: campaign.participants.map((item) => ({
      id: item.id,
      coroinhaId: item.coroinhaId,
      coroinhaName: item.coroinha.fullName,
      note: item.note,
    })),
    transactions: campaign.transactions.map((item) => ({
      id: item.id,
      type: item.type,
      amount: money(item.amount.toString()),
      date: dateOnly(item.date),
      description: item.description,
      coroinhaId: item.coroinhaId,
      coroinhaName: item.coroinha?.fullName ?? null,
      recordedBy: item.recordedBy.name,
      createdAt: item.createdAt.toISOString(),
    })),
    revisions: campaign.transactions.flatMap((item) =>
      item.revisions.map((revision) => ({
        id: revision.id,
        transactionId: revision.transactionId,
        note: revision.note,
        createdAt: revision.createdAt.toISOString(),
        userName: revision.user.name,
      })),
    ),
  }
}

async function load(app: FastifyInstance, id: string) {
  const campaign = await app.prisma.fundraisingCampaign.findUnique({ where: { id }, include })
  if (!campaign) throw notFound('Arrecadação não encontrada.')
  return campaign
}

export async function fundraisingRoutes(app: FastifyInstance) {
  app.get('/api/fundraisings', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.read')
    const query = parse(listQuerySchema, request.query)
    const where: Prisma.FundraisingCampaignWhereInput = {}
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' }
    if (query.status === 'ONGOING' || query.status === 'CLOSED') where.status = query.status
    const rows = await app.prisma.fundraisingCampaign.findMany({ where, include, orderBy: { startsAt: 'desc' } })
    const items: FundraisingListItem[] = rows.map((row) => {
      const detail = present(row)
      return {
        id: detail.id,
        name: detail.name,
        category: detail.category,
        status: detail.status,
        startsAt: detail.startsAt,
        endsAt: detail.endsAt,
        totals: detail.totals,
      }
    })
    const { page, pageSize, skip } = paging(query)
    return { items: items.slice(skip, skip + pageSize), page, pageSize, total: items.length }
  })

  app.post('/api/fundraisings', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.write')
    const body = parse(fundraisingBodySchema, request.body)
    const created = await app.prisma.fundraisingCampaign.create({
      data: {
        name: body.name.trim(),
        description: clean(body.description),
        category: body.category.trim(),
        startsAt: asDate(body.startsAt),
        endsAt: body.endsAt ? asDate(body.endsAt) : null,
        goalAmount: body.goalAmount ? normalizeMoney(body.goalAmount) : null,
        notes: clean(body.notes),
        status: body.status,
      },
    })
    await audit(app.prisma, { userId: auth.id, action: 'fundraising.create', entity: 'FundraisingCampaign', entityId: created.id, ip: request.ip })
    return present(await load(app, created.id))
  })

  app.get('/api/fundraisings/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.read')
    const params = request.params as { id: string }
    return present(await load(app, params.id))
  })

  app.patch('/api/fundraisings/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.write')
    const params = request.params as { id: string }
    const body = parse(fundraisingBodySchema, request.body)
    if (!(await app.prisma.fundraisingCampaign.findUnique({ where: { id: params.id } }))) {
      throw notFound('Arrecadação não encontrada.')
    }
    await app.prisma.fundraisingCampaign.update({
      where: { id: params.id },
      data: {
        name: body.name.trim(),
        description: clean(body.description),
        category: body.category.trim(),
        startsAt: asDate(body.startsAt),
        endsAt: body.endsAt ? asDate(body.endsAt) : null,
        goalAmount: body.goalAmount ? normalizeMoney(body.goalAmount) : null,
        notes: clean(body.notes),
        status: body.status,
      },
    })
    await audit(app.prisma, { userId: auth.id, action: 'fundraising.update', entity: 'FundraisingCampaign', entityId: params.id, ip: request.ip })
    return present(await load(app, params.id))
  })

  app.post('/api/fundraisings/:id/participants', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.write')
    const params = request.params as { id: string }
    const body = parse(participantSchema, request.body)
    const campaign = await load(app, params.id)
    if (campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A arrecadação está encerrada.')
    const person = await app.prisma.coroinha.findUnique({ where: { id: body.coroinhaId } })
    if (!person || person.archivedAt) throw new ApiError(422, 'VALIDATION', 'Selecione um coroinha válido.')
    const existing = await app.prisma.fundraisingParticipant.findUnique({
      where: { campaignId_coroinhaId: { campaignId: campaign.id, coroinhaId: person.id } },
    })
    if (existing) throw new ApiError(409, 'CONFLICT', 'Este coroinha já participa desta arrecadação.')
    await app.prisma.fundraisingParticipant.create({
      data: { campaignId: campaign.id, coroinhaId: person.id, note: clean(body.note) },
    })
    return present(await load(app, campaign.id))
  })

  app.delete('/api/fundraisings/:id/participants/:coroinhaId', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.write')
    const params = request.params as { id: string; coroinhaId: string }
    const campaign = await load(app, params.id)
    if (campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A arrecadação está encerrada.')
    await app.prisma.fundraisingParticipant.deleteMany({
      where: { campaignId: campaign.id, coroinhaId: params.coroinhaId },
    })
    return present(await load(app, campaign.id))
  })

  app.post('/api/fundraisings/:id/transactions', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.write')
    const params = request.params as { id: string }
    const body = parse(transactionSchema, request.body)
    const campaign = await load(app, params.id)
    if (campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A arrecadação está encerrada.')
    const amount = normalizeMoney(body.amount)
    if (Number(amount) <= 0) throw new ApiError(422, 'VALIDATION', 'O valor deve ser maior que zero.')
    if (body.coroinhaId) {
      const person = await app.prisma.coroinha.findUnique({ where: { id: body.coroinhaId } })
      if (!person) throw new ApiError(422, 'VALIDATION', 'Coroinha não encontrado.')
    }
    await app.prisma.$transaction(async (tx) => {
      await tx.financialTransaction.create({
        data: {
          campaignId: campaign.id,
          type: body.type,
          amount,
          date: asDate(body.date),
          description: body.description.trim(),
          coroinhaId: body.coroinhaId || null,
          recordedById: auth.id,
        },
      })
      if (body.addParticipant && body.coroinhaId) {
        await tx.fundraisingParticipant.upsert({
          where: { campaignId_coroinhaId: { campaignId: campaign.id, coroinhaId: body.coroinhaId } },
          update: {},
          create: { campaignId: campaign.id, coroinhaId: body.coroinhaId },
        })
      }
    })
    await audit(app.prisma, { userId: auth.id, action: 'fundraising.transaction', entity: 'FundraisingCampaign', entityId: campaign.id, ip: request.ip })
    return present(await load(app, campaign.id))
  })

  app.patch('/api/fundraisings/:id/transactions/:transactionId', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.write')
    const params = request.params as { id: string; transactionId: string }
    const body = parse(transactionSchema, request.body)
    const current = await app.prisma.financialTransaction.findFirst({
      where: { id: params.transactionId, campaignId: params.id },
      include: { campaign: true },
    })
    if (!current) throw notFound('Lançamento não encontrado.')
    if (current.campaign.status === 'CLOSED' && auth.role !== 'ADMIN') {
      throw new ApiError(409, 'LOCKED', 'A arrecadação está encerrada.')
    }
    if (!body.correctionNote || body.correctionNote.trim().length < 3) {
      throw new ApiError(422, 'VALIDATION', 'Informe o motivo da correção.')
    }
    const amount = normalizeMoney(body.amount)
    if (Number(amount) <= 0) throw new ApiError(422, 'VALIDATION', 'O valor deve ser maior que zero.')
    const before = {
      type: current.type,
      amount: money(current.amount.toString()),
      date: dateOnly(current.date),
      description: current.description,
      coroinhaId: current.coroinhaId,
    }
    await app.prisma.$transaction(async (tx) => {
      const updated = await tx.financialTransaction.update({
        where: { id: current.id },
        data: {
          type: body.type,
          amount,
          date: asDate(body.date),
          description: body.description.trim(),
          coroinhaId: body.coroinhaId || null,
        },
      })
      await tx.financialRevision.create({
        data: {
          transactionId: current.id,
          userId: auth.id,
          before,
          after: {
            type: updated.type,
            amount: money(updated.amount.toString()),
            date: dateOnly(updated.date),
            description: updated.description,
            coroinhaId: updated.coroinhaId,
          },
          note: body.correctionNote?.trim(),
        },
      })
    })
    await audit(app.prisma, { userId: auth.id, action: 'fundraising.transaction', entity: 'FinancialTransaction', entityId: current.id, ip: request.ip })
    return present(await load(app, current.campaignId))
  })

  app.get('/api/fundraisings/:id/export.csv', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.read')
    const params = request.params as { id: string }
    const campaign = present(await load(app, params.id))
    const content = csv(
      ['Data', 'Tipo', 'Descrição', 'Valor', 'Coroinha', 'Registrado por'],
      campaign.transactions.map((item) => [item.date, TRANSACTION_LABELS[item.type], item.description, item.amount, item.coroinhaName, item.recordedBy]),
    )
    return sendCsv(reply, `arrecadacao-${campaign.id}.csv`, content)
  })

  app.get('/api/fundraisings/:id/export.pdf', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'fundraising.read')
    const params = request.params as { id: string }
    const campaign = present(await load(app, params.id))
    const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
    const buffer = await renderPdf((doc) => {
      pdfHeading(doc, settings.parishName, 'Demonstrativo da arrecadação')
      doc.font('Times-Bold').fontSize(16).text(campaign.name)
      doc.moveDown(0.3)
      doc.font('Times-Roman').fontSize(12)
      doc.text(`Situação: ${FUNDRAISING_STATUS_LABELS[campaign.status]}`)
      doc.text(`Entradas: R$ ${campaign.totals.income}`)
      doc.text(`Saídas: R$ ${campaign.totals.expense}`)
      doc.text(`Saldo: R$ ${campaign.totals.balance}`)
      doc.text(`Coroinhas participantes: ${campaign.totals.participantCount}`)
      doc.moveDown(0.8)
      campaign.transactions.forEach((item) => {
        doc.font('Times-Bold').text(`${item.date.split('-').reverse().join('/')} — ${TRANSACTION_LABELS[item.type]} — R$ ${item.amount}`)
        doc.font('Times-Roman').text(item.description)
        doc.moveDown(0.25)
      })
    })
    return sendPdf(reply, `arrecadacao-${campaign.id}.pdf`, buffer)
  })
}
