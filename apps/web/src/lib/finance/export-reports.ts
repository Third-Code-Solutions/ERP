import { z } from 'zod'
import {
  exceedsExportLimit,
  FINANCE_EXPORT_MAX_ROWS,
  FINANCE_EXPORT_QUERY_LIMIT,
  ledgerCsv,
  payableAgingCsv,
  receivableAgingCsv,
  trialBalanceCsv,
  trialBalanceRangeLabel,
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
  | { ok: true; csv: string; filename: string }
  | { ok: false; status: 400 | 413; error: string }

const INVALID_FILTERS: FinanceExportResult = {
  ok: false,
  status: 400,
  error: 'Invalid export filters',
}

const ROW_LIMIT = FINANCE_EXPORT_MAX_ROWS.toLocaleString('en-US')
const LEDGER_TOO_LARGE: FinanceExportResult = {
  ok: false,
  status: 413,
  error: `Export exceeds the ${ROW_LIMIT}-row limit. Narrow the filters and try again.`,
}
const AGING_TOO_LARGE: FinanceExportResult = {
  ok: false,
  status: 413,
  error: `Export exceeds the ${ROW_LIMIT}-row limit.`,
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
    const range = resolveTrialBalanceRange(parsed.data.asOf ?? today, period)
    const trialBalance = await getTrialBalance(tenantId, range)
    return {
      ok: true,
      csv: trialBalanceCsv(trialBalance, range),
      filename: `trial-balance-${trialBalanceRangeLabel(range)}.csv`,
    }
  }

  if (report === 'ledger') {
    const parsed = ledgerParamsSchema.safeParse(params)
    if (!parsed.success) return INVALID_FILTERS
    const { account, from, to } = parsed.data
    const rows = await getLedgerExportRows(
      tenantId,
      { accountId: account, from, to },
      FINANCE_EXPORT_QUERY_LIMIT
    )
    if (exceedsExportLimit(rows)) return LEDGER_TOO_LARGE
    return {
      ok: true,
      csv: ledgerCsv(rows),
      filename: `general-ledger-${from ?? 'start'}-to-${to ?? today}.csv`,
    }
  }

  if (!agingParamsSchema.safeParse(params).success) return INVALID_FILTERS

  if (report === 'receivables-aging') {
    const rows = await getReceivableAgingRows(tenantId, FINANCE_EXPORT_QUERY_LIMIT)
    if (exceedsExportLimit(rows)) return AGING_TOO_LARGE
    return {
      ok: true,
      csv: receivableAgingCsv(rows, today),
      filename: `receivables-aging-${today}.csv`,
    }
  }

  const rows = await getPayableAgingRows(tenantId, FINANCE_EXPORT_QUERY_LIMIT)
  if (exceedsExportLimit(rows)) return AGING_TOO_LARGE
  return {
    ok: true,
    csv: payableAgingCsv(rows, today),
    filename: `payables-aging-${today}.csv`,
  }
}
