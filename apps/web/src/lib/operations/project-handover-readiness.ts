import 'server-only'

import { db } from '@third-code-erp/database'
import {
  certificatesOfCompletion,
  permits,
  projects,
  punchlistItems,
  turnoverPackages,
} from '@third-code-erp/database/schema'
import {
  buildProjectHandoverReadinessResult,
  projectHandoverReadinessQuerySchema,
  type ProjectHandoverReadinessQuery,
  type ProjectHandoverReadinessResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

type CountRow = { total: number | string | null; open: number | string | null }

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

export async function readProjectHandoverReadinessForTenant(
  tenantId: string,
  projectId: string,
  query: ProjectHandoverReadinessQuery,
  now = new Date(),
): Promise<ProjectHandoverReadinessResult> {
  projectHandoverReadinessQuerySchema.parse(query)
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at)))
    .limit(1)
  if (!project) throw new Error('Project not found')

  const [turnoverRows, cocRows, punchlistRows, permitRows] = await Promise.all([
    db
      .select({
        asBuiltDocumentId: turnoverPackages.as_built_document_id,
        omManualDocumentId: turnoverPackages.om_manual_document_id,
        warrantyCertDocumentId: turnoverPackages.warranty_cert_document_id,
        keysLogDocumentId: turnoverPackages.keys_log_document_id,
        compiledAt: turnoverPackages.compiled_at,
      })
      .from(turnoverPackages)
      .where(and(eq(turnoverPackages.tenant_id, tenantId), eq(turnoverPackages.project_id, projectId)))
      .orderBy(desc(turnoverPackages.created_at))
      .limit(1),
    db
      .select({ status: certificatesOfCompletion.status })
      .from(certificatesOfCompletion)
      .where(and(eq(certificatesOfCompletion.tenant_id, tenantId), eq(certificatesOfCompletion.project_id, projectId)))
      .orderBy(desc(certificatesOfCompletion.created_at))
      .limit(1),
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${punchlistItems.status} <> 'closed')::int`,
      })
      .from(punchlistItems)
      .where(and(eq(punchlistItems.tenant_id, tenantId), eq(punchlistItems.project_id, projectId))),
    db
      .select({ status: permits.status })
      .from(permits)
      .where(and(eq(permits.tenant_id, tenantId), eq(permits.project_id, projectId), eq(permits.permit_type, 'occupancy_permit')))
      .orderBy(desc(permits.updated_at))
      .limit(1),
  ])

  const turnover = turnoverRows[0]
  const punchlist = punchlistRows[0] as CountRow | undefined
  return buildProjectHandoverReadinessResult(projectId, now.toISOString(), {
    turnoverPackageExists: turnover !== undefined,
    turnoverCompiled: turnover?.compiledAt !== null && turnover?.compiledAt !== undefined,
    attachedSlotCount: turnover
      ? [turnover.asBuiltDocumentId, turnover.omManualDocumentId, turnover.warrantyCertDocumentId, turnover.keysLogDocumentId].filter((value) => value !== null).length
      : 0,
    requiredSlotCount: 4,
    cocStatus: cocRows[0]?.status ?? null,
    totalPunchlistCount: numberValue(punchlist?.total),
    openPunchlistCount: numberValue(punchlist?.open),
    occupancyPermitStatus: permitRows[0]?.status ?? null,
  })
}
