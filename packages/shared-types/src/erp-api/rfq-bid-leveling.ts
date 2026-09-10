import { z } from 'zod'

const optionalUuid = z.string().uuid().nullable()

export const rfqBidLevelingLineSchema = z
  .object({
    lineKey: z.string().trim().min(1).max(200),
    bomLineItemId: optionalUuid,
    materialItemId: optionalUuid,
    code: z.string().trim().max(64).nullable(),
    description: z.string().trim().min(1).max(5000),
    quantity: z.number().finite().nonnegative(),
    unit: z.string().trim().max(32).nullable(),
    quotes: z.array(z.lazy(() => rfqBidLevelingQuoteSchema)),
    lowestUnitPriceCents: z.number().int().nonnegative().nullable(),
  })
  .strict()

export const rfqBidLevelingQuoteSchema = z
  .object({
    quoteId: z.string().uuid(),
    vendorId: z.string().uuid(),
    vendorName: z.string().trim().min(1).max(255),
    unitPriceCents: z.number().int().nonnegative(),
    leadTimeDays: z.number().int().nonnegative().nullable(),
    validUntil: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    ageDays: z.number().int().nonnegative(),
    isStale: z.boolean(),
    isLowestPrice: z.boolean(),
    isAwarded: z.boolean(),
  })
  .strict()

export const rfqBidLevelingResultSchema = z
  .object({
    rfqId: z.string().uuid(),
    projectId: z.string().uuid(),
    status: z.enum(['pending', 'quotes_received', 'completed', 'cancelled']),
    asOf: z.string().datetime({ offset: true }),
    staleAfterDays: z.literal(90),
    lines: z.array(rfqBidLevelingLineSchema),
    vendorCount: z.number().int().nonnegative(),
    coveredLineCount: z.number().int().nonnegative(),
    totalLineCount: z.number().int().nonnegative(),
    staleQuoteCount: z.number().int().nonnegative(),
    awardedQuoteCount: z.number().int().nonnegative(),
  })
  .strict()

export type RfqBidLevelingLine = z.infer<typeof rfqBidLevelingLineSchema>
export type RfqBidLevelingQuote = z.infer<typeof rfqBidLevelingQuoteSchema>
export type RfqBidLevelingResult = z.infer<typeof rfqBidLevelingResultSchema>

export interface RfqBidLevelingSourceLine {
  bomLineItemId?: string
  materialItemId: string | null
  code: string | null
  description: string
  quantity: number
  unit: string | null
}

export interface RfqBidLevelingSourceQuote {
  quoteId: string
  bomLineItemId: string | null
  materialItemId: string | null
  materialCode: string | null
  vendorId: string
  vendorName: string
  unitPriceCents: number
  leadTimeDays: number | null
  validUntil: Date | null
  createdAt: Date
  isAwarded: boolean
}

function matchesLine(
  quote: RfqBidLevelingSourceQuote,
  line: RfqBidLevelingSourceLine,
): boolean {
  if (line.bomLineItemId && quote.bomLineItemId === line.bomLineItemId) return true
  if (line.materialItemId && quote.materialItemId === line.materialItemId) return true
  return Boolean(line.code && quote.materialCode === line.code)
}

function ageDays(createdAt: Date, asOf: Date): number {
  const delta = asOf.getTime() - createdAt.getTime()
  return Math.max(0, Math.floor(delta / 86_400_000))
}

/**
 * Builds a transparent comparison matrix. It deliberately exposes price and
 * lead-time evidence rather than selecting a winner; commercial approval stays
 * in the existing award command.
 */
export function buildRfqBidLevelingResult(
  rfqId: string,
  projectId: string,
  status: RfqBidLevelingResult['status'],
  sourceLines: readonly RfqBidLevelingSourceLine[],
  sourceQuotes: readonly RfqBidLevelingSourceQuote[],
  asOf = new Date(),
): RfqBidLevelingResult {
  const vendorIds = new Set<string>()
  let staleQuoteCount = 0
  let awardedQuoteCount = 0
  const lines = sourceLines.map((line, index) => {
    const lineQuotes = sourceQuotes.filter((quote) => matchesLine(quote, line))
    const lowest = lineQuotes.length === 0
      ? null
      : Math.min(...lineQuotes.map((quote) => quote.unitPriceCents))
    const quotes = lineQuotes
      .map((quote) => {
        vendorIds.add(quote.vendorId)
        const quoteAgeDays = ageDays(quote.createdAt, asOf)
        const stale = quoteAgeDays > 90 || (quote.validUntil !== null && quote.validUntil.getTime() < asOf.getTime())
        if (stale) staleQuoteCount += 1
        if (quote.isAwarded) awardedQuoteCount += 1
        return {
          quoteId: quote.quoteId,
          vendorId: quote.vendorId,
          vendorName: quote.vendorName,
          unitPriceCents: quote.unitPriceCents,
          leadTimeDays: quote.leadTimeDays,
          validUntil: quote.validUntil?.toISOString() ?? null,
          createdAt: quote.createdAt.toISOString(),
          ageDays: quoteAgeDays,
          isStale: stale,
          isLowestPrice: lowest !== null && quote.unitPriceCents === lowest,
          isAwarded: quote.isAwarded,
        }
      })
      .sort((left, right) => left.unitPriceCents - right.unitPriceCents || left.vendorName.localeCompare(right.vendorName))
    return rfqBidLevelingLineSchema.parse({
      lineKey: line.bomLineItemId ?? line.materialItemId ?? line.code ?? `line-${index + 1}`,
      bomLineItemId: line.bomLineItemId ?? null,
      materialItemId: line.materialItemId,
      code: line.code,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      quotes,
      lowestUnitPriceCents: lowest,
    })
  })

  return rfqBidLevelingResultSchema.parse({
    rfqId,
    projectId,
    status,
    asOf: asOf.toISOString(),
    staleAfterDays: 90,
    lines,
    vendorCount: vendorIds.size,
    coveredLineCount: lines.filter((line) => line.quotes.length > 0).length,
    totalLineCount: lines.length,
    staleQuoteCount,
    awardedQuoteCount,
  })
}
