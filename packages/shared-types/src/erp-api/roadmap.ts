import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'

const uuid = z.string().guid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const integerString = z.string().regex(/^-?\d+$/)
const nonNegativeIntegerString = z.string().regex(/^\d+$/)
const currency = z.string().regex(/^[A-Z]{3}$/)

export const roadmapFeatureKeys = [
  'procurement_lifecycle',
  'stock_reservations',
  'landed_cost',
  'price_lists',
  'tax_statutory_outputs',
  'multi_currency',
  'period_close',
  'sap_posting',
  'provider_delivery',
] as const

export const roadmapFeatureKeySchema = z.enum(roadmapFeatureKeys)
export type RoadmapFeatureKey = z.infer<typeof roadmapFeatureKeySchema>

const requisitionLineSchema = z
  .object({
    description: z.string().trim().min(1).max(2_000),
    materialItemId: uuid.nullable().optional(),
    bomLineItemId: uuid.nullable().optional(),
    costCodeId: uuid.nullable().optional(),
    uomId: uuid.nullable().optional(),
    quantityMicros: nonNegativeIntegerString,
    estimatedUnitCostCents: nonNegativeIntegerString,
  })
  .strict()
  .superRefine((line, context) => {
    if (BigInt(line.quantityMicros) <= 0n) {
      context.addIssue({ code: 'custom', path: ['quantityMicros'], message: 'Quantity must be positive' })
    }
  })

export const createProcurementRequisitionCommandSchema = z
  .object({
    projectId: uuid,
    purpose: z.string().trim().min(3).max(2_000),
    neededBy: isoDate.nullable().optional(),
    currency,
    lines: z.array(requisitionLineSchema).min(1).max(250),
  })
  .strict()

export const procurementRequisitionActionSchema = z.enum([
  'submit',
  'approve',
  'reject',
  'cancel',
  'convert_to_po',
])

export const procurementRequisitionWorkflowCommandSchema = z
  .object({
    action: procurementRequisitionActionSchema,
    reason: z.string().trim().max(1_000).nullable().optional(),
    selectedQuoteIds: z.array(uuid).max(250).optional(),
  })
  .strict()

export const procurementRequisitionResultSchema = z
  .object({
    requisitionId: uuid,
    tenantId: uuid,
    requisitionNumber: z.string().trim().min(1).max(40),
    status: z.enum(['draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled']),
    estimatedTotalCents: nonNegativeIntegerString,
    lineCount: z.number().int().positive().max(250),
    created: z.boolean(),
  })
  .strict()

export const reserveInventoryCommandSchema = z
  .object({
    warehouseId: uuid,
    materialItemId: uuid,
    uomId: uuid,
    projectId: uuid.nullable().optional(),
    costCodeId: uuid.nullable().optional(),
    poLineItemId: uuid.nullable().optional(),
    quantityMicros: nonNegativeIntegerString,
    sourceType: z.string().trim().min(1).max(32),
    sourceId: uuid.nullable().optional(),
    expiresAt: isoDateTimeString({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (BigInt(value.quantityMicros) <= 0n) {
      context.addIssue({ code: 'custom', path: ['quantityMicros'], message: 'Quantity must be positive' })
    }
  })

export const inventoryReservationActionSchema = z.enum(['release', 'consume', 'expire'])
export const inventoryReservationWorkflowCommandSchema = z
  .object({
    action: inventoryReservationActionSchema,
    reason: z.string().trim().min(3).max(1_000).nullable().optional(),
  })
  .strict()

export const inventoryReservationResultSchema = z
  .object({
    reservationId: uuid,
    tenantId: uuid,
    status: z.enum(['active', 'released', 'consumed', 'expired']),
    quantityMicros: nonNegativeIntegerString,
    availableQuantityMicros: integerString,
    created: z.boolean(),
  })
  .strict()

export const landedCostLineSchema = z
  .object({
    componentType: z.enum(['freight', 'duty', 'insurance', 'handling', 'other']),
    description: z.string().trim().min(1).max(2_000),
    amountCents: nonNegativeIntegerString,
  })
  .strict()
  .superRefine((line, context) => {
    if (BigInt(line.amountCents) <= 0n) {
      context.addIssue({ code: 'custom', path: ['amountCents'], message: 'Amount must be positive' })
    }
  })

export const applyLandedCostCommandSchema = z
  .object({
    stockReceiptId: uuid,
    documentNumber: z.string().trim().min(1).max(80),
    currency,
    allocationBasis: z.enum(['quantity', 'value', 'weight']),
    lines: z.array(landedCostLineSchema).min(1).max(100),
  })
  .strict()

export const priceResolutionQuerySchema = z
  .object({
    materialItemId: uuid,
    uomId: uuid,
    quantityMicros: nonNegativeIntegerString,
    asOf: isoDate,
    currency,
  })
  .strict()

export const priceResolutionResultSchema = z
  .object({
    priceListId: uuid,
    priceListItemId: uuid,
    vendorId: uuid.nullable(),
    unitPriceCents: nonNegativeIntegerString,
    currency,
    stale: z.boolean(),
    validFrom: isoDate,
    validTo: isoDate.nullable(),
  })
  .strict()

export const priceListItemInputSchema = z
  .object({
    materialItemId: uuid,
    uomId: uuid,
    minimumQuantityMicros: nonNegativeIntegerString,
    unitPriceCents: nonNegativeIntegerString,
    leadTimeDays: z.number().int().nonnegative().nullable().optional(),
    sourceReference: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (BigInt(value.minimumQuantityMicros) <= 0n) {
      context.addIssue({ code: 'custom', path: ['minimumQuantityMicros'], message: 'Minimum quantity must be positive' })
    }
  })

export const createPriceListCommandSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    vendorId: uuid.nullable().optional(),
    currency,
    validFrom: isoDate,
    validTo: isoDate.nullable().optional(),
    items: z.array(priceListItemInputSchema).min(1).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.validTo !== null && value.validTo !== undefined && value.validTo < value.validFrom) {
      context.addIssue({ code: 'custom', path: ['validTo'], message: 'Valid-to date must not precede valid-from date' })
    }
  })

export const priceListResultSchema = z
  .object({
    priceListId: uuid,
    tenantId: uuid,
    code: z.string().min(1),
    status: z.enum(['draft', 'active', 'retired']),
    itemCount: z.number().int().positive(),
    created: z.boolean(),
  })
  .strict()

export const activatePriceListCommandSchema = z
  .object({ action: z.enum(['activate', 'retire']) })
  .strict()

export const roadmapWorkflowActionSchema = z
  .object({ action: z.enum(['activate', 'retire']) })
  .strict()

export const exchangeRateSchema = z
  .object({
    fromCurrency: currency,
    toCurrency: currency,
    rateNumerator: nonNegativeIntegerString,
    rateDenominator: nonNegativeIntegerString,
    effectiveOn: isoDate,
    source: z.string().trim().min(1).max(64),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fromCurrency === value.toCurrency) {
      context.addIssue({ code: 'custom', path: ['toCurrency'], message: 'Currencies must differ' })
    }
    if (BigInt(value.rateNumerator) <= 0n || BigInt(value.rateDenominator) <= 0n) {
      context.addIssue({ code: 'custom', path: ['rateNumerator'], message: 'Exchange rate must be positive' })
    }
  })

export const createExchangeRateCommandSchema = exchangeRateSchema

export const exchangeRateResultSchema = z
  .object({
    exchangeRateId: uuid,
    tenantId: uuid,
    fromCurrency: currency,
    toCurrency: currency,
    effectiveOn: isoDate,
    created: z.boolean(),
  })
  .strict()

export const tenantCurrencyCommandSchema = z
  .object({
    currencyCode: currency,
    decimalPlaces: z.number().int().min(0).max(6),
    isBase: z.boolean(),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isBase && !value.isActive) {
      context.addIssue({ code: 'custom', path: ['isActive'], message: 'The base currency must be active' })
    }
  })

export const tenantCurrencyResultSchema = z
  .object({
    tenantCurrencyId: uuid,
    tenantId: uuid,
    currencyCode: currency,
    decimalPlaces: z.number().int().min(0).max(6),
    isBase: z.boolean(),
    isActive: z.boolean(),
    created: z.boolean(),
  })
  .strict()

export const taxProfileSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    validFrom: isoDate,
    validTo: isoDate.nullable().optional(),
    vatRateBps: z.number().int().min(0).max(10_000),
    withholdingRateBps: z.number().int().min(0).max(10_000),
    retentionRateBps: z.number().int().min(0).max(10_000),
    vatRegistered: z.boolean(),
    birFormVersion: z.string().trim().max(40).nullable().optional(),
    statutoryConfiguration: z.record(z.string(), z.unknown()),
  })
  .strict()

export const calculateTaxResultSchema = z
  .object({
    baseCents: nonNegativeIntegerString,
    vatCents: nonNegativeIntegerString,
    withholdingTaxCents: nonNegativeIntegerString,
    retentionCents: nonNegativeIntegerString,
    netCents: nonNegativeIntegerString,
  })
  .strict()

export const calculateTaxCommandSchema = z
  .object({
    baseCents: nonNegativeIntegerString,
    vatRateBps: z.number().int().min(0).max(10_000),
    withholdingRateBps: z.number().int().min(0).max(10_000),
    retentionRateBps: z.number().int().min(0).max(10_000),
    vatRegistered: z.boolean(),
  })
  .strict()

export const calculateTaxByProfileCommandSchema = z
  .object({
    taxProfileId: uuid,
    baseCents: nonNegativeIntegerString,
    asOf: isoDate,
  })
  .strict()

export const createTaxProfileCommandSchema = taxProfileSchema

export const taxProfileResultSchema = z
  .object({
    taxProfileId: uuid,
    tenantId: uuid,
    code: z.string().min(1),
    status: z.enum(['draft', 'active', 'retired']),
    created: z.boolean(),
  })
  .strict()

export const taxProfileWorkflowCommandSchema = z
  .object({ action: z.enum(['activate', 'retire']) })
  .strict()

export const procurementTraceResultSchema = z
  .object({
    requisitionId: uuid,
    tenantId: uuid,
    requisitionNumber: z.string().min(1),
    requisitionStatus: z.string().min(1),
    purchaseOrder: z
      .object({
        id: uuid,
        poNumber: z.string().min(1),
        status: z.string().min(1),
      })
      .strict()
      .nullable(),
    receipts: z
      .array(
        z
          .object({ id: uuid, internalNumber: z.string().nullable(), status: z.string().min(1) })
          .strict(),
      )
      .max(100),
    bills: z
      .array(
        z
          .object({ id: uuid, vendorBillNumber: z.string().min(1), status: z.string().min(1), totalPayableCents: nonNegativeIntegerString })
          .strict(),
      )
      .max(100),
    payments: z
      .array(
        z
          .object({ id: uuid, status: z.string().min(1), amountCents: nonNegativeIntegerString, currency })
          .strict(),
      )
      .max(100),
  })
  .strict()

export const generateStatutoryOutputCommandSchema = z
  .object({
    taxProfileId: uuid,
    documentType: z.string().trim().min(1).max(40),
    documentId: uuid,
    outputType: z.string().trim().min(1).max(40),
    templateVersion: z.string().trim().min(1).max(40),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()

export const statutoryOutputResultSchema = z
  .object({
    statutoryOutputId: uuid,
    tenantId: uuid,
    contentHash: z.string().length(64),
    created: z.boolean(),
  })
  .strict()

export const fiscalPeriodCloseCommandSchema = z
  .object({
    fiscalPeriodId: uuid,
    close: z.boolean(),
  })
  .strict()

export const fiscalPeriodCloseResultSchema = z
  .object({
    fiscalPeriodId: uuid,
    tenantId: uuid,
    status: z.enum(['blocked', 'ready', 'closed']),
    blockingCount: z.number().int().nonnegative(),
    checks: z.array(z.object({ key: z.string().min(1), passed: z.boolean(), detail: z.string().min(1) }).strict()),
  })
  .strict()

export const sapPostingRequestSchema = z
  .object({
    aggregateType: z.string().trim().min(1).max(40),
    aggregateId: uuid,
    postingType: z.enum(['goods_receipt', 'invoice_receipt', 'cost_posting']),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()

export const sapPostingResultSchema = z
  .object({
    sapPostingId: uuid,
    tenantId: uuid,
    status: z.enum(['pending', 'processing', 'succeeded', 'dead_letter']),
    created: z.boolean(),
  })
  .strict()

export const providerDeliveryRequestSchema = z
  .object({
    channel: z.enum(['email', 'sms']),
    provider: z.enum(['resend', 'semaphore']),
    eventType: z.string().trim().min(1).max(100),
    aggregateType: z.string().trim().min(1).max(64),
    aggregateId: uuid,
    recipient: z.string().trim().min(1).max(320),
    subject: z.string().trim().max(255).nullable().optional(),
    body: z.string().min(1).max(20_000),
    templateVersion: z.string().trim().min(1).max(40),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.channel === 'email' && value.provider !== 'resend') {
      context.addIssue({ code: 'custom', path: ['provider'], message: 'Email delivery must use Resend' })
    }
    if (value.channel === 'sms' && value.provider !== 'semaphore') {
      context.addIssue({ code: 'custom', path: ['provider'], message: 'SMS delivery must use Semaphore' })
    }
    if (value.channel === 'email' && !/^\S+@\S+\.\S+$/.test(value.recipient)) {
      context.addIssue({ code: 'custom', path: ['recipient'], message: 'Email recipient is invalid' })
    }
    if (value.channel === 'sms' && !/^\+?[1-9]\d{7,14}$/.test(value.recipient)) {
      context.addIssue({ code: 'custom', path: ['recipient'], message: 'SMS recipient must be E.164' })
    }
  })

export const providerDeliveryResultSchema = z
  .object({
    deliveryId: uuid,
    tenantId: uuid,
    status: z.enum(['pending', 'processing', 'delivered', 'dead_letter']),
    created: z.boolean(),
  })
  .strict()

export type CreateProcurementRequisitionCommand = z.infer<typeof createProcurementRequisitionCommandSchema>
export type ProcurementRequisitionWorkflowCommand = z.infer<typeof procurementRequisitionWorkflowCommandSchema>
export type ProcurementRequisitionResult = z.infer<typeof procurementRequisitionResultSchema>
export type ReserveInventoryCommand = z.infer<typeof reserveInventoryCommandSchema>
export type InventoryReservationWorkflowCommand = z.infer<typeof inventoryReservationWorkflowCommandSchema>
export type InventoryReservationResult = z.infer<typeof inventoryReservationResultSchema>
export type ApplyLandedCostCommand = z.infer<typeof applyLandedCostCommandSchema>
export type PriceResolutionQuery = z.infer<typeof priceResolutionQuerySchema>
export type PriceResolutionResult = z.infer<typeof priceResolutionResultSchema>
export type CreatePriceListCommand = z.infer<typeof createPriceListCommandSchema>
export type ActivatePriceListCommand = z.infer<typeof activatePriceListCommandSchema>
export type PriceListResult = z.infer<typeof priceListResultSchema>
export type TenantCurrencyCommand = z.infer<typeof tenantCurrencyCommandSchema>
export type TenantCurrencyResult = z.infer<typeof tenantCurrencyResultSchema>
export type ExchangeRate = z.infer<typeof exchangeRateSchema>
export type CreateExchangeRateCommand = z.infer<typeof createExchangeRateCommandSchema>
export type ExchangeRateResult = z.infer<typeof exchangeRateResultSchema>
export type TaxProfile = z.infer<typeof taxProfileSchema>
export type CalculateTaxResult = z.infer<typeof calculateTaxResultSchema>
export type CalculateTaxCommand = z.infer<typeof calculateTaxCommandSchema>
export type CalculateTaxByProfileCommand = z.infer<typeof calculateTaxByProfileCommandSchema>
export type CreateTaxProfileCommand = z.infer<typeof createTaxProfileCommandSchema>
export type TaxProfileResult = z.infer<typeof taxProfileResultSchema>
export type TaxProfileWorkflowCommand = z.infer<typeof taxProfileWorkflowCommandSchema>
export type GenerateStatutoryOutputCommand = z.infer<typeof generateStatutoryOutputCommandSchema>
export type StatutoryOutputResult = z.infer<typeof statutoryOutputResultSchema>
export type FiscalPeriodCloseCommand = z.infer<typeof fiscalPeriodCloseCommandSchema>
export type FiscalPeriodCloseResult = z.infer<typeof fiscalPeriodCloseResultSchema>
export type SapPostingRequest = z.infer<typeof sapPostingRequestSchema>
export type SapPostingResult = z.infer<typeof sapPostingResultSchema>
export type ProviderDeliveryRequest = z.infer<typeof providerDeliveryRequestSchema>
export type ProviderDeliveryResult = z.infer<typeof providerDeliveryResultSchema>
export type ProcurementTraceResult = z.infer<typeof procurementTraceResultSchema>

export type PriceCandidate = {
  priceListId: string
  priceListItemId: string
  vendorId: string | null
  unitPriceCents: bigint
  minimumQuantityMicros: bigint
  validFrom: string
  validTo: string | null
  status: 'draft' | 'active' | 'retired'
}

function ensurePositiveDenominator(value: bigint): void {
  if (value <= 0n) throw new Error('Denominator must be positive')
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  ensurePositiveDenominator(denominator)
  if (numerator < 0n) throw new Error('Numerator must be non-negative')
  return (numerator + denominator / 2n) / denominator
}

export function convertMinorUnits(
  amount: bigint,
  rateNumerator: bigint,
  rateDenominator: bigint,
): bigint {
  if (amount < 0n || rateNumerator <= 0n) throw new Error('Conversion inputs must be non-negative with a positive rate')
  return roundHalfUp(amount * rateNumerator, rateDenominator)
}

export function calculateTax(
  baseCents: bigint,
  profile: Pick<z.infer<typeof taxProfileSchema>, 'vatRateBps' | 'withholdingRateBps' | 'retentionRateBps' | 'vatRegistered'>,
): CalculateTaxResult {
  if (baseCents < 0n) throw new Error('Tax base must be non-negative')
  const vatCents = profile.vatRegistered
    ? roundHalfUp(baseCents * BigInt(profile.vatRateBps), 10_000n)
    : 0n
  const withholdingTaxCents = roundHalfUp(baseCents * BigInt(profile.withholdingRateBps), 10_000n)
  const retentionCents = roundHalfUp(baseCents * BigInt(profile.retentionRateBps), 10_000n)
  const netCents = baseCents + vatCents - withholdingTaxCents - retentionCents
  if (netCents < 0n) throw new Error('Tax configuration produces a negative net amount')
  return {
    baseCents: baseCents.toString(),
    vatCents: vatCents.toString(),
    withholdingTaxCents: withholdingTaxCents.toString(),
    retentionCents: retentionCents.toString(),
    netCents: netCents.toString(),
  }
}

export function allocateProRata(totalCents: bigint, bases: readonly bigint[]): bigint[] {
  if (totalCents < 0n || bases.length === 0 || bases.some((value) => value <= 0n)) {
    throw new Error('Allocation requires a non-negative total and positive bases')
  }
  const denominator = bases.reduce((sum, value) => sum + value, 0n)
  const allocated = bases.map((base) => (totalCents * base) / denominator)
  let remainder = totalCents - allocated.reduce((sum, value) => sum + value, 0n)
  const order = bases
    .map((base, index) => ({ index, remainder: (totalCents * base) % denominator }))
    .sort((left, right) => right.remainder > left.remainder ? 1 : right.remainder < left.remainder ? -1 : left.index - right.index)
  for (const candidate of order) {
    if (remainder === 0n) break
    allocated[candidate.index] = allocated[candidate.index]! + 1n
    remainder -= 1n
  }
  return allocated
}

export function availableInventory(
  onHandMicros: bigint,
  activeReservedMicros: bigint,
): bigint {
  const available = onHandMicros - activeReservedMicros
  if (onHandMicros < 0n || activeReservedMicros < 0n || available < 0n) {
    throw new Error('Inventory balance cannot be negative')
  }
  return available
}

export function resolvePriceCandidate(
  candidates: readonly PriceCandidate[],
  quantityMicros: bigint,
  asOf: string,
): PriceCandidate {
  if (quantityMicros <= 0n) throw new Error('Quantity must be positive')
  const valid = candidates.filter((candidate) =>
    candidate.status === 'active' &&
    candidate.validFrom <= asOf &&
    (candidate.validTo === null || candidate.validTo >= asOf) &&
    candidate.minimumQuantityMicros <= quantityMicros,
  )
  if (valid.length === 0) throw new Error('No active price list match')
  return [...valid].sort((left, right) =>
    left.minimumQuantityMicros > right.minimumQuantityMicros ? -1 :
      left.minimumQuantityMicros < right.minimumQuantityMicros ? 1 :
        left.unitPriceCents > right.unitPriceCents ? 1 :
          left.unitPriceCents < right.unitPriceCents ? -1 :
            left.priceListItemId.localeCompare(right.priceListItemId),
  )[0]!
}

export type CloseCheck = { key: string; passed: boolean; detail: string }

export function closeStatus(checks: readonly CloseCheck[]): 'blocked' | 'ready' {
  return checks.some((check) => !check.passed) ? 'blocked' : 'ready'
}

export function retryDelayMs(attempt: number, baseMs = 1_000, maxMs = 300_000): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('Attempt must be positive')
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1))
}
