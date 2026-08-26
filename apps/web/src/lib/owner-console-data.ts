import { db } from '@third-code-erp/database'
import {
  auditLog,
  opportunities,
  platformAuditLog,
  platformDemoRequests,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import { and, desc, eq, isNull, notInArray, sql } from 'drizzle-orm'

function countByTenant(
  rows: ReadonlyArray<{ tenantId: string; total: number }>
): Map<string, number> {
  return new Map(rows.map((row) => [row.tenantId, row.total]))
}

/** Owner-only cross-tenant read model. Caller must authorize before use. */
export async function getOwnerConsoleData() {
  const [
    organizations,
    userCounts,
    activeProjectCounts,
    openOpportunityCounts,
    demoCounts,
    demoRequests,
    tenantActivity,
    platformActivity,
  ] = await Promise.all([
    db.select().from(tenants).orderBy(desc(tenants.created_at)),
    db
      .select({
        tenantId: users.tenant_id,
        total: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.tenant_id),
    db
      .select({
        tenantId: projects.tenant_id,
        total: sql<number>`count(*)::int`,
      })
      .from(projects)
      .where(and(isNull(projects.deleted_at), eq(projects.status, 'active')))
      .groupBy(projects.tenant_id),
    db
      .select({
        tenantId: opportunities.tenant_id,
        total: sql<number>`count(*)::int`,
      })
      .from(opportunities)
      .where(
        notInArray(opportunities.stage, [
          'won',
          'lost',
          'closed_won',
          'closed_lost',
        ])
      )
      .groupBy(opportunities.tenant_id),
    db
      .select({
        total: sql<number>`count(*)::int`,
        newTotal: sql<number>`count(*) filter (where ${platformDemoRequests.status} = 'new')::int`,
      })
      .from(platformDemoRequests),
    db
      .select()
      .from(platformDemoRequests)
      .orderBy(desc(platformDemoRequests.created_at))
      .limit(100),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entity_type,
        createdAt: auditLog.created_at,
        tenantName: tenants.name,
      })
      .from(auditLog)
      .innerJoin(tenants, eq(auditLog.tenant_id, tenants.id))
      .orderBy(desc(auditLog.created_at))
      .limit(12),
    db
      .select({
        id: platformAuditLog.id,
        action: platformAuditLog.action,
        entityType: platformAuditLog.entity_type,
        actorEmail: platformAuditLog.actor_email,
        createdAt: platformAuditLog.created_at,
      })
      .from(platformAuditLog)
      .orderBy(desc(platformAuditLog.created_at))
      .limit(12),
  ])

  const usersByTenant = countByTenant(userCounts)
  const activeProjectsByTenant = countByTenant(activeProjectCounts)
  const openOpportunitiesByTenant = countByTenant(openOpportunityCounts)
  const demoSummary = demoCounts[0] ?? { total: 0, newTotal: 0 }

  return {
    metrics: {
      activeProjects: activeProjectCounts.reduce((total, row) => total + row.total, 0),
      demoRequests: demoSummary.total,
      newDemoRequests: demoSummary.newTotal,
      openOpportunities: openOpportunityCounts.reduce(
        (total, row) => total + row.total,
        0
      ),
      organizations: organizations.length,
      users: userCounts.reduce((total, row) => total + row.total, 0),
    },
    organizations: organizations.map((organization) => ({
      ...organization,
      activeProjects: activeProjectsByTenant.get(organization.id) ?? 0,
      openOpportunities: openOpportunitiesByTenant.get(organization.id) ?? 0,
      users: usersByTenant.get(organization.id) ?? 0,
    })),
    demoRequests,
    platformActivity,
    tenantActivity,
  }
}
