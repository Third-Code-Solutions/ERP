export const PURCHASE_ORDER_SEQUENCE_KEY = 'purchase_order'

export function formatPurchaseOrderNumber(sequenceValue: number): string {
  if (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1) {
    throw new Error('Purchase Order sequence must be a positive safe integer')
  }

  return `PO-${String(sequenceValue).padStart(4, '0')}`
}

export function parseCanonicalPurchaseOrderNumber(
  value: string | null | undefined
): number | null {
  const match = /^PO-(\d+)$/.exec(value ?? '')
  if (!match) return null

  const sequenceValue = Number(match[1])
  return Number.isSafeInteger(sequenceValue) && sequenceValue > 0
    ? sequenceValue
    : null
}
