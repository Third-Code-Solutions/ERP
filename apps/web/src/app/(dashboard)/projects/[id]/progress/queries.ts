import 'server-only'

// Reader for the progress page. It takes the tenant from a caller that
// already resolved the session, so it must never live in a 'use server'
// module, where each export becomes a callable action (SEC-10).

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { masterSchedules, progressUpdates } from '@third-code-erp/database/schema'

/** Helper used by the page to load the latest schedule + ordered updates. */
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
