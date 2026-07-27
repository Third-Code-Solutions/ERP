import { describe, expect, it } from 'vitest'
import { validateJournalLines } from '../accounting/journal'

describe('journal domain validation', () => {
  it('accepts a balanced two-line journal', () => {
    expect(
      validateJournalLines([
        { debitCents: 125_000, creditCents: 0 },
        { debitCents: 0, creditCents: 125_000 },
      ])
    ).toEqual({
      ok: true,
      totalDebitCents: 125_000,
      totalCreditCents: 125_000,
    })
  })

  it('accepts a balanced split journal', () => {
    expect(
      validateJournalLines([
        { debitCents: 75_000, creditCents: 0 },
        { debitCents: 25_000, creditCents: 0 },
        { debitCents: 0, creditCents: 100_000 },
      ])
    ).toMatchObject({ ok: true, totalDebitCents: 100_000 })
  })

  it('rejects fewer than two lines', () => {
    expect(
      validateJournalLines([{ debitCents: 100, creditCents: 0 }])
    ).toEqual({ ok: false, code: 'too_few_lines' })
  })

  it.each([
    { debitCents: -1, creditCents: 0 },
    { debitCents: 1.5, creditCents: 0 },
    { debitCents: Number.MAX_SAFE_INTEGER + 1, creditCents: 0 },
  ])('rejects invalid cent values: %o', (line) => {
    expect(
      validateJournalLines([
        line,
        { debitCents: 0, creditCents: 100 },
      ])
    ).toMatchObject({ ok: false, code: 'invalid_amount', lineIndex: 0 })
  })

  it('rejects a line with debit and credit together', () => {
    expect(
      validateJournalLines([
        { debitCents: 100, creditCents: 100 },
        { debitCents: 0, creditCents: 100 },
      ])
    ).toMatchObject({
      ok: false,
      code: 'one_sided_amount_required',
      lineIndex: 0,
    })
  })

  it('rejects a zero-value line', () => {
    expect(
      validateJournalLines([
        { debitCents: 0, creditCents: 0 },
        { debitCents: 0, creditCents: 100 },
      ])
    ).toMatchObject({
      ok: false,
      code: 'one_sided_amount_required',
      lineIndex: 0,
    })
  })

  it('rejects an unbalanced journal', () => {
    expect(
      validateJournalLines([
        { debitCents: 100, creditCents: 0 },
        { debitCents: 0, creditCents: 99 },
      ])
    ).toEqual({ ok: false, code: 'unbalanced' })
  })
})
