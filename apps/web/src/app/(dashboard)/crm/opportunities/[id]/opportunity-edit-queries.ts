import { db } from '@third-code-erp/database'
import { opportunities, projects, users } from '@third-code-erp/database/schema'
import { ERP_CAPABILITY_ROLES } from '@third-code-erp/shared-types'
import { and, asc, eq, inArray, isNull, notExists } from 'drizzle-orm'

const OPTION_LIMIT = 200

export interface OpportunityEditContext {
  remarks: string | null
  lostReason: string | null
  repId: string | null
  repName: string | null
  /** Active users who may own an opportunity; empty unless the viewer can edit. */
  reps: Array<{ id: string; name: string }>
  /** Live, unlinked projects of the same account; empty unless a link is still possible. */
  linkableProjects: Array<{ id: string; name: string }>
}

/**
 * Fields the shared detail reader does not return (remarks, lost reason, owner)
 * plus the pick-lists for the edit card. Every read is scoped to the tenant.
 */
export async function getOpportunityEditContext(input: {
  tenantId: string
  opportunityId: string
  accountId: string | null
  projectId: string | null
  canEdit: boolean
}): Promise<OpportunityEditContext> {
  const { tenantId, opportunityId } = input

  const [row] = await db
    .select({
      remarks: opportunities.remarks,
      lostReason: opportunities.lost_reason,
      repId: opportunities.rep_id,
      repName: users.full_name,
    })
    .from(opportunities)
    .leftJoin(
      users,
      and(eq(users.id, opportunities.rep_id), eq(users.tenant_id, tenantId))
    )
    .where(
      and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, tenantId))
    )
    .limit(1)

  const base: OpportunityEditContext = {
    remarks: row?.remarks ?? null,
    lostReason: row?.lostReason ?? null,
    repId: row?.repId ?? null,
    repName: row?.repName ?? null,
    reps: [],
    linkableProjects: [],
  }
  if (!input.canEdit) return base

  const [reps, linkableProjects] = await Promise.all([
    db
      .select({ id: users.id, name: users.full_name })
      .from(users)
      .where(
        and(
          eq(users.tenant_id, tenantId),
          eq(users.account_status, 'active'),
          inArray(users.role, [...ERP_CAPABILITY_ROLES['opportunity.advance_stage']])
        )
      )
      .orderBy(asc(users.full_name))
      .limit(OPTION_LIMIT),
    input.accountId && !input.projectId
      ? db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(
            and(
              eq(projects.tenant_id, tenantId),
              eq(projects.account_id, input.accountId),
              isNull(projects.deleted_at),
              notExists(
                db
                  .select({ id: opportunities.id })
                  .from(opportunities)
                  .where(
                    and(
                      eq(opportunities.tenant_id, tenantId),
                      eq(opportunities.project_id, projects.id)
                    )
                  )
              )
            )
          )
          .orderBy(asc(projects.name))
          .limit(OPTION_LIMIT)
      : Promise.resolve([]),
  ])

  return { ...base, reps, linkableProjects }
}
