import { describe, expect, it } from 'vitest'
import {
  cellCentavos,
  cellDecimal,
  cellQuantity,
  cellText,
  centavosDecimal,
  excelText,
  formatCentavos,
  looksLikeFormula,
  MAX_CELL_TEXT,
} from './cells'

const MAX = 1_000_000_000_000

describe('BOQ cell numbers', () => {
  it('removes binary float noise from Excel numbers', () => {
    expect(cellDecimal(0.1 + 0.2)).toEqual({ ok: true, value: '0.3' })
    expect(cellQuantity(0.30000000000000004)).toEqual({ ok: true, value: '0.3' })
    expect(cellDecimal(1e-7)).toEqual({ ok: true, value: '0.0000001' })
    expect(cellDecimal(12)).toEqual({ ok: true, value: '12' })
  })

  it('rounds quantity half-up to 4 dp and money half-up to the centavo', () => {
    expect(cellQuantity(12.34565)).toEqual({ ok: true, value: '12.3457' })
    expect(cellQuantity('12.34564')).toEqual({ ok: true, value: '12.3456' })
    // 1.00015 is stored as 1.000149999...; Excel precision keeps it a half.
    expect(cellQuantity(1.00015)).toEqual({ ok: true, value: '1.0002' })
    expect(cellCentavos(1234.565, MAX)).toEqual({ ok: true, value: 123_457 })
    expect(cellCentavos('0.004', MAX)).toEqual({ ok: true, value: 0 })
  })

  it('reads peso text with symbols and thousands separators', () => {
    expect(cellCentavos('1,234.50', MAX)).toEqual({ ok: true, value: 123_450 })
    expect(cellCentavos('₱ 1,234.50', MAX)).toEqual({ ok: true, value: 123_450 })
    expect(cellCentavos('PHP1234.5', MAX)).toEqual({ ok: true, value: 123_450 })
    expect(cellCentavos('php 7', MAX)).toEqual({ ok: true, value: 700 })
    expect(cellQuantity(' .5 ')).toEqual({ ok: true, value: '0.5' })
  })

  it('reports negative, non-numeric, out-of-range and blank cells', () => {
    for (const negative of [-1, '-1', '(1,234.50)', '-₱5', '₱ -5']) {
      expect(cellCentavos(negative, MAX)).toEqual({ ok: false, problem: 'NEGATIVE' })
    }
    for (const text of ['abc', '12.5 sqm', '1,23', '.', true, new Date(0), { error: '#DIV/0!' }, Number.NaN]) {
      expect(cellQuantity(text)).toEqual({ ok: false, problem: 'NOT_A_NUMBER' })
    }
    expect(cellQuantity(2_147_483_648)).toEqual({ ok: false, problem: 'OUT_OF_RANGE' })
    expect(cellCentavos(MAX / 100 + 0.01, MAX)).toEqual({ ok: false, problem: 'OUT_OF_RANGE' })
    expect(cellQuantity('  ')).toEqual({ ok: false, problem: 'BLANK' })
    expect(cellQuantity(null)).toEqual({ ok: false, problem: 'BLANK' })
  })

  it('uses a formula cached result and flags a formula without one', () => {
    expect(cellQuantity({ formula: 'B2*C2', result: 24.5 })).toEqual({ ok: true, value: '24.5' })
    expect(cellQuantity({ sharedFormula: 'D2', result: '3' })).toEqual({ ok: true, value: '3' })
    expect(cellQuantity({ formula: 'B2*C2' })).toEqual({
      ok: false,
      problem: 'FORMULA_WITHOUT_RESULT',
    })
  })
})

describe('BOQ cell text', () => {
  it('reads rich text, hyperlinks and numbers as text', () => {
    expect(cellText({ richText: [{ text: 'Con' }, { text: 'crete' }] })).toBe('Concrete')
    expect(cellText({ text: 'Spec', hyperlink: 'https://example.test' })).toBe('Spec')
    expect(cellText(1.1)).toBe('1.1')
    expect(cellText({ formula: 'A1' })).toBe('')
  })

  it('joins a rich-text cell only as far as it is read (S3-H2)', () => {
    // A shared string of 100,000 runs: every read used to join all of them.
    let reads = 0
    const run = {
      get text() {
        reads += 1
        return 'aaaaaaaaaa'
      },
    }
    const cell = { richText: Array.from({ length: 100_000 }, () => run) }

    expect(cellText(cell)).toBe('a'.repeat(MAX_CELL_TEXT))
    expect(cellText(cell, MAX_CELL_TEXT + 1)).toHaveLength(MAX_CELL_TEXT + 1)
    expect(cellQuantity(cell)).toEqual({ ok: false, problem: 'NOT_A_NUMBER' })
    expect(reads).toBeLessThan(1_000)
  })

  it('strips control characters except tab and newline from exported text', () => {
    expect(excelText('a\u0000b\u0007c\td\ne\rf\u001Fg\u007F')).toBe('abc\td\nefg')
    expect(excelText(null)).toBe('')
  })

  it('strips lone surrogates and U+FFFE/U+FFFF but keeps real astral characters', () => {
    expect(excelText('a\uD800b\uDC00c￾d￿e')).toBe('abcde')
    expect(excelText('tile 🧱 ok')).toBe('tile 🧱 ok')
  })

  it('treats a leading tab like the formula characters it can hide', () => {
    for (const text of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1+1']) expect(looksLikeFormula(text)).toBe(true)
    for (const text of ['Paint', '1 + 1', ' =1+1', '']) expect(looksLikeFormula(text)).toBe(false)
  })

  it('caps cell text and refuses an over-long number', () => {
    expect(cellText('x'.repeat(5_000))).toHaveLength(MAX_CELL_TEXT)
    expect(cellText('x'.repeat(5_000), MAX_CELL_TEXT + 1)).toHaveLength(MAX_CELL_TEXT + 1)
    expect(cellQuantity('1'.repeat(MAX_CELL_TEXT + 1))).toEqual({ ok: false, problem: 'NOT_A_NUMBER' })
  })

  it('formats centavos exactly', () => {
    expect(centavosDecimal(123_456)).toBe('1234.56')
    expect(centavosDecimal(-5)).toBe('-0.05')
    expect(formatCentavos(123_456_789)).toBe('1,234,567.89')
  })
})
