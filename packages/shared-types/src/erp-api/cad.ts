import { z } from 'zod'
import { manualLineTotal } from '../bom/calculations'
import {
  boqQuantityFromNumber,
  MAX_BOM_LINE_ITEM_QUANTITY,
} from '../bom/quantity'

export const CAD_SCOPE_BATCH_SIZE = 200
export const CAD_MAX_SCOPE_ITEMS = 5_000

// D-5: numeric(18,4). Producers round measured values half-up to 4 dp; a
// finer value is rejected here, never rounded again.
export const cadQuantitySchema = z
  .number()
  .nonnegative()
  .refine((quantity) => boqQuantityFromNumber(quantity) !== null, {
    message: `quantity must have at most 4 decimal places and not exceed ${MAX_BOM_LINE_ITEM_QUANTITY}`,
  })

export const cadWorkerScopeItemSchema = z
  .object({
    code: z.string().max(50).nullable(),
    description: z.string().trim().min(1).max(4_000),
    unit: z.string().trim().min(1).max(20),
    quantity: cadQuantitySchema,
    unit_cost_cents: z.number().int().nonnegative().max(9_000_000_000),
    notes: z.string().max(2_000).nullable(),
  })
  .strict()

export const cadWorkerResponseSchema = z
  .object({
    document_id: z.string().uuid(),
    scope_items: z
      .array(cadWorkerScopeItemSchema)
      .max(CAD_MAX_SCOPE_ITEMS),
    count: z.number().int().nonnegative(),
    warnings: z.array(z.string().max(500)).max(100),
    parsed_format: z.enum(['dxf', 'dwg']),
    source_format: z.enum(['dxf', 'dwg']),
  })
  .strict()

export const cadEvidenceCommitCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    workerResponse: cadWorkerResponseSchema,
  })
  .strict()

export const cadEvidenceCommitResultSchema = z
  .object({
    documentId: z.string().uuid(),
    projectId: z.string().uuid(),
    tenantId: z.string().uuid(),
    scopeItemsCreated: z.number().int().nonnegative().max(CAD_MAX_SCOPE_ITEMS),
    sourceFormat: z.enum(['dxf', 'dwg']),
    status: z.literal('committed'),
  })
  .strict()

export type CadWorkerScopeItem = z.infer<typeof cadWorkerScopeItemSchema>
export type CadWorkerResponse = z.infer<typeof cadWorkerResponseSchema>
export type CadEvidenceCommitCommand = z.infer<
  typeof cadEvidenceCommitCommandSchema
>
export type CadEvidenceCommitResult = z.infer<
  typeof cadEvidenceCommitResultSchema
>

export function parseCadWorkerResponse(
  payload: unknown,
  expectedDocumentId: string
): CadWorkerResponse {
  const parsed = cadWorkerResponseSchema.parse(payload)
  if (parsed.document_id !== expectedDocumentId) {
    throw new Error('CAD parser returned a mismatched document')
  }
  if (parsed.count !== parsed.scope_items.length) {
    throw new Error('CAD parser count does not match returned scope items')
  }
  return parsed
}

/** Exact decimal string for `scope_items.quantity_decimal`. */
export function cadScopeQuantity(item: CadWorkerScopeItem): string {
  const quantity = boqQuantityFromNumber(item.quantity)
  if (quantity === null) {
    throw new Error('CAD parser returned a quantity outside supported precision')
  }
  return quantity
}

export function cadScopeLineTotalCents(
  item: CadWorkerScopeItem
): number {
  const quantity = cadScopeQuantity(item)
  try {
    return manualLineTotal(item.unit_cost_cents, quantity)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    throw new Error(
      'CAD parser returned a scope line value outside supported range'
    )
  }
}
