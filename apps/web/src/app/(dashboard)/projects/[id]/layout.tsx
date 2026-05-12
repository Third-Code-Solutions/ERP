import { ProjectTabs } from '@/components/projects/project-tabs'

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

  return (
    <div>
      <ProjectTabs projectId={id} />
      {children}
    </div>
  )
}
