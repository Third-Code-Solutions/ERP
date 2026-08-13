'use server'

/**
 * Customer portal overview server actions.
 *
 * Only the shared `logView` increment lives here — each sub-page
 * (progress / documents / photos / billing, owned by Tracks 7-8) declares
 * its own actions.ts for its own mutations.
 *
 * No auth context — public portal. Tenant identity is verified upstream by
 * `findActiveCustomerSession` before this is ever called.
 */

import { logCustomerView } from '@/lib/operations/customer-portal'

export async function logView(sessionId: string, tenantId: string): Promise<void> {
  if (!sessionId) return
  await logCustomerView(sessionId, tenantId)
}
