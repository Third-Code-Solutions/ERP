import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  vendorConfirmationBodySchema,
  vendorConfirmationResultSchema,
  vendorConfirmationViewSchema,
  type VendorConfirmationBody,
  type VendorConfirmationResult,
  type VendorConfirmationView,
} from '@third-code-erp/shared-types'

export interface VendorConfirmationCoreResult<T> {
  ok: boolean
  data?: T
  error?: string
}

function apiBaseUrl(): string | null {
  const raw = process.env.ERP_CORE_API_URL?.trim()
  return raw ? raw.replace(/\/+$/, '') : null
}

function messageForStatus(status: number, fallback: string): string {
  if (status === 404) return 'This supplier confirmation link is not available.'
  if (status === 409) return 'This supplier confirmation link is no longer awaiting a response.'
  if (status === 503) return 'Supplier confirmation is not available yet. Contact the project team.'
  return fallback
}

export async function getVendorConfirmationView(
  token: string
): Promise<VendorConfirmationCoreResult<VendorConfirmationView>> {
  const baseUrl = apiBaseUrl()
  if (!baseUrl) {
    return { ok: false, error: 'Supplier confirmation is not available yet.' }
  }

  try {
    const response = await fetch(
      `${baseUrl}/v1/public/purchase-orders/${encodeURIComponent(token)}/confirmation`,
      {
        method: 'GET',
        headers: { 'x-request-id': randomUUID() },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error: messageForStatus(
          response.status,
          'Supplier confirmation could not be loaded.'
        ),
      }
    }
    const parsed = vendorConfirmationViewSchema.safeParse(payload)
    if (!parsed.success) {
      return { ok: false, error: 'Supplier confirmation could not be loaded.' }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, error: 'Supplier confirmation is temporarily unavailable.' }
  }
}

export async function submitVendorConfirmation(
  token: string,
  body: VendorConfirmationBody,
  idempotencyKey: string = randomUUID()
): Promise<VendorConfirmationCoreResult<VendorConfirmationResult>> {
  const baseUrl = apiBaseUrl()
  if (!baseUrl) {
    return { ok: false, error: 'Supplier confirmation is not available yet.' }
  }
  const parsedBody = vendorConfirmationBodySchema.safeParse(body)
  if (!parsedBody.success) {
    return { ok: false, error: 'Please complete the supplier response.' }
  }

  try {
    const response = await fetch(
      `${baseUrl}/v1/public/purchase-orders/${encodeURIComponent(token)}/confirmation`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(parsedBody.data),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      }
    )
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error: messageForStatus(
          response.status,
          'Supplier response could not be recorded.'
        ),
      }
    }
    const parsed = vendorConfirmationResultSchema.safeParse(payload)
    if (!parsed.success) {
      return { ok: false, error: 'Supplier response could not be recorded.' }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, error: 'Supplier confirmation is temporarily unavailable.' }
  }
}
