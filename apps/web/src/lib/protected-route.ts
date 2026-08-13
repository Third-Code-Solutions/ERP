/**
 * Browser-rendered ERP surfaces that require a Supabase session before the
 * route tree is rendered. API handlers keep their own authorization checks.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/projects',
  '/pipeline',
  '/bom',
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
  '/punchlist',
  '/warranty',
  '/claims',
] as const

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
