import { encodeCsv, type CsvColumn } from './csv'
import { agingBucket, daysOverdue } from './dates'
import { centavosToPesos } from './money'
import type {
  LedgerExportRow,
  PayableAgingRow,
  ReceivableAgingRow,
} from './report-queries'
import type { TrialBalance, TrialBalanceRange } from './trial-balance'

/**
 * Most data rows one finance CSV may carry; a bigger export is refused (413),
 * as the opportunity export does. Queries fetch one extra row to tell.
 */
export const FINANCE_EXPORT_MAX_ROWS = 50_000
export const FINANCE_EXPORT_QUERY_LIMIT = FINANCE_EXPORT_MAX_ROWS + 1

export function exceedsExportLimit(rows: readonly unknown[]): boolean {
  return rows.length > FINANCE_EXPORT_MAX_ROWS
}

interface TrialBalanceCsvRow {
  code: string
  name: string
  accountType: string
  normalBalance: string
  debit: string
  credit: string
  balance: string
}

function trialBalanceColumns(
  isMovement: boolean
): readonly CsvColumn<TrialBalanceCsvRow>[] {
  return [
    { header: 'account_code', value: (row) => row.code },
    { header: 'account_name', value: (row) => row.name },
    { header: 'account_type', value: (row) => row.accountType },
    { header: 'normal_balance', value: (row) => row.normalBalance },
    { header: 'debit_php', numeric: true, value: (row) => row.debit },
    { header: 'credit_php', numeric: true, value: (row) => row.credit },
    // A period report has no opening balance, so its last column is the net movement.
    {
      header: isMovement ? 'net_movement_php' : 'balance_php',
      numeric: true,
      value: (row) => row.balance,
    },
  ]
}

/** The posting dates a trial balance covers, as written in its file name and RANGE row. */
export function trialBalanceRangeLabel(range: TrialBalanceRange): string {
  return `${range.from ?? 'start'}-to-${range.to}`
}

/**
 * Account rows, then a TOTAL row (its balance cell stays empty because balances
 * on different sides do not add), then a RANGE row naming the posting dates.
 */
export function trialBalanceCsv(
  trialBalance: TrialBalance,
  range: TrialBalanceRange
): string {
  const rows = trialBalance.rows.map(
    (row): TrialBalanceCsvRow => ({
      code: row.code,
      name: row.name,
      accountType: row.accountType,
      normalBalance: row.normalBalance,
      debit: centavosToPesos(row.debitCents),
      credit: centavosToPesos(row.creditCents),
      balance: centavosToPesos(row.balanceCents),
    })
  )
  rows.push({
    code: 'TOTAL',
    name: '',
    accountType: '',
    normalBalance: '',
    debit: centavosToPesos(trialBalance.totalDebitCents),
    credit: centavosToPesos(trialBalance.totalCreditCents),
    balance: '',
  })
  rows.push({
    code: 'RANGE',
    name: range.from
      ? `Net movement of posted entries dated ${range.from} to ${range.to}`
      : `Balances of posted entries dated up to ${range.to}`,
    accountType: '',
    normalBalance: '',
    debit: '',
    credit: '',
    balance: '',
  })
  return encodeCsv(trialBalanceColumns(range.from !== null), rows)
}

const LEDGER_COLUMNS: readonly CsvColumn<LedgerExportRow>[] = [
  { header: 'posting_date', value: (row) => row.postingDate },
  { header: 'journal_number', value: (row) => row.entryNumber },
  { header: 'source', value: (row) => row.sourceType },
  { header: 'account_code', value: (row) => row.accountCode },
  { header: 'account_name', value: (row) => row.accountName },
  { header: 'project', value: (row) => row.projectName },
  { header: 'customer', value: (row) => row.customerName },
  { header: 'vendor', value: (row) => row.vendorName },
  { header: 'description', value: (row) => row.description },
  { header: 'debit_php', numeric: true, value: (row) => centavosToPesos(row.debitCents) },
  { header: 'credit_php', numeric: true, value: (row) => centavosToPesos(row.creditCents) },
]

export function ledgerCsv(rows: readonly LedgerExportRow[]): string {
  return encodeCsv(LEDGER_COLUMNS, rows)
}

interface AgedRow<Source> {
  source: Source
  /** Null when the row has no due date. */
  daysOverdue: number | null
}

function aged<Source>(
  rows: readonly Source[],
  dueDayOf: (row: Source) => string | null,
  asOfDay: string
): AgedRow<Source>[] {
  return rows.map((source) => ({
    source,
    daysOverdue: daysOverdue(dueDayOf(source), asOfDay),
  }))
}

const RECEIVABLE_COLUMNS: readonly CsvColumn<AgedRow<ReceivableAgingRow>>[] = [
  { header: 'customer', value: (row) => row.source.customerName },
  { header: 'project', value: (row) => row.source.projectName },
  { header: 'invoice_number', value: (row) => row.source.invoiceNumber },
  { header: 'issued_date', value: (row) => row.source.issuedDay ?? '' },
  { header: 'due_date', value: (row) => row.source.dueDay ?? '' },
  { header: 'days_overdue', numeric: true, value: (row) => String(row.daysOverdue ?? '') },
  { header: 'aging_bucket', value: (row) => agingBucket(row.daysOverdue) },
  {
    header: 'balance_due_php',
    numeric: true,
    value: (row) => centavosToPesos(row.source.balanceDueCents),
  },
  {
    header: 'retention_open_php',
    numeric: true,
    value: (row) => centavosToPesos(row.source.retentionOpenCents),
  },
]

export function receivableAgingCsv(
  rows: readonly ReceivableAgingRow[],
  asOfDay: string
): string {
  return encodeCsv(RECEIVABLE_COLUMNS, aged(rows, (row) => row.dueDay, asOfDay))
}

const PAYABLE_COLUMNS: readonly CsvColumn<AgedRow<PayableAgingRow>>[] = [
  { header: 'vendor', value: (row) => row.source.vendorName },
  { header: 'vendor_bill_number', value: (row) => row.source.billNumber },
  { header: 'internal_number', value: (row) => row.source.internalNumber },
  { header: 'bill_date', value: (row) => row.source.billDay },
  { header: 'due_date', value: (row) => row.source.dueDay ?? '' },
  { header: 'days_overdue', numeric: true, value: (row) => String(row.daysOverdue ?? '') },
  { header: 'aging_bucket', value: (row) => agingBucket(row.daysOverdue) },
  {
    header: 'total_payable_php',
    numeric: true,
    value: (row) => centavosToPesos(row.source.totalPayableCents),
  },
  {
    header: 'paid_php',
    numeric: true,
    value: (row) => centavosToPesos(row.source.paidCents),
  },
  {
    header: 'open_balance_php',
    numeric: true,
    value: (row) => centavosToPesos(row.source.openCents),
  },
]

export function payableAgingCsv(
  rows: readonly PayableAgingRow[],
  asOfDay: string
): string {
  return encodeCsv(PAYABLE_COLUMNS, aged(rows, (row) => row.dueDay, asOfDay))
}
