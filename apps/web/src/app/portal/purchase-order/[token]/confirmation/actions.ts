'use server'

import { randomUUID } from 'node:crypto'
import {
  vendorConfirmationBodySchema,
  type VendorConfirmationDecision,
} from '@third-code-erp/shared-types'
import { submitVendorConfirmation } from '@/lib/vendor-confirmation-client'

export interface VendorConfirmationActionState {
  ok: boolean
  message?: string
  decision?: VendorConfirmationDecision
}

export async function submitVendorConfirmationAction(
  token: string,
  _previousState: VendorConfirmationActionState,
  formData: FormData
): Promise<VendorConfirmationActionState> {
  const decision = String(formData.get('decision') ?? '')
  const responderName = String(formData.get('responderName') ?? '')
  const responderEmail = String(formData.get('responderEmail') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const parsed = vendorConfirmationBodySchema.safeParse({
    decision,
    responderName,
    responderEmail: responderEmail || null,
    note: note || null,
  })
  if (!parsed.success) {
    return {
      ok: false,
      message:
        decision === 'accepted'
          ? 'Enter your name before accepting this order.'
          : 'Choose a decision, enter your name, and add a note for changes or decline.',
    }
  }

  const result = await submitVendorConfirmation(
    token,
    parsed.data,
    String(formData.get('idempotencyKey') ?? '').trim() || randomUUID()
  )
  if (!result.ok) {
    return { ok: false, message: result.error }
  }
  return { ok: true, decision: result.data?.decision, message: 'Response recorded.' }
}
