import type { RaffleBlockStatus } from '@coroinha/contracts'
import Decimal from 'decimal.js'

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP })

export function todayInBrazil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

export function asDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function clean(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

export function normalizeMoney(value: string) {
  const raw = value.trim().replace(',', '.')
  const [whole, fraction = ''] = raw.split('.')
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`
}

export function money(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2).toFixed(2)
}

export function minutesOf(time: string) {
  const [hours, mins] = time.split(':')
  return Number(hours) * 60 + Number(mins)
}

export function overlaps(startA: string, startB: string, duration: number) {
  const a = minutesOf(startA)
  const b = minutesOf(startB)
  return a < b + duration && b < a + duration
}

export function frequencyWarning(projectedCount: number, counts: number[]) {
  if (projectedCount < 3 || counts.length === 0) return null
  const sorted = [...counts].sort((left, right) => left - right)
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0
  if (projectedCount >= mid + 2) {
    return `Este coroinha já aparece em ${projectedCount} escalas na janela recente, acima da distribuição do grupo.`
  }
  return null
}

export type BlockMath = {
  quantity: number
  soldQuantity: number
  unsoldQuantity: number
  unsoldReturned: boolean
  amountReceived: Decimal.Value
  status?: RaffleBlockStatus
}

export function assertBlockQuantities(input: BlockMath, unitPrice: Decimal.Value) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('A quantidade do bloco deve ser um número positivo.')
  }
  if (input.soldQuantity < 0 || input.unsoldQuantity < 0) {
    throw new Error('As quantidades não podem ser negativas.')
  }
  if (input.soldQuantity + input.unsoldQuantity > input.quantity) {
    throw new Error('A soma dos números vendidos e não vendidos não pode superar a quantidade do bloco.')
  }
  const received = new Decimal(input.amountReceived)
  if (received.isNegative()) throw new Error('O valor recebido não pode ser negativo.')
  const expected = new Decimal(unitPrice).times(input.soldQuantity)
  if (received.greaterThan(expected)) {
    throw new Error('O valor recebido não pode superar o valor dos números vendidos.')
  }
}

export function deriveBlockStatus(input: BlockMath, unitPrice: Decimal.Value): RaffleBlockStatus {
  const pending = new Decimal(unitPrice).times(input.soldQuantity).minus(input.amountReceived)
  const accounted = input.soldQuantity + input.unsoldQuantity === input.quantity
  const settled = pending.isZero() && accounted
  if (input.unsoldReturned && settled) return 'RETURNED'
  if (settled) return 'SETTLED'
  if (
    input.soldQuantity > 0 ||
    input.unsoldQuantity > 0 ||
    input.unsoldReturned ||
    new Decimal(input.amountReceived).greaterThan(0)
  ) {
    return 'PARTIAL'
  }
  return 'OPEN'
}

export const RAFFLE_BLOCK_SIZE = 10

export function planMiniBlockQuantities(blockCount: number, miniBlockSize: number) {
  if (!Number.isInteger(blockCount) || blockCount < 1) {
    throw new Error('Informe ao menos um bloco.')
  }
  if (!Number.isInteger(miniBlockSize) || miniBlockSize < 1 || miniBlockSize > RAFFLE_BLOCK_SIZE) {
    throw new Error('Cada minibloco deve ter de 1 a 10 rifas.')
  }
  const totalNumbers = blockCount * RAFFLE_BLOCK_SIZE
  const quantities: number[] = []
  let remaining = totalNumbers
  while (remaining > 0) {
    const size = Math.min(miniBlockSize, remaining)
    quantities.push(size)
    remaining -= size
  }
  return { totalNumbers, quantities }
}

export type RafflePickup = {
  blockCount: number
  firstNumber: number
  firstBlock: number
}

export function pickupRanges(pickup: RafflePickup) {
  const totalNumbers = pickup.blockCount * RAFFLE_BLOCK_SIZE
  return {
    numberStart: pickup.firstNumber,
    numberEnd: pickup.firstNumber + totalNumbers - 1,
    blockStart: pickup.firstBlock,
    blockEnd: pickup.firstBlock + pickup.blockCount - 1,
  }
}

export function assertPickupFits(existing: RafflePickup[], next: RafflePickup) {
  const incoming = pickupRanges(next)
  for (const pickup of existing) {
    const current = pickupRanges(pickup)
    const numbersCross = incoming.numberStart <= current.numberEnd && current.numberStart <= incoming.numberEnd
    if (numbersCross) {
      throw new Error(`A numeração ${incoming.numberStart} a ${incoming.numberEnd} cruza números que já estão na rifa.`)
    }
    const blocksCross = incoming.blockStart <= current.blockEnd && current.blockStart <= incoming.blockEnd
    if (blocksCross) {
      throw new Error(`Os blocos ${incoming.blockStart} a ${incoming.blockEnd} cruzam blocos que já estão na rifa.`)
    }
  }
}

export function nextMiniBlockNumber(labels: string[]) {
  const numbers = labels
    .map((label) => Number(label.match(/(\d+)\s*$/)?.[1]))
    .filter((value) => Number.isInteger(value) && value > 0)
  return numbers.reduce((max, value) => Math.max(max, value), 0) + 1
}

export function compareMiniBlockLabels(left: string, right: string) {
  const leftNumber = Number(left.match(/(\d+)\s*$/)?.[1])
  const rightNumber = Number(right.match(/(\d+)\s*$/)?.[1])
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber
  return left.localeCompare(right, 'pt-BR')
}

export function assignSeries(quantities: number[], firstNumber: number, firstBlock = 1) {
  if (!Number.isInteger(firstNumber) || firstNumber < 1) {
    throw new Error('A numeração inicial deve ser um número positivo.')
  }
  if (!Number.isInteger(firstBlock) || firstBlock < 1) {
    throw new Error('O bloco inicial deve ser um número positivo.')
  }
  let cursor = firstNumber
  return quantities.map((quantity) => {
    const startNumber = cursor
    const endNumber = cursor + quantity - 1
    cursor = endNumber + 1
    const originalBlockStart = Math.floor((startNumber - firstNumber) / RAFFLE_BLOCK_SIZE) + firstBlock
    const originalBlockEnd = Math.floor((endNumber - firstNumber) / RAFFLE_BLOCK_SIZE) + firstBlock
    return { startNumber, endNumber, originalBlockStart, originalBlockEnd }
  })
}

export type AccountabilityBlock = {
  coroinhaId: string | null
  participantName: string
  label: string
  startNumber: number
  endNumber: number
  quantity: number
  soldQuantity: number
  unsoldQuantity: number
  amountReceived: Decimal.Value
}

export function buildAccountability(blocks: AccountabilityBlock[], unitPrice: Decimal.Value) {
  const price = new Decimal(unitPrice)
  const groups = new Map<
    string,
    {
      coroinhaId: string | null
      name: string
      blocks: { label: string; startNumber: number; endNumber: number; quantity: number; soldQuantity: number; unsoldQuantity: number }[]
      quantity: number
      soldQuantity: number
      unsoldQuantity: number
      expected: Decimal
      received: Decimal
    }
  >()

  for (const block of blocks) {
    const unassigned = !block.coroinhaId
    const key = block.coroinhaId ?? 'sem-coroinha'
    const current = groups.get(key) ?? {
      coroinhaId: block.coroinhaId,
      name: unassigned ? 'Sem coroinha' : block.participantName,
      blocks: [],
      quantity: 0,
      soldQuantity: 0,
      unsoldQuantity: 0,
      expected: new Decimal(0),
      received: new Decimal(0),
    }
    current.blocks.push({
      label: block.label,
      startNumber: block.startNumber,
      endNumber: block.endNumber,
      quantity: block.quantity,
      soldQuantity: block.soldQuantity,
      unsoldQuantity: block.unsoldQuantity,
    })
    current.quantity += block.quantity
    current.soldQuantity += block.soldQuantity
    current.unsoldQuantity += block.unsoldQuantity
    current.expected = current.expected.plus(price.times(block.soldQuantity))
    current.received = current.received.plus(block.amountReceived)
    groups.set(key, current)
  }

  const lines = [...groups.values()]
    .sort((left, right) => {
      if (!left.coroinhaId) return 1
      if (!right.coroinhaId) return -1
      return left.name.localeCompare(right.name, 'pt-BR')
    })
    .map((line) => ({
      coroinhaId: line.coroinhaId,
      name: line.name,
      blocks: line.blocks,
      quantity: line.quantity,
      soldQuantity: line.soldQuantity,
      unsoldQuantity: line.unsoldQuantity,
      expectedAmount: money(line.expected),
      receivedAmount: money(line.received),
      pendingAmount: money(line.expected.minus(line.received)),
    }))

  const expected = lines.reduce((sum, line) => sum.plus(line.expectedAmount), new Decimal(0))
  const received = lines.reduce((sum, line) => sum.plus(line.receivedAmount), new Decimal(0))
  return {
    lines,
    soldQuantity: lines.reduce((sum, line) => sum + line.soldQuantity, 0),
    unsoldQuantity: lines.reduce((sum, line) => sum + line.unsoldQuantity, 0),
    expectedAmount: money(expected),
    receivedAmount: money(received),
    pendingAmount: money(expected.minus(received)),
  }
}

function rangeOverlap(start: number, end: number, rangeStart: number, rangeEnd: number) {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart))
}

export function reassembleBlocks(
  blocks: BlockMath[],
  blockCount: number,
  unitPrice: Decimal.Value,
  firstNumber = 1,
  firstBlock = 1,
) {
  let index = 0
  let offset = 0
  let receivedLeft = new Decimal(0)
  const joined = []

  for (let number = 1; number <= blockCount; number += 1) {
    let sold = 0
    let unsold = 0
    let received = new Decimal(0)
    let need = RAFFLE_BLOCK_SIZE

    while (need > 0 && index < blocks.length) {
      const block = blocks[index]
      if (!block) break
      if (offset === 0) receivedLeft = new Decimal(block.amountReceived)
      const available = block.quantity - offset
      if (available <= 0) {
        index += 1
        offset = 0
        continue
      }
      const take = Math.min(need, available)
      const sliceEnd = offset + take
      const soldInSlice = rangeOverlap(offset, sliceEnd, 0, block.soldQuantity)
      unsold += rangeOverlap(offset, sliceEnd, block.soldQuantity, block.soldQuantity + block.unsoldQuantity)
      const soldRemaining = block.soldQuantity - Math.min(offset, block.soldQuantity)
      if (soldInSlice > 0 && soldRemaining > 0) {
        const portion =
          soldInSlice === soldRemaining
            ? receivedLeft
            : receivedLeft.times(soldInSlice).div(soldRemaining)
        received = received.plus(portion)
        receivedLeft = receivedLeft.minus(portion)
      }
      sold += soldInSlice
      offset += take
      need -= take
      if (offset >= block.quantity) {
        index += 1
        offset = 0
      }
    }

    const amountReceived = money(received)
    const draft: BlockMath = {
      quantity: RAFFLE_BLOCK_SIZE,
      soldQuantity: sold,
      unsoldQuantity: unsold,
      unsoldReturned: false,
      amountReceived,
    }
    const blockNumber = firstBlock + number - 1
    const startNumber = firstNumber + (number - 1) * RAFFLE_BLOCK_SIZE
    joined.push({
      label: `Bloco ${blockNumber}`,
      blockNumber,
      startNumber,
      endNumber: startNumber + RAFFLE_BLOCK_SIZE - 1,
      quantity: RAFFLE_BLOCK_SIZE,
      soldQuantity: sold,
      unsoldQuantity: unsold,
      amountReceived,
      pendingAmount: money(new Decimal(unitPrice).times(sold).minus(received)),
      status: deriveBlockStatus(draft, unitPrice),
    })
  }

  return joined
}

export function committedNumbers(block: BlockMath) {
  if (block.unsoldReturned || block.status === 'RETURNED') return block.soldQuantity
  return block.quantity
}

export function summarizeRaffle(
  totalNumbers: number,
  unitPrice: Decimal.Value,
  goalAmount: Decimal.Value | null,
  blocks: BlockMath[],
) {
  const distributed = blocks.reduce((sum, block) => sum + committedNumbers(block), 0)
  const sold = blocks.reduce((sum, block) => sum + block.soldQuantity, 0)
  const unsold = blocks
    .filter((block) => !block.unsoldReturned && block.status !== 'RETURNED')
    .reduce((sum, block) => sum + block.unsoldQuantity, 0)
  const expected = blocks.reduce(
    (sum, block) => sum.plus(new Decimal(unitPrice).times(block.soldQuantity)),
    new Decimal(0),
  )
  const received = blocks.reduce((sum, block) => sum.plus(block.amountReceived), new Decimal(0))
  const goal = goalAmount === null ? null : new Decimal(goalAmount)
  return {
    distributed,
    sold,
    unsold,
    available: totalNumbers - distributed,
    expectedAmount: money(expected),
    receivedAmount: money(received),
    pendingAmount: money(expected.minus(received)),
    completionPercent: totalNumbers === 0 ? 0 : Math.round((sold / totalNumbers) * 1000) / 10,
    goalAmount: goal ? money(goal) : null,
    goalPercent:
      goal && goal.greaterThan(0) ? Math.round(received.div(goal).times(1000).toNumber()) / 10 : null,
    openBlocks: blocks.filter((block) => {
      const status = block.status ?? deriveBlockStatus(block, unitPrice)
      return status === 'OPEN' || status === 'PARTIAL'
    }).length,
  }
}

export function summarizeFundraising(
  transactions: { type: 'INCOME' | 'EXPENSE'; amount: Decimal.Value }[],
  goalAmount: Decimal.Value | null,
  participantCount: number,
) {
  const income = transactions
    .filter((item) => item.type === 'INCOME')
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0))
  const expense = transactions
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0))
  const balance = income.minus(expense)
  const goal = goalAmount === null ? null : new Decimal(goalAmount)
  return {
    income: money(income),
    expense: money(expense),
    balance: money(balance),
    goalAmount: goal ? money(goal) : null,
    goalPercent:
      goal && goal.greaterThan(0) ? Math.round(balance.div(goal).times(1000).toNumber()) / 10 : null,
    participantCount,
  }
}
