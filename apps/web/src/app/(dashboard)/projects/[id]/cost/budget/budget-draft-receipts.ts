import { z } from 'zod'

const uuid = z.string().guid().transform(value => value.toLowerCase())
const version = z.string().regex(/^\d+:-?\d+(?:\.\d{1,6})?$/).max(80)
const line = z.object({ id: uuid, costCodeId: uuid, clientKey: uuid.optional() })
const receiptSchema = z.object({
  operation: z.enum(['create_cost_code', 'create_budget', 'save_draft']),
  projectId: uuid,
  sourceBudgetId: uuid.nullable(),
  requestId: uuid,
  resultId: uuid,
  expectedVersion: version.optional(),
  resultVersion: version.optional(),
  lines: z.array(line).optional(),
})

export type BudgetDraftCommandScope = {
  operation: z.infer<typeof receiptSchema>['operation']
  projectId: string
  sourceBudgetId: string | null
  requestId: string
  expectedVersion?: string
  lineBindings?: Array<{ clientKey: string; costCodeId: string; id?: string }>
}

export type ConfirmedBudgetDraftReceipt = z.infer<typeof receiptSchema>

export function validateBudgetDraftReceipt(
  result: unknown,
  command: BudgetDraftCommandScope
): ConfirmedBudgetDraftReceipt | null {
  const parsed = z.object({
    ok: z.literal(true), id: uuid, receipt: receiptSchema,
    lines: z.array(line).optional(), refreshWarning: z.string().optional(),
  }).safeParse(result)
  if (!parsed.success) return null
  const { receipt, id, lines } = parsed.data
  if (
    receipt.operation !== command.operation ||
    receipt.projectId !== command.projectId.toLowerCase() ||
    receipt.sourceBudgetId !== (command.sourceBudgetId?.toLowerCase() ?? null) ||
    receipt.requestId !== command.requestId.toLowerCase() ||
    receipt.resultId !== id ||
    receipt.expectedVersion !== command.expectedVersion
  ) return null

  if (receipt.operation === 'save_draft') {
    if (
      receipt.resultId !== receipt.sourceBudgetId || !receipt.expectedVersion ||
      !receipt.resultVersion || !receipt.lines || !lines ||
      JSON.stringify(receipt.lines) !== JSON.stringify(lines)
    ) return null
    if (new Set(lines.map(item => item.id)).size !== lines.length ||
      new Set(lines.map(item => item.costCodeId)).size !== lines.length) return null
    const keys = lines.flatMap(item => item.clientKey ? [item.clientKey] : [])
    if (new Set(keys).size !== keys.length) return null
    if (!command.lineBindings || command.lineBindings.length !== lines.length) return null
    if (command.lineBindings.some(binding => !lines.some(saved =>
      saved.clientKey === binding.clientKey.toLowerCase() &&
      saved.costCodeId === binding.costCodeId.toLowerCase() &&
      (!binding.id || saved.id === binding.id.toLowerCase())
    ))) return null
  } else if (receipt.sourceBudgetId !== null || receipt.lines !== undefined || lines !== undefined) {
    return null
  } else if (receipt.operation === 'create_budget' && !receipt.resultVersion) {
    return null
  } else if (receipt.operation === 'create_cost_code' && receipt.resultVersion !== undefined) {
    return null
  }
  return receipt
}
