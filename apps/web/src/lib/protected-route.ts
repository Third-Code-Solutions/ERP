/**
 * Browser-rendered ERP surfaces that require a Supabase session before the
 * route tree is rendered. API handlers keep their own authorization checks.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/projects',
  '/pipeline',
  '/bom',
  '/assets',
  '/invoices',
  '/purchase-orders',
  '/documents',
  '/reports',
  '/settings',
  '/procurement',
  '/cortex',
  '/finance',
  '/inventory',
  '/crm',
  '/admin',
  '/tasks',
  '/permits',
  '/process',
  '/punchlist',
  '/warranty',
  '/claims',
  // Print surfaces render tenant-scoped records and must never be reachable
  // anonymously, even though they live outside the dashboard route group.
  '/inspection',
  '/weekly-report',
] as const

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
