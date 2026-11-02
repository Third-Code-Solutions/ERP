import { manualLineTotal } from '@third-code-erp/shared-types/bom'

/** Parse user-entered peso text without routing money through IEEE-754 floats. */
export function parsePesosToCents(raw: string): number | undefined {
  const value = raw.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined

  const [whole = '0', fraction = ''] = value.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  const result = Number(cents)
  return Number.isSafeInteger(result) ? result : undefined
}

export function multiplyCents(
  unitCostCents: number,
  quantity: number
): number | undefined {
  if (
    !Number.isSafeInteger(unitCostCents) ||
    unitCostCents < 0 ||
    quantity < 0
  ) {
    return undefined
  }

  try { return manualLineTotal(unitCostCents, quantity) } catch { return undefined }
}
