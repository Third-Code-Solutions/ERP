import 'server-only'

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { masterSchedules, progressUpdates } from '@third-code-erp/database/schema'

// Server-component loader; not in actions.ts so it is not a client-callable
// server action that trusts a caller-supplied tenantId.
/** Loader used by the page to load the latest schedule + ordered updates. */
export async function loadProgressContext(projectId: string, tenantId: string) {
  const [schedule] = await db
    .select()
    .from(masterSchedules)
    .where(
      and(
        eq(masterSchedules.project_id, projectId),
        eq(masterSchedules.tenant_id, tenantId),
      ),
    )
    .orderBy(desc(masterSchedules.imported_at))
    .limit(1)

  const updates = await db
    .select()
    .from(progressUpdates)
    .where(
      and(
        eq(progressUpdates.project_id, projectId),
        eq(progressUpdates.tenant_id, tenantId),
      ),
    )
    .orderBy(asc(progressUpdates.week_ending))

  return { schedule: schedule ?? null, updates }
}
