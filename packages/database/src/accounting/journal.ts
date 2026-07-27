export interface DraftJournalLineAmount {
  debitCents: number
  creditCents: number
}
export type JournalValidationErrorCode =
  | 'too_few_lines'
  | 'invalid_amount'
  | 'one_sided_amount_required'
  | 'unbalanced'

export type JournalValidationResult =
  | {
      ok: true
      totalDebitCents: number
      totalCreditCents: number
    }
  | {
      ok: false
      code: JournalValidationErrorCode
      lineIndex?: number
    }

function isValidCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

/**
 * Fast UI/server validation for a draft journal. The database posting function
 * repeats every authoritative invariant inside the posting transaction.
 */
export function validateJournalLines(
  lines: readonly DraftJournalLineAmount[]
): JournalValidationResult {
  if (lines.length < 2) {
    return { ok: false, code: 'too_few_lines' }
  }

  let totalDebitCents = 0
  let totalCreditCents = 0

  for (const [lineIndex, line] of lines.entries()) {
    if (!isValidCents(line.debitCents) || !isValidCents(line.creditCents)) {
      return { ok: false, code: 'invalid_amount', lineIndex }
    }

    const isDebit = line.debitCents > 0 && line.creditCents === 0
    const isCredit = line.creditCents > 0 && line.debitCents === 0
    if (!isDebit && !isCredit) {
      return {
        ok: false,
        code: 'one_sided_amount_required',
        lineIndex,
      }
    }

    totalDebitCents += line.debitCents
    totalCreditCents += line.creditCents

    if (
      !Number.isSafeInteger(totalDebitCents) ||
      !Number.isSafeInteger(totalCreditCents)
    ) {
      return { ok: false, code: 'invalid_amount', lineIndex }
    }
  }

  if (totalDebitCents <= 0 || totalDebitCents !== totalCreditCents) {
    return { ok: false, code: 'unbalanced' }
  }

  return { ok: true, totalDebitCents, totalCreditCents }
}
