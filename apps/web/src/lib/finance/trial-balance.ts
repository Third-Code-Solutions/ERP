import { z } from 'zod'
import { isoDateSchema } from './dates'

export type NormalBalance = 'debit' | 'credit'

export interface TrialBalanceAccount {
  id: string
  code: string
  name: string
  accountType: string
  normalBalance: NormalBalance
  isActive: boolean
}

/** Posted debit and credit totals for one ledger account, in centavos. */
export interface TrialBalanceSum {
  accountId: string
  debitCents: number
  creditCents: number
}

export interface TrialBalanceRow extends TrialBalanceAccount {
  debitCents: number
  creditCents: number
  /** On the account's normal side; negative means the account sits on the opposite side. */
  balanceCents: number
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebitCents: number
  totalCreditCents: number
  differenceCents: number
  isBalanced: boolean
}

/**
 * Reversals are separate posted entries with the sides swapped, so summing every
 * posted line nets a reversed entry to zero; nothing is special-cased here.
 */
export function buildTrialBalance(
  accounts: readonly TrialBalanceAccount[],
  sums: readonly TrialBalanceSum[]
): TrialBalance {
  const sumByAccount = new Map(sums.map((sum) => [sum.accountId, sum]))

  const rows = accounts.map((account): TrialBalanceRow => {
    const sum = sumByAccount.get(account.id)
    const debitCents = sum?.debitCents ?? 0
    const creditCents = sum?.creditCents ?? 0
    return {
      ...account,
      debitCents,
      creditCents,
      balanceCents:
        account.normalBalance === 'debit'
          ? debitCents - creditCents
          : creditCents - debitCents,
    }
  })

  const totalDebitCents = rows.reduce((total, row) => total + row.debitCents, 0)
  const totalCreditCents = rows.reduce((total, row) => total + row.creditCents, 0)
  const differenceCents = totalDebitCents - totalCreditCents

  return {
    rows,
    totalDebitCents,
    totalCreditCents,
    differenceCents,
    isBalanced: differenceCents === 0,
  }
}

export interface FiscalPeriodBounds {
  startsOn: string
  endsOn: string
}

export interface TrialBalanceRange {
  /** Inclusive lower posting date; null means from the beginning of the ledger. */
  from: string | null
  /** Inclusive upper posting date. */
  to: string
}

/**
 * Without a period the report is cumulative to the as-of date. With one it is
 * that period's movement, never reaching past the period end.
 */
export function resolveTrialBalanceRange(
  asOf: string,
  period: FiscalPeriodBounds | null
): TrialBalanceRange {
  if (!period) return { from: null, to: asOf }
  return {
    from: period.startsOn,
    to: period.endsOn < asOf ? period.endsOn : asOf,
  }
}

/** True when the as-of date falls before the period starts, so no posting date can match. */
export function isEmptyTrialBalanceRange(range: TrialBalanceRange): boolean {
  return range.from !== null && range.from > range.to
}

const trialBalanceFields = z.object({
  asOf: isoDateSchema.optional(),
  period: z.string().guid().optional(),
})

/** Lenient form used by the page: unknown keys are dropped. */
export const trialBalanceParamsSchema = trialBalanceFields
/** Strict form used by the CSV route: unknown keys are rejected. */
export const trialBalanceStrictParamsSchema = trialBalanceFields.strict()
