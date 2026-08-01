import { z } from 'zod'

const MAX_SCOPE_ITEMS = 5_000

const WorkerScopeItemSchema = z.object({
  code: z.string().max(50).nullable(),
  description: z.string().trim().min(1).max(4_000),
  unit: z.string().trim().min(1).max(20),
  quantity: z.number().int().nonnegative().max(2_147_483_647),
  unit_cost_cents: z.number().int().nonnegative().max(9_000_000_000),
  notes: z.string().max(2_000).nullable(),
})

const WorkerParseResponseSchema = z.object({
  document_id: z.string().uuid(),
  scope_items: z.array(WorkerScopeItemSchema).max(MAX_SCOPE_ITEMS),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string().max(500)).max(100),
  parsed_format: z.enum(['dxf', 'dwg']),
  source_format: z.enum(['dxf', 'dwg']),
})

export type WorkerScopeItem = z.infer<typeof WorkerScopeItemSchema>
export type WorkerParseResponse = z.infer<typeof WorkerParseResponseSchema>

export function parseWorkerResponse(
  payload: unknown,
  expectedDocumentId: string
): WorkerParseResponse {
  const parsed = WorkerParseResponseSchema.parse(payload)
  if (parsed.document_id !== expectedDocumentId) {
    throw new Error('CAD parser returned a mismatched document')
  }
  if (parsed.count !== parsed.scope_items.length) {
    throw new Error('CAD parser count does not match returned scope items')
  }
  return parsed
}
