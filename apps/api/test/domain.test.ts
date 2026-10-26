import { describe, expect, it } from 'vitest'
import {
  assertBlockQuantities,
  deriveBlockStatus,
  frequencyWarning,
  overlaps,
  assignSeries,
  buildAccountability,
  assertPickupFits,
  compareMiniBlockLabels,
  nextMiniBlockNumber,
  planMiniBlockQuantities,
  reassembleBlocks,
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

  it('desfaz blocos de 10 em miniblocos e reúne de novo', () => {
    expect(planMiniBlockQuantities(3, 10).quantities).toEqual([10, 10, 10])
    expect(planMiniBlockQuantities(1, 4)).toEqual({ totalNumbers: 10, quantities: [4, 4, 2] })

    const joined = reassembleBlocks(
      [
        { quantity: 4, soldQuantity: 4, unsoldQuantity: 0, unsoldReturned: false, amountReceived: '8.00' },
        { quantity: 4, soldQuantity: 2, unsoldQuantity: 2, unsoldReturned: false, amountReceived: '4.00' },
        { quantity: 2, soldQuantity: 0, unsoldQuantity: 0, unsoldReturned: false, amountReceived: '0.00' },
      ],
      1,
      '2.00',
    )
    expect(joined).toHaveLength(1)
    expect(assignSeries([4, 4, 2], 101)).toEqual([
      { startNumber: 101, endNumber: 104, originalBlockStart: 1, originalBlockEnd: 1 },
      { startNumber: 105, endNumber: 108, originalBlockStart: 1, originalBlockEnd: 1 },
      { startNumber: 109, endNumber: 110, originalBlockStart: 1, originalBlockEnd: 1 },
    ])
    expect(assignSeries([4, 4, 4], 1)[2]).toEqual({
      startNumber: 9,
      endNumber: 12,
      originalBlockStart: 1,
      originalBlockEnd: 2,
    })
    expect(assignSeries([4, 4, 4], 161, 60)).toEqual([
      { startNumber: 161, endNumber: 164, originalBlockStart: 60, originalBlockEnd: 60 },
      { startNumber: 165, endNumber: 168, originalBlockStart: 60, originalBlockEnd: 60 },
      { startNumber: 169, endNumber: 172, originalBlockStart: 60, originalBlockEnd: 61 },
    ])
    expect(['Minibloco 02', 'Minibloco 10', 'Minibloco 01'].sort(compareMiniBlockLabels)).toEqual(['Minibloco 01', 'Minibloco 02', 'Minibloco 10'])
    expect(nextMiniBlockNumber(['Minibloco 01', 'Minibloco 15'])).toBe(16)
    expect(() => assertPickupFits([{ blockCount: 6, firstNumber: 161, firstBlock: 60 }], { blockCount: 1, firstNumber: 200, firstBlock: 64 })).toThrow(/cruzam blocos/)
    expect(() => assertPickupFits([{ blockCount: 6, firstNumber: 161, firstBlock: 60 }], { blockCount: 1, firstNumber: 161, firstBlock: 70 })).toThrow(/cruza números/)
    expect(reassembleBlocks(
      [{ quantity: 10, soldQuantity: 0, unsoldQuantity: 0, unsoldReturned: false, amountReceived: '0.00' }],
      1,
      '2.00',
      161,
      60,
    )[0]).toMatchObject({ label: 'Bloco 60', blockNumber: 60, startNumber: 161, endNumber: 170 })

    const account = buildAccountability(
      [
        { coroinhaId: 'ana', participantName: 'Ana', label: 'Minibloco 01', startNumber: 1, endNumber: 4, quantity: 4, soldQuantity: 2, unsoldQuantity: 1, amountReceived: '3.00' },
        { coroinhaId: 'ana', participantName: 'Ana', label: 'Minibloco 02', startNumber: 5, endNumber: 8, quantity: 4, soldQuantity: 1, unsoldQuantity: 0, amountReceived: '2.00' },
        { coroinhaId: null, participantName: 'A distribuir', label: 'Minibloco 03', startNumber: 9, endNumber: 10, quantity: 2, soldQuantity: 0, unsoldQuantity: 0, amountReceived: '0.00' },
      ],
      '2.00',
    )
    expect(account.lines[0]).toMatchObject({ name: 'Ana', soldQuantity: 3, expectedAmount: '6.00', receivedAmount: '5.00', pendingAmount: '1.00' })
    expect(account.lines[1]?.name).toBe('Sem coroinha')
    expect(account.pendingAmount).toBe('1.00')

    expect(joined[0]).toMatchObject({
      label: 'Bloco 1',
      blockNumber: 1,
      startNumber: 1,
      endNumber: 10,
      quantity: 10,
      soldQuantity: 6,
      unsoldQuantity: 2,
      amountReceived: '12.00',
      pendingAmount: '0.00',
      status: 'PARTIAL',
    })
  })

  it('alerta concentração e conflito de horário', () => {
    expect(overlaps('19:00', '19:30', 90)).toBe(true)
    expect(overlaps('19:00', '21:00', 90)).toBe(false)
    expect(frequencyWarning(5, [0, 1, 1, 2, 5])).toContain('janela recente')
    expect(frequencyWarning(1, [0, 1, 1])).toBeNull()
  })
})
