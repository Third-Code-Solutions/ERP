'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getUserProfile, requireCapability } from '@third-code-erp/auth'
import { parsePercentToBps } from '@third-code-erp/shared-types/bom'
import { createCustomerInvoiceDraftThroughCoreApi } from '@/lib/erp-core-client'

export interface InvoiceDraftInput {
  billingPercentBps: number
  /** The BOM the user is billing from; Core refuses any but the project's latest approved one. */
  bomId: string | null
  dueDate: string | null
  notes: string | null
}

/**
 * The only web path that creates a customer invoice draft. Core owns the
 * money: it bills only the project's latest approved BOM, applies the D-6
 * cumulative cap and the tax rules, numbers the invoice and writes the audit.
 */
export async function createInvoiceDraft(
  projectId: string,
  input: InvoiceDraftInput
): Promise<{ error?: string; invoiceId?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!profile.tenantId) return { error: 'No tenant' }

  try {
    requireCapability(profile, 'finance.issue_invoice')
  } catch {
    return { error: 'You do not have permission to create invoices.' }
  }

  const { billingPercentBps } = input
  if (
    !Number.isInteger(billingPercentBps) ||
    billingPercentBps <= 0 ||
    billingPercentBps > 10_000
  ) {
    return { error: 'Billing % must be between 0.01% and 100%' }
  }

  const coreResult = await createCustomerInvoiceDraftThroughCoreApi(
    projectId,
    {
      billingPercentBps,
      bomId: input.bomId,
      dueDate: input.dueDate,
      notes: input.notes,
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

export async function createInvoice(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; invoiceId?: string }> {
  return createInvoiceDraft(projectId, {
    // An unparseable percent becomes 0, which the range check refuses.
    billingPercentBps:
      parsePercentToBps(String(formData.get('billing_pct') ?? '')) ?? 0,
    bomId: null,
    dueDate: String(formData.get('due_date') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
  })
}
