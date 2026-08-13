const BASIS_POINT_DENOMINATOR = 10_000n
const VAT_BASIS_POINTS = 1_200n
const WITHHOLDING_TAX_BASIS_POINTS = 200n

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

export function calculatePurchaseOrderTotals(subtotalCents: number): {
  subtotalCents: number
  vatCents: number
  withholdingTaxCents: number
  totalCents: number
} {
  const subtotal = toCentavos(subtotalCents, 'Subtotal')
  const vat = roundHalfUpBasisPoints(subtotal, VAT_BASIS_POINTS)
  const withholdingTax = roundHalfUpBasisPoints(
    subtotal,
    WITHHOLDING_TAX_BASIS_POINTS
  )
  const total = subtotal + vat - withholdingTax

  return {
    subtotalCents: toSafeInteger(subtotal, 'Subtotal'),
    vatCents: toSafeInteger(vat, 'VAT'),
    withholdingTaxCents: toSafeInteger(withholdingTax, 'Withholding tax'),
    totalCents: toSafeInteger(total, 'Total'),
  }
}
