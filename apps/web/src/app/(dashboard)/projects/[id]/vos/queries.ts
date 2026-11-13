import 'server-only'

// Readers for the VO pages. They take the tenant from a caller that already
// resolved the session, so they must never live in a 'use server' module,
// where each export becomes a callable action (SEC-10).

import { and, asc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { variationOrders } from '@third-code-erp/database/schema'

export async function loadVo(voId: string, tenantId: string) {
  const [vo] = await db
    .select()
    .from(variationOrders)
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, tenantId)))
    .limit(1)
  return vo ?? null
}

/** Loader used by the list page. Returns cumulative totals. */
export async function listProjectVos(projectId: string, tenantId: string) {
  const rows = await db
    .select()
    .from(variationOrders)
    .where(
      and(
        eq(variationOrders.project_id, projectId),
        eq(variationOrders.tenant_id, tenantId),
      ),
    )
    .orderBy(asc(variationOrders.vo_number))

  const totals = rows.reduce(
    (acc, r) => ({
      cost_impact_cents: acc.cost_impact_cents + r.cost_impact_cents,
      time_impact_days: acc.time_impact_days + r.time_impact_days,
    }),
    { cost_impact_cents: 0, time_impact_days: 0 },
  )

  return { rows, totals }
}

export async function getVoById(voId: string, tenantId: string) {
  return loadVo(voId, tenantId)
}
