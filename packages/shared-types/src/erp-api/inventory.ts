import { z } from 'zod'

const inventoryQuantityPattern = /^\d+(?:\.\d{1,6})?$/
const inventorySignedQuantityPattern = /^-?\d+(?:\.\d{1,6})?$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const integerStringPattern = /^-?\d+$/

const inventorySummaryUomSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(120),
    decimalPlaces: z.number().int().nonnegative().max(6),
    isActive: z.boolean(),
  })
  .strict()

const inventorySummaryWarehouseSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    isActive: z.boolean(),
  })
  .strict()

const inventorySummaryItemSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().trim().min(1).max(64),
    description: z.string(),
    baseUomId: z.string().uuid(),
    inventoryTracked: z.boolean(),
    isActive: z.boolean(),
  })
  .strict()

const inventorySummaryProjectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
  })
  .strict()

const inventorySummaryBalanceSchema = z
  .object({
    warehouseId: z.string().uuid(),
    warehouseCode: z.string().trim().min(1).max(40),
    warehouseName: z.string().trim().min(1).max(160),
    itemId: z.string().uuid(),
    itemCode: z.string().trim().min(1).max(64),
    itemDescription: z.string(),
    uomCode: z.string().trim().min(1).max(32),
    quantityMicros: z.string().regex(integerStringPattern),
    valueCents: z.string().regex(integerStringPattern),
  })
  .strict()

const inventorySummaryReceiptCountsSchema = z
  .object({
    draftCount: z.number().int().nonnegative(),
    postedCount: z.number().int().nonnegative(),
  })
  .strict()

export const inventorySummaryResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    uoms: z.array(inventorySummaryUomSchema).max(500),
    warehouses: z.array(inventorySummaryWarehouseSchema).max(500),
    items: z.array(inventorySummaryItemSchema).max(1_000),
    projects: z.array(inventorySummaryProjectSchema).max(500),
    balances: z.array(inventorySummaryBalanceSchema).max(500),
    balancesTruncated: z.boolean(),
    receiptCounts: inventorySummaryReceiptCountsSchema,
  })
  .strict()

export type InventorySummaryResult = z.infer<
  typeof inventorySummaryResultSchema
>

export const createInventoryUomCommandSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(120),
    decimalPlaces: z.number().int().nonnegative().max(6),
  })
  .strict()

export const inventoryUomCreationResultSchema = z
  .object({
    uomId: z.string().uuid(),
    tenantId: z.string().uuid(),
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(120),
    decimalPlaces: z.number().int().nonnegative().max(6),
    isActive: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type CreateInventoryUomCommand = z.infer<
  typeof createInventoryUomCommandSchema
>
export type InventoryUomCreationResult = z.infer<
  typeof inventoryUomCreationResultSchema
>

export const createInventoryWarehouseCommandSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
  })
  .strict()

export const inventoryWarehouseCreationResultSchema = z
  .object({
    warehouseId: z.string().uuid(),
    tenantId: z.string().uuid(),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type CreateInventoryWarehouseCommand = z.infer<
  typeof createInventoryWarehouseCommandSchema
>
export type InventoryWarehouseCreationResult = z.infer<
  typeof inventoryWarehouseCreationResultSchema
>

export const updateInventoryWarehouseCommandSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    isActive: z.boolean(),
  })
  .strict()

export const inventoryWarehouseUpdateResultSchema = z
  .object({
    warehouseId: z.string().uuid(),
    tenantId: z.string().uuid(),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type UpdateInventoryWarehouseCommand = z.infer<
  typeof updateInventoryWarehouseCommandSchema
>
export type InventoryWarehouseUpdateResult = z.infer<
  typeof inventoryWarehouseUpdateResultSchema
>

export const inventoryWarehouseCloseoutResultSchema = z
  .object({
    warehouseId: z.string().uuid(),
    tenantId: z.string().uuid(),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    projectId: z.string().uuid().nullable(),
    isActive: z.boolean(),
    quantityMicros: z.string().regex(integerStringPattern),
    valueCents: z.string().regex(integerStringPattern),
    canDeactivate: z.boolean(),
    disposition: z.enum(['ready', 'already_inactive', 'nonzero_balance']),
  })
  .strict()

export type InventoryWarehouseCloseoutResult = z.infer<
  typeof inventoryWarehouseCloseoutResultSchema
>

export const stockMovementTypeValues = [
  'transfer',
  'consumption',
  'adjustment',
] as const

export const stockMovementStatusValues = [
  'draft',
  'posted',
  'reversed',
] as const

const inventoryStockMovementRowSchema = z
  .object({
    id: z.string().uuid(),
    internalNumber: z.string().trim().max(40).nullable(),
    movementType: z.enum(stockMovementTypeValues),
    status: z.enum(stockMovementStatusValues),
    movementDate: z.string().regex(isoDatePattern),
    reason: z.string().trim().min(3).max(2_000),
    sourceWarehouseCode: z.string().trim().min(1).max(40),
    targetWarehouseCode: z.string().trim().min(1).max(40).nullable(),
    projectName: z.string().nullable(),
    lineCount: z.number().int().nonnegative().max(250),
    totalValueCents: z.string().regex(integerStringPattern),
  })
  .strict()

export const inventoryStockMovementListQuerySchema = z
  .object({
    movementType: z.enum(stockMovementTypeValues).optional(),
    status: z.enum(stockMovementStatusValues).optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(500),
  })
  .strict()

export const inventoryStockMovementListResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    rows: z.array(inventoryStockMovementRowSchema).max(500),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(500),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type StockMovementType = (typeof stockMovementTypeValues)[number]
export type StockMovementStatus = (typeof stockMovementStatusValues)[number]
export type InventoryStockMovementRow = z.infer<
  typeof inventoryStockMovementRowSchema
>
export type InventoryStockMovementListQuery = z.infer<
  typeof inventoryStockMovementListQuerySchema
>
export type InventoryStockMovementListResult = z.infer<
  typeof inventoryStockMovementListResultSchema
>

const inventoryStockMovementDetailLineSchema = z
  .object({
    id: z.string().uuid(),
    lineNumber: z.number().int().min(1).max(200),
    itemCode: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(2_000),
    uomCode: z.string().trim().min(1).max(32),
    costCode: z.string().trim().min(1).max(40).nullable(),
    quantityMicros: z.string().regex(integerStringPattern),
    declaredUnitCostCents: z.string().regex(integerStringPattern).nullable(),
    postedUnitCostCents: z.string().regex(integerStringPattern).nullable(),
    postedValueCents: z.string().regex(integerStringPattern).nullable(),
  })
  .strict()

const inventoryStockMovementLedgerEntrySchema = z
  .object({
    id: z.string().uuid(),
    eventType: z.string().trim().min(1).max(40),
    occurredOn: z.string().regex(isoDatePattern),
    itemCode: z.string().trim().min(1).max(64),
    warehouseCode: z.string().trim().min(1).max(40),
    quantityDeltaMicros: z.string().regex(integerStringPattern),
    valueDeltaCents: z.string().regex(integerStringPattern),
    reversesStockLedgerEntryId: z.string().uuid().nullable(),
  })
  .strict()

const inventoryStockMovementDetailHeaderSchema = z
  .object({
    id: z.string().uuid(),
    internalNumber: z.string().trim().max(40).nullable(),
    movementType: z.enum(stockMovementTypeValues),
    status: z.enum(stockMovementStatusValues),
    movementDate: z.string().regex(isoDatePattern),
    currency: z.string().regex(/^[A-Z]{3}$/),
    reason: z.string().trim().min(3).max(2_000),
    sourceWarehouseCode: z.string().trim().min(1).max(40),
    sourceWarehouseName: z.string().trim().min(1).max(160),
    targetWarehouseCode: z.string().trim().min(1).max(40).nullable(),
    targetWarehouseName: z.string().trim().min(1).max(160).nullable(),
    projectName: z.string().trim().min(1).max(200).nullable(),
    postingJournalEntryId: z.string().uuid().nullable(),
    postingJournalNumber: z.string().trim().max(40).nullable(),
    reversalJournalEntryId: z.string().uuid().nullable(),
    reversalJournalNumber: z.string().trim().max(40).nullable(),
    postedAt: z.string().datetime({ offset: true }).nullable(),
    reversedAt: z.string().datetime({ offset: true }).nullable(),
    reversalReason: z.string().trim().min(3).max(1_000).nullable(),
  })
  .strict()

export const inventoryStockMovementDetailResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    movement: inventoryStockMovementDetailHeaderSchema,
    lines: z.array(inventoryStockMovementDetailLineSchema).max(200),
    ledger: z.array(inventoryStockMovementLedgerEntrySchema).max(1_000),
  })
  .strict()

export type InventoryStockMovementDetailLine = z.infer<
  typeof inventoryStockMovementDetailLineSchema
>
export type InventoryStockMovementLedgerEntry = z.infer<
  typeof inventoryStockMovementLedgerEntrySchema
>
export type InventoryStockMovementDetailHeader = z.infer<
  typeof inventoryStockMovementDetailHeaderSchema
>
export type InventoryStockMovementDetailResult = z.infer<
  typeof inventoryStockMovementDetailResultSchema
>

export const configureInventoryItemCommandSchema = z
  .object({
    uomId: z.string().uuid(),
    tracked: z.boolean(),
  })
  .strict()

export const inventoryItemConfigurationResultSchema = z
  .object({
    materialItemId: z.string().uuid(),
    tenantId: z.string().uuid(),
    baseUomId: z.string().uuid(),
    inventoryTracked: z.boolean(),
    unit: z.string().trim().min(1).max(32),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type ConfigureInventoryItemCommand = z.infer<
  typeof configureInventoryItemCommandSchema
>
export type InventoryItemConfigurationResult = z.infer<
  typeof inventoryItemConfigurationResultSchema
>

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

const stockMovementLineCommandSchema = z
  .object({
    materialItemId: z.string().uuid(),
    quantity: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(
        inventorySignedQuantityPattern,
        'Quantity requires up to six decimal places'
      ),
    costCodeId: z.string().uuid().nullable().optional(),
    declaredUnitCostPhp: z.string().trim().max(32).nullable().optional(),
  })
  .strict()

export const createStockMovementCommandSchema = z
  .object({
    movementType: z.enum(stockMovementTypeValues),
    sourceWarehouseId: z.string().uuid(),
    targetWarehouseId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    movementDate: isoDateSchema,
    reason: z.string().trim().min(3).max(2_000),
    lines: z.array(stockMovementLineCommandSchema).min(1).max(200),
  })
  .strict()

export const stockMovementCreationResultSchema = z
  .object({
    stockMovementId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('draft'),
    lineCount: z.number().int().positive().max(200),
  })
  .strict()

export const stockMovementPostCommandSchema = z.object({}).strict()

export const stockMovementReverseCommandSchema = z
  .object({
    reason: z.string().trim().min(3).max(1_000),
    reversalDate: isoDateSchema,
  })
  .strict()

export const stockMovementPostingResultSchema = z
  .object({
    stockMovementId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('posted'),
    movementNumber: z.string().regex(/^SM-\d{4}-\d{6}$/),
    journalEntryId: z.string().uuid().nullable(),
    journalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/).nullable(),
  })
  .strict()

export const stockMovementReversalResultSchema = z
  .object({
    stockMovementId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('reversed'),
    reversalJournalEntryId: z.string().uuid().nullable(),
    reversalJournalEntryNumber: z
      .string()
      .regex(/^JE-\d{4}-\d{6}$/)
      .nullable(),
  })
  .strict()

export type CreateStockMovementCommand = z.infer<
  typeof createStockMovementCommandSchema
>
export type StockMovementCreationResult = z.infer<
  typeof stockMovementCreationResultSchema
>
export type StockMovementPostCommand = z.infer<
  typeof stockMovementPostCommandSchema
>
export type StockMovementReverseCommand = z.infer<
  typeof stockMovementReverseCommandSchema
>
export type StockMovementPostingResult = z.infer<
  typeof stockMovementPostingResultSchema
>
export type StockMovementReversalResult = z.infer<
  typeof stockMovementReversalResultSchema
>

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

export function signedQuantityToMicros(value: string): bigint {
  const normalized = value.trim()
  if (!inventorySignedQuantityPattern.test(normalized)) {
    throw new Error('Quantity requires up to six decimal places')
  }
  if (normalized.startsWith('-')) {
    return -quantityToMicros(normalized.slice(1))
  }
  return quantityToMicros(normalized)
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
