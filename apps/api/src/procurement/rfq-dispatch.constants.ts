export const RFQ_DISPATCH_QUEUE =
  'procurement-rfq-dispatch'
export const RFQ_DISPATCH_DEAD_LETTER_QUEUE =
  'procurement-rfq-dispatch-dead-letter'
export const RFQ_DISPATCH_JOB =
  'create-from-approved-bom'
export const RFQ_DISPATCH_DEAD_LETTER_JOB =
  'create-from-approved-bom.failed'
export const RFQ_DISPATCH_ATTEMPTS = 5
export const RFQ_DISPATCH_BACKOFF_MS = 1_000

export function rfqDispatchJobId(
  tenantId: string,
  bomId: string
): string {
  return `rfq1-${tenantId}-${bomId}`
}
