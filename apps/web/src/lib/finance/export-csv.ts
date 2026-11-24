import { encodeCsv, type CsvColumn } from './csv'
import { agingBucket, daysOverdue } from './dates'
import { centavosToPesos } from './money'
import type {
  LedgerExportRow,
  PayableAgingRow,
  ReceivableAgingRow,
} from './report-queries'
import type { TrialBalance } from './trial-balance'

/** Hard cap on data rows in any finance CSV. Queries fetch one extra row to detect truncation. */
export const FINANCE_EXPORT_MAX_ROWS = 50_000
export const FINANCE_EXPORT_QUERY_LIMIT = FINANCE_EXPORT_MAX_ROWS + 1

export function capExportRows<T>(rows: readonly T[]): {
  rows: T[]
  truncated: boolean
} {
  return {
    rows: rows.slice(0, FINANCE_EXPORT_MAX_ROWS),
    truncated: rows.length > FINANCE_EXPORT_MAX_ROWS,
  }
}

const TRUNCATION_NOTICE =
  `NOTE: export truncated at ${FINANCE_EXPORT_MAX_ROWS.toLocaleString('en-US')} rows. ` +
  'Narrow the filters and export again for the remaining rows.'

function noticeFor(truncated: boolean): string | undefined {
  return truncated ? TRUNCATION_NOTICE : undefined
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

const TRIAL_BALANCE_COLUMNS: readonly CsvColumn<TrialBalanceCsvRow>[] = [
  { header: 'account_code', value: (row) => row.code },
  { header: 'account_name', value: (row) => row.name },
  { header: 'account_type', value: (row) => row.accountType },
  { header: 'normal_balance', value: (row) => row.normalBalance },
  { header: 'debit_php', numeric: true, value: (row) => row.debit },
  { header: 'credit_php', numeric: true, value: (row) => row.credit },
  { header: 'balance_php', numeric: true, value: (row) => row.balance },
]

/** Account rows followed by a TOTAL row; its balance cell stays empty because balances on different sides do not add. */
export function trialBalanceCsv(trialBalance: TrialBalance): string {
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
  return encodeCsv(TRIAL_BALANCE_COLUMNS, rows)
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

export function ledgerCsv(rows: readonly LedgerExportRow[], truncated: boolean): string {
  return encodeCsv(LEDGER_COLUMNS, rows, noticeFor(truncated))
}

interface AgedRow<Source> {
  source: Source
  daysOverdue: number
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
  { header: 'days_overdue', numeric: true, value: (row) => String(row.daysOverdue) },
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
  asOfDay: string,
  truncated: boolean
): string {
  return encodeCsv(
    RECEIVABLE_COLUMNS,
    aged(rows, (row) => row.dueDay, asOfDay),
    noticeFor(truncated)
  )
}

const PAYABLE_COLUMNS: readonly CsvColumn<AgedRow<PayableAgingRow>>[] = [
  { header: 'vendor', value: (row) => row.source.vendorName },
  { header: 'vendor_bill_number', value: (row) => row.source.billNumber },
  { header: 'internal_number', value: (row) => row.source.internalNumber },
  { header: 'bill_date', value: (row) => row.source.billDay },
  { header: 'due_date', value: (row) => row.source.dueDay ?? '' },
  { header: 'days_overdue', numeric: true, value: (row) => String(row.daysOverdue) },
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
  asOfDay: string,
  truncated: boolean
): string {
  return encodeCsv(
    PAYABLE_COLUMNS,
    aged(rows, (row) => row.dueDay, asOfDay),
    noticeFor(truncated)
  )
}
