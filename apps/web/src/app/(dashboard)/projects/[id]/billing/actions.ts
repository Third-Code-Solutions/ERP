'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getUserProfile, requireCapability } from '@third-code-erp/auth'
import { parsePercentToBps } from '@third-code-erp/shared-types/bom'
import { createCustomerInvoiceDraftThroughCoreApi } from '@/lib/erp-core-client'

export async function createInvoice(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; invoiceId?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!profile.tenantId) return { error: 'No tenant' }

  try {
    requireCapability(profile, 'finance.issue_invoice')
  } catch {
    return { error: 'You do not have permission to create invoices.' }
  }

  const billingPercentBps = parsePercentToBps(
    String(formData.get('billing_pct') ?? '')
  )
  if (
    billingPercentBps === null ||
    billingPercentBps <= 0 ||
    billingPercentBps > 10_000
  ) {
    return { error: 'Billing % must be between 1 and 100' }
  }

  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const coreResult = await createCustomerInvoiceDraftThroughCoreApi(
    projectId,
    {
      billingPercentBps,
      bomId: null,
      dueDate,
      notes,
    },
    randomUUID()
  )
  if (!coreResult.ok || !coreResult.data) {
    return {
      error:
        coreResult.error ??
        'Customer invoice draft was not created. No financial record was saved.',
    }
  }
  if (
    coreResult.data.tenantId !== profile.tenantId ||
    coreResult.data.projectId !== projectId ||
    coreResult.data.status !== 'draft'
  ) {
    return { error: 'Customer invoice draft returned an invalid tenant scope.' }
  }

  revalidatePath(`/projects/${projectId}/billing`)
  revalidatePath('/invoices')

  return { invoiceId: coreResult.data.invoiceId }
}
