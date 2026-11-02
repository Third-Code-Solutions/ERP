import { z } from 'zod'

export const MAX_BOM_LINE_ITEM_QUANTITY = 2_147_483_647
export const BOM_QUANTITY_SCALE = 10_000n

/** Preserve the decimal spelling; never multiply currency by an IEEE-754 quantity. */
export function scaledBomQuantity(value: number): bigint {
  if (!Number.isFinite(value) || value < 0 || value > MAX_BOM_LINE_ITEM_QUANTITY) {
    throw new RangeError('Quantity exceeds the supported BOM range')
  }
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value))
  if (!match) throw new RangeError('Quantity must have at most four decimal places')
  return BigInt(match[1]!) * BOM_QUANTITY_SCALE + BigInt((match[2] ?? '').padEnd(4, '0'))
}

export const bomQuantitySchema = z.number().refine((value) => {
  try { scaledBomQuantity(value); return true } catch { return false }
}, 'Quantity must be non-negative, at most 2147483647, with at most four decimal places')
