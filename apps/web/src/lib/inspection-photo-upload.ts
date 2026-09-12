'use client'

import { createSupabaseBrowserClient } from '@third-code-erp/auth'
import { inspectionPhotoResultSchema } from '@third-code-erp/shared-types'
import { inspectionPhotoTransportSchema, inspectionPhotoUploadUrl, safeInspectionPhotoFileName } from './inspection-photo-upload-contract'

type Scope = { actorId: string; tenantId: string; opportunityId: string }
class InspectionUploadError extends Error {}

/** Credentials remain transient; only the verified document receipt belongs in a draft. */
export async function uploadInspectionPhoto(
  file: File,
  scope: Scope,
  requireCurrentSession: () => void,
): Promise<string> {
  if (file.size <= 0 || file.size > 15 * 1024 * 1024) throw new Error('Photo exceeds the 15 MiB limit.')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new InspectionUploadError('Photo upload timed out. Your saved photo remains available; retry the same photo.'))
    }, 120_000)
  })
  async function bounded<T>(operation: Promise<T>): Promise<T> {
    const value = await Promise.race([operation, deadline])
    requireCurrentSession()
    if (controller.signal.aborted) throw new InspectionUploadError('Photo upload timed out. Retry the same saved photo.')
    return value
  }
  try {
    requireCurrentSession()
    const headers = {
      'x-expected-actor-id': scope.actorId,
      'x-expected-tenant-id': scope.tenantId,
    }
    const metadata = await bounded(fetch(`/api/crm/opportunities/${scope.opportunityId}/inspection-photos/transport`, {
      headers, cache: 'no-store', redirect: 'error', signal: controller.signal,
    }))
    const transport = inspectionPhotoTransportSchema.safeParse(await bounded(metadata.json()))
    requireCurrentSession()
    if (!metadata.ok || !transport.success ||
      transport.data.actorId.toLowerCase() !== scope.actorId.toLowerCase() ||
      transport.data.tenantId.toLowerCase() !== scope.tenantId.toLowerCase() ||
      transport.data.opportunityId.toLowerCase() !== scope.opportunityId.toLowerCase()) {
      throw new InspectionUploadError('Inspection photo transport did not match this account. Retry from the original account.')
    }
    const target = new URL(transport.data.uploadUrl)
    if (transport.data.uploadUrl !== inspectionPhotoUploadUrl(target.origin, scope.opportunityId)) {
      throw new InspectionUploadError('Inspection photo transport returned an invalid destination.')
    }
    const bytes = await bounded(file.arrayBuffer())
    const digest = await bounded(crypto.subtle.digest('SHA-256', bytes))
    requireCurrentSession()
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
    const session = await bounded(createSupabaseBrowserClient().auth.getSession())
    requireCurrentSession()
    if (session.error || !session.data.session?.access_token ||
      session.data.session.user.id.toLowerCase() !== scope.actorId.toLowerCase()) {
      throw new InspectionUploadError('Inspection session changed. Sign in to the original account to retry.')
    }
    const fileName = safeInspectionPhotoFileName(file.name)
    const body = new FormData()
    // Canonical ASCII avoids parser charset/basename changes breaking receipt binding.
    body.set('file', file, fileName)
    const response = await bounded(fetch(transport.data.uploadUrl, {
      method: 'POST', body,
      headers: { ...headers, Authorization: `Bearer ${session.data.session.access_token}` },
      credentials: 'omit', redirect: 'error', signal: controller.signal,
    }))
    const receipt = inspectionPhotoResultSchema.safeParse(await bounded(response.json()))
    requireCurrentSession()
    const path = `${scope.tenantId.toLowerCase()}/opportunities/${scope.opportunityId.toLowerCase()}/inspection/${hash}-${fileName}`
    if (!response.ok || !receipt.success || receipt.data.tenantId.toLowerCase() !== scope.tenantId.toLowerCase() ||
      receipt.data.opportunityId.toLowerCase() !== scope.opportunityId.toLowerCase() ||
      receipt.data.fileName !== fileName || receipt.data.storagePath !== path) {
      throw new InspectionUploadError('Photo upload is unconfirmed. Your saved photo remains available; retry the same photo.')
    }
    return receipt.data.documentId
  } catch (error) {
    if (error instanceof InspectionUploadError) throw error
    throw new InspectionUploadError('Photo upload is unconfirmed. Keep the saved draft and retry from the original account.')
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
