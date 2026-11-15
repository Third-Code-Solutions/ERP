import { planStats } from './abi-ops-plan-data'

/**
 * Illustrative record fragments for the process section. Every total is
 * computed from its lines so the page never shows a figure that does not add up.
 */
export type RecordTone = 'ok' | 'watch' | 'alert' | 'neutral'

export interface RecordCell {
  readonly text: string
  readonly tone?: RecordTone
}

export interface RecordColumn {
  readonly label: string
  readonly isNumeric: boolean
}

export interface RecordTotal {
  readonly label: string
  readonly value: string
  readonly isEmphasis?: boolean
}

export interface StageRecord {
  readonly caption: string
  readonly columns: readonly RecordColumn[]
  readonly rows: readonly (readonly RecordCell[])[]
  readonly totals: readonly RecordTotal[]
}

const phpFormat = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export const formatPhp = (value: number): string => phpFormat.format(value)

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`

const text = (value: string, tone?: RecordTone): RecordCell =>
  tone ? { text: value, tone } : { text: value }

const label = (value: string, isNumeric = false): RecordColumn => ({
  label: value,
  isNumeric,
})

// ---- Win -------------------------------------------------------------------

const WIN_TCV = 18_400_000
const WIN_GP_PCT = 22

const winRecord: StageRecord = {
  caption: 'Opportunity',
  columns: [label('Field'), label('Value', true)],
  rows: [
    [text('Opportunity'), text('Level 14 office fit-out')],
    [text('Site'), text(`Makati City, ${Math.round(planStats.grossArea)} m²`)],
    [text('Stage'), text('BOM submission')],
    [text('Expected contract value'), text(formatPhp(WIN_TCV))],
  ],
  totals: [
    {
      label: `Expected gross profit, ${formatPercent(WIN_GP_PCT)}`,
      value: formatPhp(Math.round((WIN_TCV * WIN_GP_PCT) / 100)),
      isEmphasis: true,
    },
  ],
}

// ---- Estimate --------------------------------------------------------------

const bomLines = [
  { item: 'FCU cassette unit, 2.0 TR', qty: planStats.fcuCount, unit: 'ea', rate: 86_500, state: 'Reviewed' },
  { item: 'Ceiling tile, 600 × 600', qty: planStats.ceilingArea, unit: 'm²', rate: 640, state: 'Extracted' },
  { item: 'Drywall partition', qty: planStats.partitionLength, unit: 'lm', rate: 3_850, state: 'Extracted' },
  { item: 'Door set, single leaf', qty: planStats.doorCount, unit: 'ea', rate: 18_200, state: 'Reviewed' },
] as const

const bomAmounts = bomLines.map((line) => Math.round(line.qty * line.rate))
const sumOf = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0)

export const bomTotal = sumOf(bomAmounts)

const estimateRecord: StageRecord = {
  caption: 'Draft bill of materials',
  columns: [label('Item'), label('Quantity', true), label('Rate', true), label('Amount', true), label('State')],
  rows: bomLines.map((line, index) => [
    text(line.item),
    text(`${Number.isInteger(line.qty) ? line.qty : line.qty.toFixed(1)} ${line.unit}`),
    text(formatPhp(line.rate)),
    text(formatPhp(bomAmounts[index] ?? 0)),
    text(line.state, line.state === 'Reviewed' ? 'ok' : 'neutral'),
  ]),
  totals: [{ label: 'Draft total', value: formatPhp(bomTotal), isEmphasis: true }],
}

// ---- Buy -------------------------------------------------------------------

const rfqQuotes = [
  { supplier: 'Supplier A', rate: 88_000 },
  { supplier: 'Supplier B', rate: 84_900 },
  { supplier: 'Supplier C', rate: 86_500 },
] as const

const rfqTotals = rfqQuotes.map((quote) => quote.rate * planStats.fcuCount)
const lowestRfq = Math.min(...rfqTotals)

const buyRecord: StageRecord = {
  caption: `RFQ comparison, ${planStats.fcuCount} FCU`,
  columns: [label('Supplier'), label('Unit price', true), label('Total', true), label('Position')],
  rows: rfqQuotes.map((quote, index) => {
    const total = rfqTotals[index] ?? 0
    const isLowest = total === lowestRfq
    const delta = ((total - lowestRfq) / lowestRfq) * 100
    return [
      text(quote.supplier),
      text(formatPhp(quote.rate)),
      text(formatPhp(total)),
      text(isLowest ? 'Lowest' : `+${delta.toFixed(1)}%`, isLowest ? 'ok' : 'neutral'),
    ]
  }),
  totals: [
    { label: 'Purchase order draft, awaiting approval', value: formatPhp(lowestRfq), isEmphasis: true },
  ],
}

// ---- Build -----------------------------------------------------------------

const WATCH_PCT = 2
const ALERT_PCT = 5

const costScopes = [
  { scope: 'Mechanical', budget: rfqTotals[1] ?? 0, actual: 1_024_300 },
  { scope: 'Ceiling', budget: bomAmounts[1] ?? 0, actual: 412_900 },
  { scope: 'Partitions', budget: bomAmounts[2] ?? 0, actual: 326_700 },
  { scope: 'Doors and joinery', budget: bomAmounts[3] ?? 0, actual: 145_600 },
] as const

function varianceCell(budget: number, actual: number): RecordCell {
  const pct = ((actual - budget) / budget) * 100
  if (pct > ALERT_PCT) return text('Alert', 'alert')
  if (pct > WATCH_PCT) return text('Watch', 'watch')
  return text('On budget', 'ok')
}

const budgetTotal = sumOf(costScopes.map((row) => row.budget))
const actualTotal = sumOf(costScopes.map((row) => row.actual))

const buildRecord: StageRecord = {
  caption: 'Cost against budget',
  columns: [label('Scope'), label('Budget', true), label('Actual', true), label('Variance', true), label('Signal')],
  rows: costScopes.map((row) => {
    const variance = row.actual - row.budget
    const pct = (variance / row.budget) * 100
    return [
      text(row.scope),
      text(formatPhp(row.budget)),
      text(formatPhp(row.actual)),
      text(`${variance >= 0 ? '+' : '-'}${formatPhp(Math.abs(variance))}, ${pct.toFixed(1)}%`),
      varianceCell(row.budget, row.actual),
    ]
  }),
  totals: [
    {
      label: 'Variance to date',
      value: `${formatPhp(actualTotal - budgetTotal)}, ${(((actualTotal - budgetTotal) / budgetTotal) * 100).toFixed(1)}%`,
      isEmphasis: true,
    },
  ],
}

// ---- Bill ------------------------------------------------------------------

const PROGRESS_PCT = 35
const VAT_PCT = 12
const RETENTION_PCT = 10

const grossBilling = Math.round((WIN_TCV * PROGRESS_PCT) / 100)
const vatAmount = Math.round((grossBilling * VAT_PCT) / 100)
const retentionAmount = Math.round((grossBilling * RETENTION_PCT) / 100)
export const netReceivable = grossBilling + vatAmount - retentionAmount

const billRecord: StageRecord = {
  caption: `Progress billing, ${PROGRESS_PCT}% complete`,
  columns: [label('Line'), label('Amount', true)],
  rows: [
    [text('Contract value'), text(formatPhp(WIN_TCV))],
    [text(`Gross progress billing, ${PROGRESS_PCT}%`), text(formatPhp(grossBilling))],
    [text(`VAT, ${VAT_PCT}%`), text(formatPhp(vatAmount))],
    [text(`Less retention, ${RETENTION_PCT}% of gross`), text(`-${formatPhp(retentionAmount)}`)],
  ],
  totals: [{ label: 'Net receivable', value: formatPhp(netReceivable), isEmphasis: true }],
}

export const stageRecords = {
  win: winRecord,
  estimate: estimateRecord,
  buy: buyRecord,
  build: buildRecord,
  bill: billRecord,
} as const satisfies Record<string, StageRecord>

export type StageId = keyof typeof stageRecords

export const recordMath = {
  actualTotal,
  budgetTotal,
  grossBilling,
  lowestRfq,
  retentionAmount,
  vatAmount,
} as const
