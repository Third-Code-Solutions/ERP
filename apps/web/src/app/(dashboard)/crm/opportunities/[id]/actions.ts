'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ne } from 'drizzle-orm'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { opportunities, projects, users } from '@third-code-erp/database/schema'
import { roleHasCapability } from '@third-code-erp/shared-types'
import {
  stampActorInTransaction,
  writeAuditLogInTransaction,
  type DatabaseTransaction,
} from '@/lib/audit'
import { safeActionError } from '@/lib/safe-action-error'
import {
  isOpportunityClosed,
  parseOpportunityEditForm,
  planOpportunityUpdate,
  type OpportunityEditChanges,
} from './opportunity-update'

export type UpdateOpportunityResult = { error?: string; saved?: boolean }

type EditOutcome = { ok: true; saved: boolean } | { ok: false; error: string }

const GENERIC_ERROR =
  'The opportunity could not be saved. Refresh the page and try again.'

/**
 * Edit an open opportunity's commercials, sales owner and (once) its project.
 * The row is locked first, as the Core stage command does, so an edit and a
 * stage move cannot interleave; Won and Lost rows are refused.
 */
export async function updateOpportunity(
  formData: FormData
): Promise<UpdateOpportunityResult> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Your session has expired. Sign in again.' }
  if (!can(profile.role, 'opportunity.update')) {
    return { error: 'Only owners, admins and sales users can edit an opportunity.' }
  }

  const parsed = parseOpportunityEditForm(formData)
  if (!parsed.ok) return { error: parsed.error }
  const { opportunityId, input } = parsed

  let outcome: EditOutcome
  try {
    outcome = await db.transaction(async (tx): Promise<EditOutcome> => {
      await stampActorInTransaction(tx, profile.user.id)

      const [current] = await tx
        .select({
          stage: opportunities.stage,
          account_id: opportunities.account_id,
          project_id: opportunities.project_id,
          rep_id: opportunities.rep_id,
          tcv_cents: opportunities.tcv_cents,
          gp_cents: opportunities.gp_cents,
          probability: opportunities.probability,
          weighted_tcv_cents: opportunities.weighted_tcv_cents,
          closing_date: opportunities.closing_date,
          area_sqm: opportunities.area_sqm,
          opportunity_type: opportunities.opportunity_type,
          remarks: opportunities.remarks,
        })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenant_id, profile.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!current) return { ok: false, error: 'Opportunity not found.' }
      if (isOpportunityClosed(current.stage)) {
        return {
          ok: false,
          error: 'This opportunity is Won or Lost and can no longer be edited.',
        }
      }

      const plan = planOpportunityUpdate(current, input)
      if (!plan.ok) return plan
      if (Object.keys(plan.set).length === 0) return { ok: true, saved: false }

      const refused = await refuseInvalidReferences(tx, {
        tenantId: profile.tenantId,
        opportunityId,
        accountId: current.account_id,
        set: plan.set,
      })
      if (refused) return { ok: false, error: refused }

      const [updated] = await tx
        .update(opportunities)
        .set({ ...plan.set, updated_at: new Date() })
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenant_id, profile.tenantId)
          )
        )
        .returning({ id: opportunities.id })
      if (!updated) throw new Error('Opportunity changed before the edit was saved')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'opportunity',
        entityId: opportunityId,
        action: 'update',
        diff: plan.diff,
      })
      return { ok: true, saved: true }
    })
  } catch (error) {
    return { error: safeActionError(error, GENERIC_ERROR) }
  }
  if (!outcome.ok) return { error: outcome.error }

  revalidatePath(`/crm/opportunities/${opportunityId}`)
  revalidatePath('/pipeline')
  revalidatePath('/pipeline/list')
  revalidatePath('/')
  return { saved: outcome.saved }
}

/** Checks the rep and project references of a plan against this tenant, under lock. */
async function refuseInvalidReferences(
  tx: DatabaseTransaction,
  args: {
    tenantId: string
    opportunityId: string
    accountId: string | null
    set: OpportunityEditChanges
  }
): Promise<string | null> {
  const { tenantId, opportunityId, accountId, set } = args

  if (set.rep_id) {
    const [rep] = await tx
      .select({ role: users.role })
      .from(users)
      .where(
        and(
          eq(users.id, set.rep_id),
          eq(users.tenant_id, tenantId),
          eq(users.account_status, 'active')
        )
      )
      .limit(1)
    if (!rep || !roleHasCapability(rep.role, 'opportunity.advance_stage')) {
      return 'Choose an active owner, admin or sales user as the sales owner.'
    }
  }

  if (set.project_id) {
    // Lock the project so two opportunities cannot claim it at the same time.
    const [project] = await tx
      .select({ id: projects.id, account_id: projects.account_id, deleted_at: projects.deleted_at })
      .from(projects)
      .where(and(eq(projects.id, set.project_id), eq(projects.tenant_id, tenantId)))
      .limit(1)
      .for('update')
    if (!project || project.deleted_at !== null) return 'Project not found.'
    if (!accountId || project.account_id !== accountId) {
      return 'The project must belong to the same account as this opportunity.'
    }
    const [other] = await tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.project_id, set.project_id),
          eq(opportunities.tenant_id, tenantId),
          ne(opportunities.id, opportunityId)
        )
      )
      .limit(1)
    if (other) return 'That project is already linked to another opportunity.'
  }

  return null
}
