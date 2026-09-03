import { notFound } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects } from '@third-code-erp/database/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { ProjectTabs } from '@/components/projects/project-tabs'
import { getProjectDetailAccess } from './project-detail-access'

/**
 * Layout wrapper for every /projects/[id]/* sub-route. Renders the
 * horizontal ProjectTabs strip above the page content so navigation
 * between project sections is available on every tab.
 *
 * Note: the per-page header (project name, status, etc.) lives in each
 * sub-route page, not in this layout — only the tab strip is shared.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireUserProfile()
  requireCapability(profile, 'project.read')
  const access = getProjectDetailAccess(profile.role)
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.tenant_id, profile.tenantId),
        isNull(projects.deleted_at),
      ),
    )
    .limit(1)
  if (!project) notFound()

  return (
    <div>
      <ProjectTabs projectId={id} access={access} />
      {children}
    </div>
  )
}
