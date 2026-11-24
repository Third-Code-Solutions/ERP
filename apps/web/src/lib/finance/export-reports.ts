import { z } from 'zod'
import {
  capExportRows,
  FINANCE_EXPORT_QUERY_LIMIT,
  ledgerCsv,
  payableAgingCsv,
  receivableAgingCsv,
  trialBalanceCsv,
} from './export-csv'
import { isoDateSchema, manilaToday } from './dates'
import {
  findFiscalPeriod,
  getLedgerExportRows,
  getPayableAgingRows,
  getReceivableAgingRows,
  getTrialBalance,
} from './report-queries'
import {
  resolveTrialBalanceRange,
  trialBalanceStrictParamsSchema,
} from './trial-balance'

export const FINANCE_EXPORT_REPORTS = [
  'trial-balance',
  'ledger',
  'receivables-aging',
  'payables-aging',
] as const
export type FinanceExportReport = (typeof FINANCE_EXPORT_REPORTS)[number]

export function isFinanceExportReport(value: string): value is FinanceExportReport {
  return (FINANCE_EXPORT_REPORTS as readonly string[]).includes(value)
}

export type FinanceExportResult =
  | { ok: true; csv: string; filename: string; truncated: boolean }
  | { ok: false; error: string }

const INVALID_FILTERS: FinanceExportResult = {
  ok: false,
  error: 'Invalid export filters',
}

const ledgerParamsSchema = z
  .object({
    account: z.string().uuid().optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to)

// Aging is a live snapshot; it takes no filters, so any parameter is rejected.
const agingParamsSchema = z.object({}).strict()

/**
 * Builds one finance CSV. The tenant comes from the caller's session; request
 * parameters can narrow the data but never choose whose data it is.
 */
export async function buildFinanceExport(
  report: FinanceExportReport,
  tenantId: string,
  params: Record<string, string | string[]>,
  now: Date = new Date()
): Promise<FinanceExportResult> {
  const today = manilaToday(now)

  if (report === 'trial-balance') {
    const parsed = trialBalanceStrictParamsSchema.safeParse(params)
    if (!parsed.success) return INVALID_FILTERS
    const period = parsed.data.period
      ? await findFiscalPeriod(tenantId, parsed.data.period)
      : null
    if (parsed.data.period && !period) return INVALID_FILTERS
    const asOf = parsed.data.asOf ?? today
    const trialBalance = await getTrialBalance(
      tenantId,
      resolveTrialBalanceRange(asOf, period)
    )
    return {
      ok: true,
      csv: trialBalanceCsv(trialBalance),
      filename: `trial-balance-${asOf}.csv`,
      truncated: false,
    }
  }

  if (report === 'ledger') {
    const parsed = ledgerParamsSchema.safeParse(params)
    if (!parsed.success) return INVALID_FILTERS
    const { account, from, to } = parsed.data
    const fetched = await getLedgerExportRows(
      tenantId,
      { accountId: account, from, to },
      FINANCE_EXPORT_QUERY_LIMIT
    )
    const { rows, truncated } = capExportRows(fetched)
    return {
      ok: true,
      csv: ledgerCsv(rows, truncated),
      filename: `general-ledger-${from ?? 'start'}-to-${to ?? today}.csv`,
      truncated,
    }
  }

  if (!agingParamsSchema.safeParse(params).success) return INVALID_FILTERS

  if (report === 'receivables-aging') {
    const { rows, truncated } = capExportRows(
      await getReceivableAgingRows(tenantId, FINANCE_EXPORT_QUERY_LIMIT)
    )
    return {
      ok: true,
      csv: receivableAgingCsv(rows, today, truncated),
      filename: `receivables-aging-${today}.csv`,
      truncated,
    }
  }

  const { rows, truncated } = capExportRows(
    await getPayableAgingRows(tenantId, FINANCE_EXPORT_QUERY_LIMIT)
  )
  return {
    ok: true,
    csv: payableAgingCsv(rows, today, truncated),
    filename: `payables-aging-${today}.csv`,
    truncated,
  }
}
