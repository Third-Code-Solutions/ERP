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

/** Approved or locked BOMs of live projects that no RFQ was made for, newest first. */
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
