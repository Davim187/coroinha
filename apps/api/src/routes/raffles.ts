import {
  BLOCK_STATUS_LABELS,
  RAFFLE_STATUS_LABELS,
  type RaffleBlockView,
  type RaffleDetail,
  type RaffleListItem,
} from '@coroinha/contracts'
import { listQuerySchema, raffleAssignSchema, raffleBatchSchema, raffleBlockSchema, raffleBodySchema } from '@coroinha/validators'
import type { Prisma, RaffleBlock, RaffleCampaign } from '@prisma/client'
import Decimal from 'decimal.js'
import type { FastifyInstance } from 'fastify'
import {
  asDate,
  assertBlockQuantities,
  clean,
  committedNumbers,
  dateOnly,
  deriveBlockStatus,
  money,
  normalizeMoney,
  assignSeries,
  assertPickupFits,
  compareMiniBlockLabels,
  buildAccountability,
  nextMiniBlockNumber,
  planMiniBlockQuantities,
  reassembleBlocks,
  summarizeRaffle,
} from '../domain.js'
import { ApiError, notFound } from '../errors.js'
import { actor, assertCan, audit, csv, paging, parse, sendCsv, sendPdf } from '../http.js'
import { pdfHeading, renderPdf } from '../pdf.js'

function blockMath(block: RaffleBlock) {
  return {
    quantity: block.quantity,
    soldQuantity: block.soldQuantity,
    unsoldQuantity: block.unsoldQuantity,
    unsoldReturned: block.unsoldReturned,
    amountReceived: block.amountReceived.toString(),
    status: block.status,
  }
}

async function presentCampaign(app: FastifyInstance, id: string): Promise<RaffleDetail> {
  const campaign = await app.prisma.raffleCampaign.findUnique({
    where: { id },
    include: {
      batches: { orderBy: { createdAt: 'asc' } },
      blocks: {
        include: { events: { include: { user: true }, orderBy: { createdAt: 'desc' } } },
      },
    },
  })
  if (!campaign) throw notFound('Rifa não encontrada.')
  const batchIndex = new Map(campaign.batches.map((batch, index) => [batch.id, index]))
  const orderedBlocks = [...campaign.blocks].sort((left, right) => {
    const byBatch = (batchIndex.get(left.batchId) ?? 0) - (batchIndex.get(right.batchId) ?? 0)
    if (byBatch !== 0) return byBatch
    return compareMiniBlockLabels(left.label, right.label)
  })
  const summary = summarizeRaffle(
    campaign.totalNumbers,
    campaign.unitPrice.toString(),
    campaign.goalAmount?.toString() ?? null,
    orderedBlocks.map(blockMath),
  )
  const rangeByBlock = new Map<string, { startNumber: number; endNumber: number; originalBlockStart: number; originalBlockEnd: number }>()
  for (const batch of campaign.batches) {
    const batchBlocks = orderedBlocks.filter((block) => block.batchId === batch.id)
    const series = assignSeries(batchBlocks.map((block) => block.quantity), batch.firstNumber, batch.firstBlock)
    batchBlocks.forEach((block, index) => {
      const range = series[index]
      if (range) rangeByBlock.set(block.id, range)
    })
  }
  const planned = planMiniBlockQuantities(campaign.blockCount, campaign.miniBlockSize)
  const plannedSeries = assignSeries(planned.quantities, campaign.firstNumber, campaign.firstBlock)
  const blocks: RaffleBlockView[] = orderedBlocks.map((block) => {
    const pending = money(
      new Decimal(campaign.unitPrice.toString()).times(block.soldQuantity).minus(block.amountReceived.toString()),
    )
    const range = rangeByBlock.get(block.id) ?? {
      startNumber: campaign.firstNumber,
      endNumber: campaign.firstNumber,
      originalBlockStart: campaign.firstBlock,
      originalBlockEnd: campaign.firstBlock,
    }
    return {
      id: block.id,
      label: block.label,
      coroinhaId: block.coroinhaId,
      participantName: block.participantName,
      quantity: block.quantity,
      startNumber: range.startNumber,
      endNumber: range.endNumber,
      originalBlockStart: range.originalBlockStart,
      originalBlockEnd: range.originalBlockEnd,
      soldQuantity: block.soldQuantity,
      unsoldQuantity: block.unsoldQuantity,
      unsoldReturned: block.unsoldReturned,
      amountReceived: money(block.amountReceived.toString()),
      pendingAmount: pending,
      status: block.status,
      notes: block.notes,
      events: block.events.map((event) => ({
        id: event.id,
        action: event.action,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
        userName: event.user.name,
      })),
    }
  })
  return {
    id: campaign.id,
    name: campaign.name,
    prize: campaign.prize,
    status: campaign.status,
    startsAt: dateOnly(campaign.startsAt),
    endsAt: dateOnly(campaign.endsAt),
    description: campaign.description,
    unitPrice: money(campaign.unitPrice.toString()),
    blockCount: campaign.blockCount,
    miniBlockSize: campaign.miniBlockSize,
    firstNumber: campaign.firstNumber,
    firstBlock: campaign.firstBlock,
    totalNumbers: campaign.totalNumbers,
    drawAt: campaign.drawAt ? dateOnly(campaign.drawAt) : null,
    notes: campaign.notes,
    summary,
    batches: campaign.batches.map((batch) => ({
      id: batch.id,
      blockCount: batch.blockCount,
      miniBlockSize: batch.miniBlockSize,
      firstNumber: batch.firstNumber,
      firstBlock: batch.firstBlock,
      totalNumbers: batch.blockCount * 10,
    })),
    blocks,
    plannedMiniBlocks: planned.quantities.map((quantity, index) => ({
      label: `Minibloco ${String(index + 1).padStart(2, '0')}`,
      quantity,
      ...plannedSeries[index]!,
    })),
    joinedBlocks: campaign.batches.flatMap((batch) =>
      reassembleBlocks(
        orderedBlocks.filter((block) => block.batchId === batch.id).map(blockMath),
        batch.blockCount,
        campaign.unitPrice.toString(),
        batch.firstNumber,
        batch.firstBlock,
      ),
    ),
    accountability: buildAccountability(
      blocks.map((block) => ({
        coroinhaId: block.coroinhaId,
        participantName: block.participantName,
        label: block.label,
        startNumber: block.startNumber,
        endNumber: block.endNumber,
        quantity: block.quantity,
        soldQuantity: block.soldQuantity,
        unsoldQuantity: block.unsoldQuantity,
        amountReceived: block.amountReceived,
      })),
      campaign.unitPrice.toString(),
    ),
  }
}

function listItem(campaign: RaffleCampaign & { blocks: RaffleBlock[] }): RaffleListItem {
  return {
    id: campaign.id,
    name: campaign.name,
    prize: campaign.prize,
    status: campaign.status,
    startsAt: dateOnly(campaign.startsAt),
    endsAt: dateOnly(campaign.endsAt),
    summary: summarizeRaffle(
      campaign.totalNumbers,
      campaign.unitPrice.toString(),
      campaign.goalAmount?.toString() ?? null,
      campaign.blocks.map(blockMath),
    ),
  }
}

function snapshot(block: RaffleBlock) {
  return {
    label: block.label,
    quantity: block.quantity,
    soldQuantity: block.soldQuantity,
    unsoldQuantity: block.unsoldQuantity,
    unsoldReturned: block.unsoldReturned,
    amountReceived: money(block.amountReceived.toString()),
    status: block.status,
    participantName: block.participantName,
    coroinhaId: block.coroinhaId,
  }
}

async function insertMiniBlocks(
  tx: Prisma.TransactionClient,
  input: { campaignId: string; batchId: string; quantities: number[]; userId: string; firstLabel: number; note: string },
) {
  const blocks = await tx.raffleBlock.createManyAndReturn({
    data: input.quantities.map((quantity, index) => ({
      campaignId: input.campaignId,
      batchId: input.batchId,
      label: `Minibloco ${String(input.firstLabel + index).padStart(2, '0')}`,
      participantName: 'A distribuir',
      quantity,
      soldQuantity: 0,
      unsoldQuantity: 0,
      amountReceived: '0.00',
      status: 'OPEN' as const,
    })),
  })
  await tx.raffleBlockEvent.createMany({
    data: blocks.map((block) => ({
      blockId: block.id,
      userId: input.userId,
      action: 'Divisão',
      after: snapshot(block),
      note: input.note,
    })),
  })
}

export async function raffleRoutes(app: FastifyInstance) {
  app.get('/api/raffles', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.read')
    const query = parse(listQuerySchema, request.query)
    const where: Prisma.RaffleCampaignWhereInput = {}
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' }
    if (query.status === 'DRAFT' || query.status === 'ACTIVE' || query.status === 'CLOSED') where.status = query.status
    const rows = await app.prisma.raffleCampaign.findMany({
      where,
      include: { blocks: true },
      orderBy: { startsAt: 'desc' },
    })
    const { page, pageSize, skip } = paging(query)
    return { items: rows.slice(skip, skip + pageSize).map(listItem), page, pageSize, total: rows.length }
  })

  app.post('/api/raffles', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const body = parse(raffleBodySchema, request.body)
    const unitPrice = normalizeMoney(body.unitPrice)
    if (Number(unitPrice) <= 0) throw new ApiError(422, 'VALIDATION', 'O valor do número deve ser maior que zero.')
    let planned
    try {
      planned = planMiniBlockQuantities(body.blockCount, body.miniBlockSize)
    } catch (error) {
      throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'Divisão inválida.')
    }
    const created = await app.prisma.raffleCampaign.create({
      data: {
        name: body.name.trim(),
        description: clean(body.description),
        prize: body.prize.trim(),
        unitPrice,
        blockCount: body.blockCount,
        miniBlockSize: body.miniBlockSize,
        firstNumber: body.firstNumber,
        firstBlock: body.firstBlock,
        totalNumbers: planned.totalNumbers,
        startsAt: asDate(body.startsAt),
        endsAt: asDate(body.endsAt),
        drawAt: typeof body.drawAt === 'string' ? asDate(body.drawAt) : null,
        goalAmount: typeof body.goalAmount === 'string' ? normalizeMoney(body.goalAmount) : null,
        notes: clean(body.notes),
        status: body.status,
        batches: {
          create: {
            blockCount: body.blockCount,
            miniBlockSize: body.miniBlockSize,
            firstNumber: body.firstNumber,
            firstBlock: body.firstBlock,
          },
        },
      },
    })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.create', entity: 'RaffleCampaign', entityId: created.id, ip: request.ip })
    return presentCampaign(app, created.id)
  })

  app.get('/api/raffles/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.read')
    const params = request.params as { id: string }
    return presentCampaign(app, params.id)
  })

  app.patch('/api/raffles/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string }
    const body = parse(raffleBodySchema, request.body)
    const current = await app.prisma.raffleCampaign.findUnique({ where: { id: params.id }, include: { blocks: true, batches: { orderBy: { createdAt: 'asc' } } } })
    if (!current) throw notFound('Rifa não encontrada.')
    if (
      current.blocks.length > 0 &&
      (body.blockCount !== current.blockCount ||
        body.miniBlockSize !== current.miniBlockSize ||
        body.firstNumber !== current.firstNumber)
    ) {
      throw new ApiError(422, 'VALIDATION', 'Não é possível alterar a divisão nem a numeração depois que os miniblocos foram criados.')
    }
    const unitPrice = normalizeMoney(body.unitPrice)
    if (Number(unitPrice) <= 0) throw new ApiError(422, 'VALIDATION', 'O valor do número deve ser maior que zero.')
    let planned
    try {
      planned = planMiniBlockQuantities(body.blockCount, body.miniBlockSize)
    } catch (error) {
      throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'Divisão inválida.')
    }
    const distributed = current.blocks.reduce((sum, block) => sum + committedNumbers(blockMath(block)), 0)
    const firstBatch = current.batches[0]
    if (!firstBatch) throw new ApiError(409, 'LOCKED', 'A rifa não tem o lote inicial.')
    if (current.blocks.length === 0 && planned.totalNumbers < distributed) {
      throw new ApiError(422, 'VALIDATION', 'A quantidade total não pode ser menor que os números já distribuídos.')
    }
    if (current.blocks.length > 0 && body.firstBlock !== firstBatch.firstBlock) {
      try {
        assertPickupFits(current.batches.slice(1), { blockCount: firstBatch.blockCount, firstNumber: firstBatch.firstNumber, firstBlock: body.firstBlock })
      } catch (error) {
        throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'O bloco inicial cruza outro lote.')
      }
    }
    const totalNumbers = current.blocks.length === 0
      ? planned.totalNumbers
      : current.batches.reduce((sum, batch) => sum + batch.blockCount * 10, 0)
    await app.prisma.$transaction([
      app.prisma.raffleCampaign.update({
        where: { id: current.id },
        data: {
          name: body.name.trim(),
          description: clean(body.description),
          prize: body.prize.trim(),
          unitPrice,
          blockCount: body.blockCount,
          miniBlockSize: body.miniBlockSize,
          firstNumber: body.firstNumber,
          firstBlock: body.firstBlock,
          totalNumbers,
          startsAt: asDate(body.startsAt),
          endsAt: asDate(body.endsAt),
          drawAt: typeof body.drawAt === 'string' ? asDate(body.drawAt) : null,
          goalAmount: typeof body.goalAmount === 'string' ? normalizeMoney(body.goalAmount) : null,
          notes: clean(body.notes),
          status: body.status,
        },
      }),
      app.prisma.raffleBatch.update({
        where: { id: firstBatch.id },
        data: current.blocks.length === 0
          ? { blockCount: body.blockCount, miniBlockSize: body.miniBlockSize, firstNumber: body.firstNumber, firstBlock: body.firstBlock }
          : { firstBlock: body.firstBlock },
      }),
    ])
    await audit(app.prisma, { userId: auth.id, action: 'raffle.update', entity: 'RaffleCampaign', entityId: current.id, ip: request.ip })
    return presentCampaign(app, current.id)
  })

  app.delete('/api/raffles/:id', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string }
    const current = await app.prisma.raffleCampaign.findUnique({ where: { id: params.id } })
    if (!current) throw notFound('Rifa não encontrada.')
    await app.prisma.$transaction(async (tx) => {
      await tx.raffleBlockEvent.deleteMany({ where: { block: { campaignId: current.id } } })
      await tx.raffleBlock.deleteMany({ where: { campaignId: current.id } })
      await tx.raffleBatch.deleteMany({ where: { campaignId: current.id } })
      await tx.raffleCampaign.delete({ where: { id: current.id } })
    })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.delete', entity: 'RaffleCampaign', entityId: current.id, ip: request.ip })
    return { ok: true }
  })

  app.post('/api/raffles/:id/split', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string }
    const campaign = await app.prisma.raffleCampaign.findUnique({ where: { id: params.id }, include: { blocks: true, batches: { orderBy: { createdAt: 'asc' } } } })
    if (!campaign) throw notFound('Rifa não encontrada.')
    if (campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A campanha está encerrada.')
    if (campaign.blocks.length > 0) {
      throw new ApiError(409, 'LOCKED', 'Os blocos desta rifa já foram desfeitos.')
    }
    const batch = campaign.batches[0]
    if (!batch) throw new ApiError(409, 'LOCKED', 'A rifa não tem o lote inicial.')
    const planned = planMiniBlockQuantities(batch.blockCount, batch.miniBlockSize)
    await app.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RaffleCampaign" WHERE id = ${campaign.id} FOR UPDATE`
      await insertMiniBlocks(tx, {
        campaignId: campaign.id,
        batchId: batch.id,
        quantities: planned.quantities,
        userId: auth.id,
        firstLabel: 1,
        note: 'Bloco de 10 desfeito em miniblocos.',
      })
    }, { maxWait: 10_000, timeout: 20_000 })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.split', entity: 'RaffleCampaign', entityId: campaign.id, ip: request.ip })
    return presentCampaign(app, campaign.id)
  })

  app.post('/api/raffles/:id/batches', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string }
    const body = parse(raffleBatchSchema, request.body)
    const campaign = await app.prisma.raffleCampaign.findUnique({ where: { id: params.id }, include: { blocks: true, batches: true } })
    if (!campaign) throw notFound('Rifa não encontrada.')
    if (campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A campanha está encerrada.')
    if (campaign.blocks.length === 0) {
      throw new ApiError(409, 'LOCKED', 'Desfaça os blocos atuais antes de acrescentar outros.')
    }
    let planned
    try {
      planned = planMiniBlockQuantities(body.blockCount, body.miniBlockSize)
      assertPickupFits(campaign.batches, body)
    } catch (error) {
      throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'Não foi possível acrescentar estes blocos.')
    }
    await app.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RaffleCampaign" WHERE id = ${campaign.id} FOR UPDATE`
      const currentBatches = await tx.raffleBatch.findMany({ where: { campaignId: campaign.id } })
      try {
        assertPickupFits(currentBatches, body)
      } catch (error) {
        throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'Não foi possível acrescentar estes blocos.')
      }
      const currentBlocks = await tx.raffleBlock.findMany({ where: { campaignId: campaign.id }, select: { label: true } })
      const batch = await tx.raffleBatch.create({
        data: {
          campaignId: campaign.id,
          blockCount: body.blockCount,
          miniBlockSize: body.miniBlockSize,
          firstNumber: body.firstNumber,
          firstBlock: body.firstBlock,
        },
      })
      await insertMiniBlocks(tx, {
        campaignId: campaign.id,
        batchId: batch.id,
        quantities: planned.quantities,
        userId: auth.id,
        firstLabel: nextMiniBlockNumber(currentBlocks.map((block) => block.label)),
        note: 'Novos blocos acrescentados à rifa.',
      })
      await tx.raffleCampaign.update({
        where: { id: campaign.id },
        data: { totalNumbers: campaign.totalNumbers + planned.totalNumbers },
      })
    }, { maxWait: 10_000, timeout: 20_000 })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.batch', entity: 'RaffleCampaign', entityId: campaign.id, ip: request.ip })
    return presentCampaign(app, campaign.id)
  })

  app.post('/api/raffles/:id/blocks', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string }
    const body = parse(raffleBlockSchema, request.body)
    const campaign = await app.prisma.raffleCampaign.findUnique({ where: { id: params.id }, include: { blocks: true } })
    if (!campaign) throw notFound('Rifa não encontrada.')
    if (campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A campanha está encerrada.')
    const received = normalizeMoney(body.amountReceived)
    const draft = {
      quantity: body.quantity,
      soldQuantity: body.soldQuantity,
      unsoldQuantity: body.unsoldQuantity,
      unsoldReturned: false,
      amountReceived: received,
    }
    try {
      assertBlockQuantities(draft, campaign.unitPrice.toString())
    } catch (error) {
      throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'Quantidade inválida.')
    }
    const used = campaign.blocks.reduce((sum, block) => sum + committedNumbers(blockMath(block)), 0)
    if (used + body.quantity > campaign.totalNumbers) {
      throw new ApiError(422, 'VALIDATION', 'Os números distribuídos ultrapassam o total da campanha.')
    }
    const expectedQuantity = Math.min(campaign.miniBlockSize, campaign.totalNumbers - used)
    if (body.quantity !== expectedQuantity) {
      throw new ApiError(422, 'VALIDATION', `Cada minibloco desta rifa tem ${expectedQuantity} rifas.`)
    }
    if (body.coroinhaId) {
      const person = await app.prisma.coroinha.findUnique({ where: { id: body.coroinhaId } })
      if (!person || person.archivedAt) throw new ApiError(422, 'VALIDATION', 'Selecione um coroinha válido.')
    }
    const status = deriveBlockStatus(draft, campaign.unitPrice.toString())
    const batch = await app.prisma.raffleBatch.findFirst({ where: { campaignId: campaign.id }, orderBy: { createdAt: 'desc' } })
    if (!batch) throw new ApiError(409, 'LOCKED', 'A rifa não tem um lote de blocos.')
    const created = await app.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RaffleCampaign" WHERE id = ${campaign.id} FOR UPDATE`
      const block = await tx.raffleBlock.create({
        data: {
          campaignId: campaign.id,
          batchId: batch.id,
          label: body.label.trim(),
          coroinhaId: body.coroinhaId || null,
          participantName: body.participantName.trim(),
          quantity: body.quantity,
          soldQuantity: body.soldQuantity,
          unsoldQuantity: body.unsoldQuantity,
          amountReceived: received,
          status,
          notes: clean(body.notes),
        },
      })
      await tx.raffleBlockEvent.create({
        data: { blockId: block.id, userId: auth.id, action: 'Criação', after: snapshot(block), note: clean(body.correctionNote) },
      })
      return block
    })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.block', entity: 'RaffleBlock', entityId: created.id, ip: request.ip })
    return presentCampaign(app, campaign.id)
  })

  app.patch('/api/raffles/:id/blocks/:blockId', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string; blockId: string }
    const body = parse(raffleBlockSchema, request.body)
    const block = await app.prisma.raffleBlock.findFirst({ where: { id: params.blockId, campaignId: params.id }, include: { campaign: true } })
    if (!block) throw notFound('Bloco não encontrado.')
    if (block.campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A campanha está encerrada.')
    const changed =
      body.quantity !== block.quantity ||
      body.soldQuantity !== block.soldQuantity ||
      body.unsoldQuantity !== block.unsoldQuantity ||
      normalizeMoney(body.amountReceived) !== money(block.amountReceived.toString())
    if (changed && (!body.correctionNote || body.correctionNote.trim().length < 3)) {
      throw new ApiError(422, 'VALIDATION', 'Informe uma observação para corrigir as quantidades ou os valores.')
    }
    const received = normalizeMoney(body.amountReceived)
    const draft = {
      quantity: body.quantity,
      soldQuantity: body.soldQuantity,
      unsoldQuantity: body.unsoldQuantity,
      unsoldReturned: block.unsoldReturned,
      amountReceived: received,
    }
    try {
      assertBlockQuantities(draft, block.campaign.unitPrice.toString())
    } catch (error) {
      throw new ApiError(422, 'VALIDATION', error instanceof Error ? error.message : 'Quantidade inválida.')
    }
    const siblings = await app.prisma.raffleBlock.findMany({ where: { campaignId: block.campaignId, id: { not: block.id } } })
    const used = siblings.reduce((sum, item) => sum + committedNumbers(blockMath(item)), 0)
    if (used + committedNumbers(draft) > block.campaign.totalNumbers) {
      throw new ApiError(422, 'VALIDATION', 'Os números distribuídos ultrapassam o total da campanha.')
    }
    const status = deriveBlockStatus(draft, block.campaign.unitPrice.toString())
    await app.prisma.$transaction(async (tx) => {
      const before = snapshot(block)
      const updated = await tx.raffleBlock.update({
        where: { id: block.id },
        data: {
          label: body.label.trim(),
          coroinhaId: body.coroinhaId || null,
          participantName: body.participantName.trim(),
          quantity: body.quantity,
          soldQuantity: body.soldQuantity,
          unsoldQuantity: body.unsoldQuantity,
          amountReceived: received,
          status,
          notes: clean(body.notes),
        },
      })
      await tx.raffleBlockEvent.create({
        data: {
          blockId: block.id,
          userId: auth.id,
          action: 'Correção',
          before,
          after: snapshot(updated),
          note: clean(body.correctionNote),
        },
      })
    })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.block', entity: 'RaffleBlock', entityId: block.id, ip: request.ip })
    return presentCampaign(app, block.campaignId)
  })

  app.post('/api/raffles/:id/blocks/:blockId/assign', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string; blockId: string }
    const body = parse(raffleAssignSchema, request.body ?? {})
    const block = await app.prisma.raffleBlock.findFirst({ where: { id: params.blockId, campaignId: params.id }, include: { campaign: true } })
    if (!block) throw notFound('Bloco não encontrado.')
    if (block.campaign.status === 'CLOSED') throw new ApiError(409, 'LOCKED', 'A campanha está encerrada.')
    let participantName = 'A distribuir'
    if (body.coroinhaId) {
      const person = await app.prisma.coroinha.findUnique({ where: { id: body.coroinhaId } })
      if (!person || person.archivedAt) throw new ApiError(422, 'VALIDATION', 'Selecione um coroinha válido.')
      participantName = person.fullName
    }
    await app.prisma.$transaction(async (tx) => {
      const updated = await tx.raffleBlock.update({
        where: { id: block.id },
        data: { coroinhaId: body.coroinhaId, participantName },
      })
      await tx.raffleBlockEvent.create({
        data: {
          blockId: block.id,
          userId: auth.id,
          action: 'Atribuição',
          before: snapshot(block),
          after: snapshot(updated),
          note: body.coroinhaId ? `Minibloco atrelado a ${participantName}.` : 'Coroinha removido do minibloco.',
        },
      })
    })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.assign', entity: 'RaffleBlock', entityId: block.id, ip: request.ip })
    return presentCampaign(app, block.campaignId)
  })

  app.post('/api/raffles/:id/blocks/:blockId/return', async (request) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.write')
    const params = request.params as { id: string; blockId: string }
    const body = parse(raffleBlockSchema.pick({ correctionNote: true }), request.body ?? {})
    const block = await app.prisma.raffleBlock.findFirst({ where: { id: params.blockId, campaignId: params.id }, include: { campaign: true } })
    if (!block) throw notFound('Bloco não encontrado.')
    if (block.unsoldReturned) throw new ApiError(409, 'LOCKED', 'Os números não vendidos deste bloco já foram devolvidos.')
    const unsold = block.quantity - block.soldQuantity
    const draft = {
      quantity: block.quantity,
      soldQuantity: block.soldQuantity,
      unsoldQuantity: unsold,
      unsoldReturned: true,
      amountReceived: block.amountReceived.toString(),
    }
    const status = deriveBlockStatus(draft, block.campaign.unitPrice.toString())
    await app.prisma.$transaction(async (tx) => {
      const updated = await tx.raffleBlock.update({
        where: { id: block.id },
        data: { unsoldQuantity: unsold, unsoldReturned: true, status },
      })
      await tx.raffleBlockEvent.create({
        data: {
          blockId: block.id,
          userId: auth.id,
          action: 'Devolução',
          before: snapshot(block),
          after: snapshot(updated),
          note: clean(body.correctionNote),
        },
      })
    })
    await audit(app.prisma, { userId: auth.id, action: 'raffle.return', entity: 'RaffleBlock', entityId: block.id, ip: request.ip })
    return presentCampaign(app, block.campaignId)
  })

  app.get('/api/raffles/:id/export.csv', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.read')
    const params = request.params as { id: string }
    const campaign = await presentCampaign(app, params.id)
    const content = csv(
      ['Bloco', 'Numeração', 'Bloco original', 'Responsável', 'Quantidade', 'Vendidos', 'Não vendidos', 'Recebido', 'Pendente', 'Situação'],
      campaign.blocks.map((block) => [
        block.label,
        block.startNumber === block.endNumber ? String(block.startNumber) : `${block.startNumber} a ${block.endNumber}`,
        block.originalBlockStart === block.originalBlockEnd
          ? String(block.originalBlockStart)
          : `${block.originalBlockStart} a ${block.originalBlockEnd}`,
        block.participantName,
        block.quantity,
        block.soldQuantity,
        block.unsoldQuantity,
        block.amountReceived,
        block.pendingAmount,
        BLOCK_STATUS_LABELS[block.status],
      ]),
    )
    return sendCsv(reply, `rifa-${campaign.name}.csv`, content)
  })

  app.get('/api/raffles/:id/export.pdf', async (request, reply) => {
    const auth = actor(request)
    assertCan(auth, 'raffles.read')
    const params = request.params as { id: string }
    const campaign = await presentCampaign(app, params.id)
    const settings = await app.prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
    const buffer = await renderPdf((doc) => {
      pdfHeading(doc, settings.parishName, 'Prestação de contas da rifa')
      doc.font('Times-Bold').fontSize(16).text(campaign.name)
      doc.moveDown(0.3)
      doc.font('Times-Roman').fontSize(12)
      doc.text(`Prêmio: ${campaign.prize}`)
      doc.text(`Situação: ${RAFFLE_STATUS_LABELS[campaign.status]}`)
      campaign.batches.forEach((batch) => {
        doc.text(`${batch.blockCount} blocos de 10 rifas, do bloco ${batch.firstBlock} ao ${batch.firstBlock + batch.blockCount - 1}, números ${batch.firstNumber} a ${batch.firstNumber + batch.totalNumbers - 1}, miniblocos de até ${batch.miniBlockSize}.`)
      })
      doc.text(`Vendidos: ${campaign.summary.sold} de ${campaign.totalNumbers}`)
      doc.text(`Recebido: R$ ${campaign.summary.receivedAmount}`)
      doc.text(`Pendente: R$ ${campaign.summary.pendingAmount}`)
      doc.moveDown(0.8)
      doc.font('Times-Bold').fontSize(14).text('Prestação de contas por coroinha')
      doc.moveDown(0.4)
      campaign.accountability.lines.forEach((line) => {
        doc.font('Times-Bold').fontSize(12).text(line.name)
        doc.font('Times-Roman').text(
          `${line.soldQuantity} vendidos, ${line.unsoldQuantity} não vendidos, esperado R$ ${line.expectedAmount}, recebido R$ ${line.receivedAmount}, pendente R$ ${line.pendingAmount}`,
        )
        line.blocks.forEach((block) => {
          doc.text(`   ${block.label}: números ${block.startNumber} a ${block.endNumber}, ${block.soldQuantity} vendidos`)
        })
        doc.moveDown(0.4)
      })
      doc.font('Times-Bold').text(
        `Total: esperado R$ ${campaign.accountability.expectedAmount}, recebido R$ ${campaign.accountability.receivedAmount}, pendente R$ ${campaign.accountability.pendingAmount}`,
      )
      doc.moveDown(0.6)
      doc.font('Times-Bold').fontSize(14).text('Blocos reunidos')
      doc.moveDown(0.3)
      doc.font('Times-Roman').fontSize(12)
      campaign.joinedBlocks.forEach((block) => {
        doc.text(
          `${block.label} (começa no ${block.startNumber}, números ${block.startNumber} a ${block.endNumber}): ${block.soldQuantity} vendidos, ${block.unsoldQuantity} não vendidos, recebido R$ ${block.amountReceived}`,
        )
      })
    })
    return sendPdf(reply, `rifa-${campaign.id}.pdf`, buffer)
  })
}
