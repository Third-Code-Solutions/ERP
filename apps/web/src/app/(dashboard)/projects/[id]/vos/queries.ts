import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { variationOrders } from '@third-code-erp/database/schema'

// Read loaders for server components. Kept out of actions.ts because every
// export of a 'use server' module is a client-callable endpoint, and these
// trust the tenantId their (server-side) caller resolved from the session.

/** Variation orders for one project plus the signed (contractually agreed) totals. */
export async function listProjectVos(projectId: string, tenantId: string) {
  const rows = await db
    .select()
    .from(variationOrders)
    .where(and(eq(variationOrders.project_id, projectId), eq(variationOrders.tenant_id, tenantId)))
    .orderBy(asc(variationOrders.vo_number))

  const totals = rows
    .filter((r) => r.status === 'signed')
    .reduce(
      (acc, r) => ({
        cost_impact_cents: acc.cost_impact_cents + r.cost_impact_cents,
        time_impact_days: acc.time_impact_days + r.time_impact_days,
      }),
      { cost_impact_cents: 0, time_impact_days: 0 },
    )

  return { rows, totals }
}

export async function getVoById(voId: string, tenantId: string) {
  const [vo] = await db
    .select()
    .from(variationOrders)
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, tenantId)))
    .limit(1)
  return vo ?? null
}
