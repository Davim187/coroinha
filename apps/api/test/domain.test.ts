import { describe, expect, it } from 'vitest'
import {
  assertBlockQuantities,
  deriveBlockStatus,
  frequencyWarning,
  overlaps,
  summarizeFundraising,
  summarizeRaffle,
} from '../src/domain'

describe('regras de rifa e arrecadação', () => {
  it('impede quantidade negativa e venda acima do bloco', () => {
    expect(() =>
      assertBlockQuantities(
        { quantity: 10, soldQuantity: 8, unsoldQuantity: 3, unsoldReturned: false, amountReceived: '0.00' },
        '2.00',
      ),
    ).toThrow(/não pode superar/)
    expect(() =>
      assertBlockQuantities(
        { quantity: 10, soldQuantity: -1, unsoldQuantity: 0, unsoldReturned: false, amountReceived: '0.00' },
        '2.00',
      ),
    ).toThrow(/negativ/)
  })

  it('calcula disponíveis, pendência e participantes únicos', () => {
    const summary = summarizeRaffle(100, '2.50', '200.00', [
      { quantity: 40, soldQuantity: 30, unsoldQuantity: 10, unsoldReturned: false, amountReceived: '50.00', status: 'PARTIAL' },
      { quantity: 20, soldQuantity: 20, unsoldQuantity: 0, unsoldReturned: true, amountReceived: '50.00', status: 'RETURNED' },
    ])
    expect(summary.distributed).toBe(60)
    expect(summary.available).toBe(40)
    expect(summary.sold).toBe(50)
    expect(summary.pendingAmount).toBe('25.00')
    expect(summary.receivedAmount).toBe('100.00')

    const fundraising = summarizeFundraising(
      [
        { type: 'INCOME', amount: '80.00' },
        { type: 'INCOME', amount: '20.00' },
        { type: 'EXPENSE', amount: '15.50' },
      ],
      '100.00',
      2,
    )
    expect(fundraising.balance).toBe('84.50')
    expect(fundraising.participantCount).toBe(2)
    expect(deriveBlockStatus(
      { quantity: 10, soldQuantity: 10, unsoldQuantity: 0, unsoldReturned: false, amountReceived: '20.00' },
      '2.00',
    )).toBe('SETTLED')
  })

  it('alerta concentração e conflito de horário', () => {
    expect(overlaps('19:00', '19:30', 90)).toBe(true)
    expect(overlaps('19:00', '21:00', 90)).toBe(false)
    expect(frequencyWarning(5, [0, 1, 1, 2, 5])).toContain('janela recente')
    expect(frequencyWarning(1, [0, 1, 1])).toBeNull()
  })
})
