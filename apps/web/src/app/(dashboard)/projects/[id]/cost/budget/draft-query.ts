import { sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import type { BudgetDraft } from './budget-workspace'

export type VersionedBudgetDraft = BudgetDraft & { version: string }

/** One statement prevents mixing a header's concurrency token with later lines. */
export async function loadBudgetDraft(
  tenantId: string,
  projectId: string,
  budgetId: string,
  canReadBom: boolean
): Promise<VersionedBudgetDraft | null> {
  const [draft] = await db.execute<VersionedBudgetDraft & Record<string, unknown>>(sql`
    select
      budget.id,
      budget.revision,
      budget.xmin::text || ':' || extract(epoch from budget.updated_at)::text as version,
      ${canReadBom ? sql`budget.source_bom_id` : sql`null::uuid`} as "sourceBomId",
      budget.control_mode as "controlMode",
      budget.commitment_tolerance_bps as "toleranceBps",
      budget.currency,
      budget.effective_from::text as "effectiveFrom",
      budget.revision_reason as reason,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', line.id,
          'costCodeId', line.cost_code_id,
          'bomLineItemId', ${canReadBom ? sql`line.bom_line_item_id` : sql`null::uuid`},
          'description', line.description,
          'amountCents', line.amount_cents
        ) order by line.line_number)
        from public.project_budget_lines line
        where line.project_budget_id = budget.id
          and line.tenant_id = budget.tenant_id
      ), '[]'::jsonb) as lines
    from public.project_budgets budget
    where budget.tenant_id = ${tenantId}::uuid
      and budget.project_id = ${projectId}::uuid
      and budget.id = ${budgetId}::uuid
      and budget.status = 'draft'
  `)
  return draft ?? null
}
