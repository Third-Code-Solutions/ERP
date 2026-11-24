import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, liveProjectCondition } from '@third-code-erp/database'
import { boms, projects, rfqs } from '@third-code-erp/database/schema'

const MAX_BOMS_WITHOUT_RFQ = 50

export interface BomWithoutRfq {
  id: string
  status: string
  label: string | null
  version: number
  project_name: string
}

/**
 * The latest approved or locked BOM of each live project (the version the
 * invoice draft bills), when no RFQ was made for it, newest first.
 */
export async function listApprovedBomsWithoutRfq(tenantId: string): Promise<BomWithoutRfq[]> {
  return db
    .select({
      id: boms.id,
      status: boms.status,
      label: boms.label,
      version: boms.version,
      project_name: projects.name,
    })
    .from(boms)
    .innerJoin(
      projects,
      and(eq(projects.id, boms.project_id), eq(projects.tenant_id, tenantId))
    )
    .where(
      and(
        eq(boms.tenant_id, tenantId),
        inArray(boms.status, ['approved', 'locked']),
        liveProjectCondition(boms.project_id, tenantId),
        // A superseded approved version is not offered for quoting.
        sql`not exists (
          select 1 from ${boms} as newer
          where newer.tenant_id = ${tenantId}
            and newer.project_id = ${boms.project_id}
            and newer.status in ('approved', 'locked')
            and newer.version > ${boms.version}
        )`,
        sql`not exists (
          select 1 from ${rfqs}
          where ${rfqs.bom_id} = ${boms.id}
            and ${rfqs.tenant_id} = ${tenantId}
        )`
      )
    )
    .orderBy(desc(boms.updated_at))
    .limit(MAX_BOMS_WITHOUT_RFQ)
}
