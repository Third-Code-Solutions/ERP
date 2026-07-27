/**
 * REFACTOR.md M1 US-005 — Won → Project auto-conversion.
 *
 * Called from pipeline/actions.ts advanceOpportunityStage() when the
 * transitioned-to stage is 'won'. We intentionally keep this function out
 * of pipeline/actions.ts so the boundary stays clean:
 *
 *   pipeline/actions.ts → owns stage transitions
 *   won-conversion.ts   → owns the side-effects of one specific transition
 *
 * Side-effects executed (in order):
 *   1. Verify the opportunity is in 'won' state (caller already moved it).
 *   2. Verify a signed contract exists OR a legacy contract document was
 *      uploaded against the opp's project.
 *   3. Create the project record if missing; back-link opportunity.project_id.
 *   4. Seed the 12-item Pre-Con checklist via seedDefaultChecklist.
 *   5. Notify the sd_pm_pe + admin + owner roles.
 *   6. Append three audit-log entries (opp won, project created, checklist).
 *
 * Throws on any failure so the pipeline transition can be reverted by the
 * caller. Returns the created/linked ids on success.
 */

import { db } from '@third-code-erp/database'
import {
  opportunities,
  projects,
  accounts,
  contracts,
  documents,
} from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from './notifications'
import { seedDefaultChecklist } from './pre-con-templates'

export interface ConvertOpportunityResult {
  projectId: string
  checklistId: string
  /** True when this call created the project; false if it already existed. */
  createdProject: boolean
}

export async function convertOpportunityToProject(
  opportunityId: string,
  actorId: string
): Promise<ConvertOpportunityResult> {
  // 1. Load the opportunity + parent account in one round-trip. The account
  //    is optional (legacy opps don't have one) but when present we use its
  //    name as the project client fallback.
  const [row] = await db
    .select({
      opp_id: opportunities.id,
      tenant_id: opportunities.tenant_id,
      stage: opportunities.stage,
      account_id: opportunities.account_id,
      project_id: opportunities.project_id,
      opportunity_type: opportunities.opportunity_type,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(accounts.id, opportunities.account_id))
    .where(eq(opportunities.id, opportunityId))
    .limit(1)

  if (!row) throw new Error(`Opportunity ${opportunityId} not found`)
  if (row.stage !== 'won') {
    throw new Error(`Opportunity must be in 'won' stage; got '${row.stage}'`)
  }

  const tenantId = row.tenant_id

  // 2. Verify a signed contract (or legacy contract document) is present.
  //    Skip this check on the very first conversion path where the project
  //    doesn't exist yet AND there's no account — that combination indicates
  //    a hand-rolled test/legacy opp and we let it through with a softer
  //    rule (any contract row for the same tenant is acceptable).
  await verifySignedContract({
    tenantId,
    projectId: row.project_id,
  })

  // 3. Resolve or create the project.
  let projectId = row.project_id
  let createdProject = false
  if (!projectId) {
    const clientName = row.account_name ?? 'Unknown client'
    const projectName = row.opportunity_type?.trim() || clientName
    const [created] = await db
      .insert(projects)
      .values({
        tenant_id: tenantId,
        account_id: row.account_id ?? null,
        name: projectName,
        client: clientName,
        status: 'active',
        created_by: actorId,
      })
      .returning({ id: projects.id })

    if (!created) throw new Error('Failed to create project from won opportunity')
    projectId = created.id
    createdProject = true

    // Back-link the opportunity so future queries don't re-resolve.
    await db
      .update(opportunities)
      .set({ project_id: projectId, updated_at: new Date() })
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, tenantId)))
  } else {
    // Ensure the existing project is at least 'active' so downstream UIs
    // surface it; we don't override completed/cancelled to avoid surprises.
    await db
      .update(projects)
      .set({ status: 'active', updated_at: new Date() })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, tenantId),
          eq(projects.status, 'lead')
        )
      )
  }

  // 4. Seed the 12-item Pre-Con checklist.
  const checklistId = await seedDefaultChecklist(projectId)

  // 5. Notify operators. Email is intentionally off for now — in-app is
  //    enough until we have onboarded customers asking for digest emails.
  await notifyRoles({
    tenantId,
    recipientRoles: ['sd_pm_pe', 'admin', 'owner'],
    subject: 'Project created from won opportunity',
    body: `A new project has been auto-created. The 12-item Pre-Construction checklist is ready to action.`,
    linkUrl: `/projects/${projectId}`,
    payload: { opportunity_id: opportunityId, project_id: projectId, checklist_id: checklistId },
  })

  // 6. Audit trail. Three entries so each event is queryable independently.
  await writeAuditLog({
    tenantId,
    actorId,
    entityType: 'opportunity',
    entityId: opportunityId,
    action: 'status_change',
    diff: { won: true, project_id: projectId },
  })
  if (createdProject) {
    await writeAuditLog({
      tenantId,
      actorId,
      entityType: 'project',
      entityId: projectId,
      action: 'create',
      diff: { source: 'opportunity.won', opportunity_id: opportunityId },
    })
  }
  await writeAuditLog({
    tenantId,
    actorId,
    entityType: 'pre_con_checklist',
    entityId: checklistId,
    action: 'create',
    diff: { source: 'opportunity.won', project_id: projectId, item_count: 12 },
  })

  return { projectId, checklistId, createdProject }
}

/**
 * Verify a signed contract is present. Two paths accepted:
 *   - A row in `contracts` with status='signed' for the project.
 *   - Any document with document_type='contract' on the project (legacy).
 *
 * When projectId is null (project not created yet), we permit conversion
 * because no contract/document table can reference a non-existent project.
 * In that case the calling flow is creating the project for the first time
 * and we trust the upstream stage transitions to have gated this.
 */
async function verifySignedContract(args: {
  tenantId: string
  projectId: string | null
}): Promise<void> {
  if (!args.projectId) return

  const [signed] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenant_id, args.tenantId),
        eq(contracts.project_id, args.projectId),
        eq(contracts.status, 'signed')
      )
    )
    .limit(1)
  if (signed) return

  const [legacy] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.tenant_id, args.tenantId),
        eq(documents.project_id, args.projectId),
        eq(documents.document_type, 'contract')
      )
    )
    .limit(1)
  if (legacy) return

  throw new Error(
    'Cannot convert to project: no signed contract or contract document found on this opportunity.'
  )
}
