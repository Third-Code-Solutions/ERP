import { redirect } from 'next/navigation'
import type { AppRole } from '@third-code-erp/auth'
import { canViewPath } from '@/lib/operations/nav-config'

/**
 * Page-level copy of the dashboard layout role gate. A client-side navigation
 * re-renders only the changed segment, so the layout check alone is not enough.
 */
export function requireRouteAccess(role: AppRole, pathname: string): void {
  if (!canViewPath(role, pathname)) redirect('/dashboard?error=forbidden')
}
