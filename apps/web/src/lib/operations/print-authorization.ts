import { getUserProfile } from '@third-code-erp/auth'
import { notFound } from 'next/navigation'
import { canViewPath } from './nav-config'

/** Print routes sit outside DashboardLayout; apply the source document policy. */
export async function requirePrintProfile(document: 'invoice' | 'purchase-order', id: string) {
  const profile = await getUserProfile()
  const path = document === 'invoice' ? `/invoices/${id}` : `/purchase-orders/${id}`
  if (!profile || !canViewPath(profile.role, path)) notFound()
  return profile
}
