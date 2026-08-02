import { z } from 'zod'

const inventoryQuantityPattern = /^\d+(?:\.\d{1,6})?$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const isoDateSchema = z
  .string()
  .regex(isoDatePattern, 'Date requires YYYY-MM-DD')
  .refine((value) => {
    const [yearText, monthText, dayText] = value.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    if (year < 1 || month < 1 || month > 12 || day < 1) return false
    const leap =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [
      31,
      leap ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ]
    return day <= daysInMonth[month - 1]!
  }, 'Date must be a real calendar date')

export const stockReceiptLineCommandSchema = z
  .object({
    poLineItemId: z.string().uuid(),
    quantity: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(
        inventoryQuantityPattern,
        'Quantity requires up to six decimal places'
      ),
  })
  .strict()

export const createStockReceiptCommandSchema = z
  .object({
    warehouseId: z.string().uuid(),
    purchaseOrderId: z.string().uuid(),
    deliveryScheduleId: z.string().uuid().nullable().optional(),
    supplierDeliveryReference: z.string().trim().max(120).nullable().optional(),
    receivedDate: isoDateSchema,
    notes: z.string().trim().max(2_000).nullable().optional(),
    lines: z.array(stockReceiptLineCommandSchema).min(1).max(250),
  })
  .strict()

export const stockReceiptCreationResultSchema = z
  .object({
    stockReceiptId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('draft'),
    lineCount: z.number().int().positive().max(250),
  })
  .strict()

export const stockReceiptPostCommandSchema = z
  .object({
    postingDate: isoDateSchema,
  })
  .strict()

export const stockReceiptReverseCommandSchema = z
  .object({
    postingDate: isoDateSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

export const stockReceiptPostingResultSchema = z
  .object({
    stockReceiptId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('posted'),
    receiptNumber: z.string().regex(/^SR-\d{4}-\d{6}$/),
    journalEntryId: z.string().uuid(),
    journalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export const stockReceiptReversalResultSchema = z
  .object({
    stockReceiptId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('reversed'),
    reversalJournalEntryId: z.string().uuid(),
    reversalJournalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type CreateStockReceiptCommand = z.infer<
  typeof createStockReceiptCommandSchema
>
export type StockReceiptCreationResult = z.infer<
  typeof stockReceiptCreationResultSchema
>
export type StockReceiptPostCommand = z.infer<
  typeof stockReceiptPostCommandSchema
>
export type StockReceiptReverseCommand = z.infer<
  typeof stockReceiptReverseCommandSchema
>
export type StockReceiptPostingResult = z.infer<
  typeof stockReceiptPostingResultSchema
>
export type StockReceiptReversalResult = z.infer<
  typeof stockReceiptReversalResultSchema
>

export const MICRO_UNITS_PER_WHOLE = 1_000_000n

export function quantityToMicros(value: string): bigint {
  const normalized = value.trim()
  if (!inventoryQuantityPattern.test(normalized)) {
    throw new Error('Quantity requires up to six decimal places')
  }
  const [whole, fraction = ''] = normalized.split('.')
  const micros =
    BigInt(whole!) * MICRO_UNITS_PER_WHOLE +
    BigInt(fraction.padEnd(6, '0'))
  if (micros <= 0n) {
    throw new Error('Quantity must be positive and within the supported range')
  }
  return micros
}

export function receiptLineTotal(
  quantityMicros: bigint,
  unitCostCents: bigint
): bigint {
  if (quantityMicros <= 0n || unitCostCents < 0n) {
    throw new Error('Receipt line value must be positive and within range')
  }
  const total =
    (quantityMicros * unitCostCents + MICRO_UNITS_PER_WHOLE / 2n) /
    MICRO_UNITS_PER_WHOLE
  if (total <= 0n) {
    throw new Error('Receipt line value must be positive and within range')
  }
  return total
}
