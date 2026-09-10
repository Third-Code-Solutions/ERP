import { z } from 'zod'

export const vendorPerformanceRiskSchema = z.enum([
  'new',
  'good',
  'watch',
  'at_risk',
])

export const vendorPerformanceQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
  })
  .strict()

export const vendorPerformanceRowSchema = z
  .object({
    vendorId: z.string().uuid(),
    vendorName: z.string().trim().min(1).max(255),
    poCount: z.number().int().nonnegative(),
    issuedPoCount: z.number().int().nonnegative(),
    openPoCount: z.number().int().nonnegative(),
    committedCents: z.number().int().nonnegative(),
    deliveryCount: z.number().int().nonnegative(),
    acceptedDeliveryCount: z.number().int().nonnegative(),
    rejectedDeliveryCount: z.number().int().nonnegative(),
    onTimeDeliveryCount: z.number().int().nonnegative(),
    onTimeRateBps: z.number().int().min(0).max(10_000).nullable(),
    acceptanceRateBps: z.number().int().min(0).max(10_000).nullable(),
    averageLeadTimeDays: z.number().int().nonnegative().nullable(),
    supplierBillCount: z.number().int().nonnegative(),
    postedBillCount: z.number().int().nonnegative(),
    postedSpendCents: z.number().int().nonnegative(),
    risk: vendorPerformanceRiskSchema,
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export const vendorPerformanceTotalsSchema = z
  .object({
    vendorCount: z.number().int().nonnegative(),
    vendorsWithOrders: z.number().int().nonnegative(),
    atRiskCount: z.number().int().nonnegative(),
    committedCents: z.number().int().nonnegative(),
    postedSpendCents: z.number().int().nonnegative(),
  })
  .strict()

export const vendorPerformanceResultSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    projectId: z.string().uuid().nullable(),
    rows: z.array(vendorPerformanceRowSchema),
    totals: vendorPerformanceTotalsSchema,
  })
  .strict()

export type VendorPerformanceRisk = z.infer<typeof vendorPerformanceRiskSchema>
export type VendorPerformanceQuery = z.infer<typeof vendorPerformanceQuerySchema>
export type VendorPerformanceRow = z.infer<typeof vendorPerformanceRowSchema>
export type VendorPerformanceTotals = z.infer<typeof vendorPerformanceTotalsSchema>
export type VendorPerformanceResult = z.infer<typeof vendorPerformanceResultSchema>

export interface VendorPerformanceAggregate {
  vendorId: string
  vendorName: string
  poCount: number
  issuedPoCount: number
  openPoCount: number
  committedCents: number
  deliveryCount: number
  acceptedDeliveryCount: number
  rejectedDeliveryCount: number
  onTimeDeliveryCount: number
  averageLeadTimeDays: number | null
  supplierBillCount: number
  postedBillCount: number
  postedSpendCents: number
}

function ratioBps(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.min(10_000, Math.max(0, Math.round((numerator * 10_000) / denominator)))
}

/**
 * Turns source aggregates into an explainable supplier-performance row. The
 * score deliberately stays a rule-based operational signal; it is not a
 * credit rating and never invents results when no delivery evidence exists.
 */
export function deriveVendorPerformanceRow(
  aggregate: VendorPerformanceAggregate,
): VendorPerformanceRow {
  const onTimeRateBps = ratioBps(
    aggregate.onTimeDeliveryCount,
    aggregate.deliveryCount,
  )
  const acceptanceRateBps = ratioBps(
    aggregate.acceptedDeliveryCount,
    aggregate.deliveryCount,
  )
  const notes: string[] = []
  let risk: VendorPerformanceRisk

  if (aggregate.poCount === 0) {
    risk = 'new'
    notes.push('No purchase-order history is available yet.')
  } else if (aggregate.rejectedDeliveryCount > 0 || (onTimeRateBps !== null && onTimeRateBps < 7_000)) {
    risk = 'at_risk'
    if (aggregate.rejectedDeliveryCount > 0) notes.push('At least one delivery was rejected.')
    if (onTimeRateBps !== null && onTimeRateBps < 7_000) notes.push('On-time delivery is below the 70% operating threshold.')
  } else if (onTimeRateBps !== null && onTimeRateBps < 8_500) {
    risk = 'watch'
    notes.push('On-time delivery is below the 85% operating target.')
  } else {
    risk = 'good'
  }

  if (aggregate.openPoCount > 0 && aggregate.deliveryCount === 0) {
    risk = risk === 'good' ? 'watch' : risk
    notes.push('Open purchase orders have no delivery evidence yet.')
  }
  if (aggregate.supplierBillCount > aggregate.postedBillCount) {
    notes.push('Some supplier bills are not posted; spend is limited to posted evidence.')
  }
  if (aggregate.deliveryCount === 0 && aggregate.poCount > 0) {
    notes.push('On-time and acceptance rates are unavailable until a delivery is recorded.')
  }

  return vendorPerformanceRowSchema.parse({
    vendorId: aggregate.vendorId,
    vendorName: aggregate.vendorName,
    poCount: aggregate.poCount,
    issuedPoCount: aggregate.issuedPoCount,
    openPoCount: aggregate.openPoCount,
    committedCents: Math.max(0, aggregate.committedCents),
    deliveryCount: aggregate.deliveryCount,
    acceptedDeliveryCount: aggregate.acceptedDeliveryCount,
    rejectedDeliveryCount: aggregate.rejectedDeliveryCount,
    onTimeDeliveryCount: aggregate.onTimeDeliveryCount,
    onTimeRateBps,
    acceptanceRateBps,
    averageLeadTimeDays:
      aggregate.averageLeadTimeDays === null
        ? null
        : Math.max(0, Math.round(aggregate.averageLeadTimeDays)),
    supplierBillCount: aggregate.supplierBillCount,
    postedBillCount: aggregate.postedBillCount,
    postedSpendCents: Math.max(0, aggregate.postedSpendCents),
    risk,
    notes,
  })
}

export function buildVendorPerformanceResult(
  asOf: string,
  projectId: string | null,
  aggregates: VendorPerformanceAggregate[],
): VendorPerformanceResult {
  const rows = aggregates
    .map(deriveVendorPerformanceRow)
    .sort((left, right) => {
      const riskOrder: Record<VendorPerformanceRisk, number> = {
        at_risk: 0,
        watch: 1,
        new: 2,
        good: 3,
      }
      return (
        riskOrder[left.risk] - riskOrder[right.risk] ||
        left.vendorName.localeCompare(right.vendorName)
      )
    })

  return vendorPerformanceResultSchema.parse({
    asOf,
    projectId,
    rows,
    totals: {
      vendorCount: rows.length,
      vendorsWithOrders: rows.filter((row) => row.poCount > 0).length,
      atRiskCount: rows.filter((row) => row.risk === 'at_risk').length,
      committedCents: rows.reduce((sum, row) => sum + row.committedCents, 0),
      postedSpendCents: rows.reduce((sum, row) => sum + row.postedSpendCents, 0),
    },
  })
}
