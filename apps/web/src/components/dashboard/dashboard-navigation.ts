import type { AppRole } from '@third-code-erp/auth'
import { canViewPath } from '@/lib/operations/nav-config'

export function dashboardHrefForRole(
  role: AppRole,
  href: string
): string | null {
  const pathname = href.split(/[?#]/, 1)[0] ?? href
  if (canViewPath(role, pathname)) return href

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/)
  if (!projectMatch) return null

  const projectOverview = `/projects/${projectMatch[1]}`
  return canViewPath(role, projectOverview) ? projectOverview : null
}
