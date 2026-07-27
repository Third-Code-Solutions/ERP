export const MICRO_UNITS_PER_WHOLE = 1_000_000

export function quantityToMicros(value: string): number {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error('Quantity requires up to six decimal places')
  }
  const [whole, fraction = ''] = value.split('.')
  const micros =
    BigInt(whole!) * BigInt(MICRO_UNITS_PER_WHOLE) +
    BigInt(fraction.padEnd(6, '0'))
  if (micros <= 0n || micros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Quantity must be positive and within the supported range')
  }
  return Number(micros)
}

export function signedQuantityToMicros(value: string): number {
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error('Quantity requires up to six decimal places')
  }
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const micros = quantityToMicros(unsigned)
  return negative ? -micros : micros
}

export function receiptLineTotal(
  quantityMicros: number,
  unitCostCents: number
): number {
  if (
    !Number.isSafeInteger(quantityMicros) ||
    !Number.isSafeInteger(unitCostCents) ||
    quantityMicros <= 0 ||
    unitCostCents < 0
  ) {
    throw new Error('Receipt line value must be positive and within range')
  }
  const total =
    (BigInt(quantityMicros) * BigInt(unitCostCents) + 500_000n) / 1_000_000n
  if (total <= 0n || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Receipt line value must be positive and within range')
  }
  return Number(total)
}
