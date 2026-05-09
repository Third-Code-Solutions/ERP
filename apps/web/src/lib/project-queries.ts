import { db } from '@buildops/database'
import { projects } from '@buildops/database/schema'
import { eq, desc } from 'drizzle-orm'
import type { Project } from '@buildops/database/schema'

export type { Project }

export async function getProjects(tenantId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.tenant_id, tenantId))
    .orderBy(desc(projects.created_at))
}

export async function getProject(tenantId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.tenant_id, tenantId))
    .limit(1)

  if (!row || row.id !== projectId) return null
  return row
}
