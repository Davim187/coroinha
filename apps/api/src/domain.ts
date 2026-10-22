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
