// Single source of truth for which purchase-order statuses represent a
// COMMITTED cost (non-draft, non-cancelled; covers both the legacy statuses
// and the ABI 3-step approval flow that ends in 'issued'/'fully_delivered').
// Used by cost rollup, dashboard GP-erosion alerts, and the project overview so
// "committed" never diverges between surfaces.
export const COMMITTED_PO_STATUSES = [
  'submitted',
  'confirmed',
  'partial_delivery',
  'delivered',
  'issued',
  'fully_delivered',
] as const
