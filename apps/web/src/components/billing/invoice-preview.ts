import {
  computeEWT,
  computeRetention,
  computeVAT,
  progressBillingAmount,
} from '@third-code-erp/shared-types/bom'

const RETENTION_BPS = 1_000

// D-15: the preview uses the same shared integer functions as the server
// draft, so it cannot drift from the saved invoice by a centavo.
export function previewProgressInvoice(tcvCents: number, billingPercentBps: number) {
  const subtotal = progressBillingAmount(tcvCents, billingPercentBps)
  const retention = computeRetention(subtotal, RETENTION_BPS)
  const base = subtotal - retention
  const vat = computeVAT(base)
  const ewt = computeEWT(base)
  return { subtotal, retention, vat, ewt, net: base + vat - ewt }
}
