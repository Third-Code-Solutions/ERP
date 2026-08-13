import { z } from 'zod'

/**
 * Canonical Cortex sources that may be used as a graph focus. The map is an
 * API/security contract: a derived node must identify both the registered
 * source table and the node type that owns that source.
 */
export const CORTEX_GRAPH_REF_TABLE_NODE_TYPES = {
  users: 'employee',
  projects: 'project',
  opportunities: 'opportunity',
  accounts: 'account',
  scope_items: 'scope_item',
  boms: 'bom',
  bom_line_items: 'bom_line',
  vendors: 'vendor',
  purchase_orders: 'purchase_order',
  po_line_items: 'po_line',
  invoices: 'invoice',
  cost_entries: 'cost_line',
  daily_tasks: 'task',
  pre_con_checklist_items: 'task',
  master_schedules: 'schedule_event',
  documents: 'document',
  variation_orders: 'change_order',
  contacts: 'contact',
  permits: 'permit',
  progress_claims: 'claim',
  warranty_tickets: 'ticket',
  delivery_schedules: 'delivery',
  rfqs: 'rfq',
  contracts: 'contract',
  certificates_of_completion: 'certificate',
  punchlist_items: 'punchlist',
  site_inspections: 'inspection',
  design_files: 'design',
  change_requests: 'change_request',
  material_items: 'material',
  weekly_reports: 'weekly_report',
  fiscal_periods: 'fiscal_period',
  ledger_accounts: 'ledger_account',
  journal_entries: 'journal_entry',
  journal_lines: 'journal_line',
  supplier_bills: 'supplier_bill',
  cash_accounts: 'cash_account',
  cash_transactions: 'cash_transaction',
  bank_statements: 'bank_statement',
  warehouses: 'warehouse',
  stock_receipts: 'stock_receipt',
  stock_ledger_entries: 'stock_ledger_entry',
  cost_codes: 'cost_code',
  project_budgets: 'project_budget',
  stock_movements: 'stock_movement',
} as const

export type CortexGraphRefTable =
  keyof typeof CORTEX_GRAPH_REF_TABLE_NODE_TYPES

export function isCortexGraphRefTable(
  value: string
): value is CortexGraphRefTable {
  return Object.hasOwn(CORTEX_GRAPH_REF_TABLE_NODE_TYPES, value)
}

export function cortexGraphRefTableMatchesType(
  refTable: CortexGraphRefTable,
  nodeType: string
): boolean {
  return CORTEX_GRAPH_REF_TABLE_NODE_TYPES[refTable] === nodeType
}

export const cortexGraphRefTableSchema = z
  .string()
  .refine(isCortexGraphRefTable, 'Unsupported Cortex reference table')
  .transform((value) => value as CortexGraphRefTable)

/** Tenant and role are always derived from the authenticated principal. */
export const cortexGraphQuerySchema = z
  .object({
    refTable: cortexGraphRefTableSchema.optional(),
    refId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    ({ refTable, refId }) =>
      (refTable === undefined && refId === undefined) ||
      (refTable !== undefined && refId !== undefined),
    'refTable and refId must be supplied together'
  )

export type CortexGraphQuery = z.infer<typeof cortexGraphQuerySchema>

export const cortexGraphNodeSchema = z
  .object({
    id: z.string().uuid(),
    type: z.string().trim().min(1).max(64),
    title: z.string().max(500).nullable(),
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (!cortexGraphRefTableMatchesType(node.refTable, node.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['refTable'],
        message: 'Cortex source table does not match node type',
      })
    }
  })

export const cortexGraphLinkSchema = z
  .object({
    source: z.string().uuid(),
    target: z.string().uuid(),
    type: z.string().trim().min(1).max(128),
  })
  .strict()

export const cortexGraphResultSchema = z
  .object({
    nodes: z.array(cortexGraphNodeSchema).max(1500),
    links: z.array(cortexGraphLinkSchema).max(12_000),
  })
  .strict()

export const cortexFocusedGraphResultSchema = cortexGraphResultSchema.extend({
  focusNodeId: z.string().uuid(),
})

export const cortexGraphResponseSchema = z.union([
  cortexFocusedGraphResultSchema,
  cortexGraphResultSchema,
])

export type CortexGraphResult = z.infer<typeof cortexGraphResultSchema>
export type CortexFocusedGraphResult = z.infer<
  typeof cortexFocusedGraphResultSchema
>
export type CortexGraphResponse = z.infer<typeof cortexGraphResponseSchema>

type CortexGraphRows = {
  nodes?: unknown
  links?: unknown
}

/**
 * Sanitize database-derived graph rows without letting one malformed mirror
 * row take down the whole graph response. Links survive only when both
 * endpoints survived node validation.
 */
export function cortexGraphResultFromRows(
  input: CortexGraphRows | null | undefined
): CortexGraphResult {
  const nodes = Array.isArray(input?.nodes)
    ? input.nodes.flatMap((row) => {
        const parsed = cortexGraphNodeSchema.safeParse(row)
        return parsed.success ? [parsed.data] : []
      })
    : []
  const nodeIds = new Set(nodes.map((node) => node.id))
  const links = Array.isArray(input?.links)
    ? input.links.flatMap((row) => {
        const parsed = cortexGraphLinkSchema.safeParse(row)
        if (
          !parsed.success ||
          !nodeIds.has(parsed.data.source) ||
          !nodeIds.has(parsed.data.target)
        ) {
          return []
        }
        return [parsed.data]
      })
    : []

  return cortexGraphResultSchema.parse({
    nodes: nodes.slice(0, 1500),
    links: links.slice(0, 12_000),
  })
}

/** Return null when a focused graph has no valid focus node after sanitizing. */
export function cortexFocusedGraphResultFromRows(
  input: (CortexGraphRows & { focusNodeId?: unknown }) | null | undefined
): CortexFocusedGraphResult | null {
  const focusNode = z.string().uuid().safeParse(input?.focusNodeId)
  if (!focusNode.success) return null

  const graph = cortexGraphResultFromRows(input)
  if (!graph.nodes.some((node) => node.id === focusNode.data)) return null

  return cortexFocusedGraphResultSchema.parse({
    ...graph,
    focusNodeId: focusNode.data,
  })
}
