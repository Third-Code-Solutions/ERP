const BASIS_POINT_DENOMINATOR = 10_000n

function toSafeInteger(value: bigint, label: string): number {
  const asNumber = Number(value)
  if (!Number.isSafeInteger(asNumber)) {
    throw new RangeError(`${label} exceeds the supported centavo range`)
  }
  return asNumber
}
function toCentavos(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
  return BigInt(value)
}

function roundHalfUpBasisPoints(value: bigint, basisPoints: bigint): bigint {
  return (
    value * basisPoints + BASIS_POINT_DENOMINATOR / 2n
  ) / BASIS_POINT_DENOMINATOR
}

export function calculateLineTotalCents(
  unitCostCents: number,
  quantity: number
): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('Line quantity must be a non-negative safe integer')
  }

  return toSafeInteger(
    toCentavos(unitCostCents, 'Unit cost') * BigInt(quantity),
    'Line total'
  )
}

// Spec tenancy C-3. The rates type has no VAT-registered flag: PO input VAT
// never follows the buyer's status (D-TEN-2).
export function calculatePurchaseOrderTotals(
  subtotalCents: number,
  rates: { vatBps: number; ewtBps: number }
): {
  subtotalCents: number
  vatCents: number
  withholdingTaxCents: number
  totalCents: number
} {
  const subtotal = toCentavos(subtotalCents, 'Subtotal')
  const vat = roundHalfUpBasisPoints(subtotal, BigInt(rates.vatBps))
  const withholdingTax = roundHalfUpBasisPoints(subtotal, BigInt(rates.ewtBps))
  const total = subtotal + vat - withholdingTax

  return {
    subtotalCents: toSafeInteger(subtotal, 'Subtotal'),
    vatCents: toSafeInteger(vat, 'VAT'),
    withholdingTaxCents: toSafeInteger(withholdingTax, 'Withholding tax'),
    totalCents: toSafeInteger(total, 'Total'),
  }
}
