/**
 * REFACTOR.md M4 US-Pre-001 — Pre-Construction checklist template.
 *
 * Source of truth for the 12 default checklist items that are auto-
 * generated on every won-to-project conversion. The values are
 * intentionally hardcoded here (not in a DB seed) so that:
 *
 *  1. The template ships with the code — new tenants get it free.
 *  2. Per-tenant customization later just means inserting a row in
 *     `pre_con_checklist_templates` and pointing `preConChecklists.template_id`
 *     at it. The seed function will read that row first and fall back to
 *     DEFAULT_TEMPLATE.
 *
 * `depends_on_index` is 1-based for human readability (matches REFACTOR.md
 * numbering) and resolved to real `depends_on_item_id` after insert. Items
 * with no dependency start their SLA clock immediately.
 */

import { db } from '@third-code-erp/database'
import {
  preConChecklists,
  preConChecklistItems,
  preConChecklistTemplates,
  projects,
} from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'

export interface ChecklistTemplateItem {
  title: string
  owner_role: string
  sla_days: number
  /** 1-based index of the prerequisite item in this same list. */
  depends_on_index?: number
  requires_attachment?: boolean
}

/**
 * The canonical 12-item Pre-Construction template. Order = sort_order.
 * Mirrors REFACTOR.md US-Pre-001.
 */
export const DEFAULT_TEMPLATE: ChecklistTemplateItem[] = [
  { title: 'NTP issuance', owner_role: 'sd_pm_pe', sla_days: 2 },
  { title: 'Site mobilization checklist', owner_role: 'sd_pm_pe', sla_days: 5, depends_on_index: 1 },
  { title: 'Building Admin Vetting', owner_role: 'commercial', sla_days: 5 },
  { title: 'LGU Building Permit submission', owner_role: 'commercial', sla_days: 7, depends_on_index: 3 },
  { title: 'DOLE permit (if applicable)', owner_role: 'safety', sla_days: 3 },
  { title: 'Subcon shortlist', owner_role: 'procurement', sla_days: 5 },
  { title: 'PO issuance batch 1', owner_role: 'procurement', sla_days: 3, depends_on_index: 6 },
  { title: 'Insurance binders', owner_role: 'finance', sla_days: 2 },
  { title: 'Safety plan + toolbox briefing', owner_role: 'safety', sla_days: 2 },
  { title: 'Pre-Con kickoff meeting', owner_role: 'sd_pm_pe', sla_days: 1, depends_on_index: 1 },
  { title: 'Site office setup', owner_role: 'sd_pm_pe', sla_days: 3, depends_on_index: 2 },
  { title: 'Owner handover packet', owner_role: 'cx', sla_days: 1, depends_on_index: 10 },
]

/**
 * Create a pre_con_checklists row for `projectId` and bulk-insert the 12
 * default items. Item #1 starts its SLA clock immediately; downstream items
 * stay paused until their dependency is marked done (handled in
 * updateChecklistItemStatus).
 *
 * Returns the newly created checklist id. Throws if the project does not
 * exist (caller is expected to enforce tenant ownership upstream).
 */
export async function seedDefaultChecklist(projectId: string): Promise<string> {
  const [project] = await db
    .select({ tenant_id: projects.tenant_id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project) throw new Error(`Project ${projectId} not found`)

  // Use an active tenant-specific template when present; otherwise fall back
  // to the hardcoded DEFAULT_TEMPLATE. We don't enforce uniqueness here —
  // the most-recently-created active row wins.
  const [tenantTemplate] = await db
    .select({ id: preConChecklistTemplates.id, items: preConChecklistTemplates.items })
    .from(preConChecklistTemplates)
    .where(
      and(
        eq(preConChecklistTemplates.tenant_id, project.tenant_id),
        eq(preConChecklistTemplates.is_active, true)
      )
    )
    .limit(1)

  const items: ChecklistTemplateItem[] = tenantTemplate
    ? safeParseTemplate(tenantTemplate.items) ?? DEFAULT_TEMPLATE
    : DEFAULT_TEMPLATE

  // Create the checklist shell first so item rows can reference it.
  const [checklist] = await db
    .insert(preConChecklists)
    .values({
      tenant_id: project.tenant_id,
      project_id: projectId,
      template_id: tenantTemplate?.id,
    })
    .returning({ id: preConChecklists.id })

  if (!checklist) throw new Error('Failed to create pre-con checklist row')

  // First pass: insert all items without depends_on_item_id (we don't have
  // the ids yet). Capture sort_order → id mapping.
  const now = new Date()
  const inserted = await db
    .insert(preConChecklistItems)
    .values(
      items.map((it, idx) => ({
        tenant_id: project.tenant_id,
        checklist_id: checklist.id,
        title: it.title,
        owner_role: it.owner_role,
        sla_days: it.sla_days,
        sort_order: idx,
        // Items with no dependency get an immediate start; dependents stay
        // null until their predecessor completes.
        sla_clock_started_at: it.depends_on_index ? null : now,
      }))
    )
    .returning({ id: preConChecklistItems.id, sort_order: preConChecklistItems.sort_order })

  const byOrder = new Map<number, string>()
  for (const row of inserted) byOrder.set(row.sort_order, row.id)

  // Second pass: wire depends_on_item_id. Done as individual updates so we
  // don't need a CASE expression — 12 rows is negligible.
  for (let i = 0; i < items.length; i++) {
    const def = items[i]
    if (!def?.depends_on_index) continue
    const myId = byOrder.get(i)
    const parentId = byOrder.get(def.depends_on_index - 1)
    if (!myId || !parentId) continue
    await db
      .update(preConChecklistItems)
      .set({ depends_on_item_id: parentId })
      .where(eq(preConChecklistItems.id, myId))
  }

  return checklist.id
}

/**
 * Parse a JSON-encoded template payload. Returns null on any malformed
 * input — callers fall back to DEFAULT_TEMPLATE rather than crash mid-
 * conversion.
 */
function safeParseTemplate(raw: string): ChecklistTemplateItem[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    // Trust the shape on a happy path — the admin UI that writes this row
    // is the only writer and it validates with Zod.
    return parsed as ChecklistTemplateItem[]
  } catch {
    return null
  }
}
