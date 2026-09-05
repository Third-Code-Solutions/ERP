import type { Metadata } from 'next'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, projects } from '@third-code-erp/database/schema'
import { and, eq, desc, isNull } from 'drizzle-orm'
import { BomIndex } from '@/components/bom/bom-index'

export const metadata: Metadata = { title: 'BOM Builder' }

export default async function BomBuilderPage() {
  const profile = await requireUserProfile()
  const rows = await db
    .select({
      id: boms.id,
      version: boms.version,
      label: boms.label,
      status: boms.status,
      total_cost_cents: boms.total_cost_cents,
      tcv_cents: boms.tcv_cents,
      gp_margin_bps: boms.gp_margin_bps,
      project_name: projects.name,
      project_id: projects.id,
    })
    .from(boms)
    .innerJoin(
      projects,
      and(
        eq(boms.project_id, projects.id),
        eq(projects.tenant_id, profile.tenantId),
      ),
    )
    .where(
      and(eq(boms.tenant_id, profile.tenantId), isNull(projects.deleted_at)),
    )
    .orderBy(desc(boms.created_at))
  return <BomIndex rows={rows} />
}
