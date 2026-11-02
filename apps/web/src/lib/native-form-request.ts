import 'server-only'

import { resolvePublicOrigin } from './public-origin'

export const NATIVE_FORM_MAX_BYTES = 16 * 1024

export type NativeFormDestination =
  | '/settings'
  | '/platform-admin'
  | '/platform-admin/tenants'
  | '/platform-admin/users'

type NativeFormReadResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: Response }

function failure(status: number, message: string): NativeFormReadResult {
  return {
    ok: false,
    response: new Response(message, {
      status,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    }),
  }
}

export async function readNativeForm(
  request: Request,
  expectedOrigin = resolvePublicOrigin(),
  maxBytes = NATIVE_FORM_MAX_BYTES
): Promise<NativeFormReadResult> {
  if (request.headers.get('origin') !== expectedOrigin.origin) {
    return failure(403, 'This form submission did not come from the configured application origin.')
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') {
    return failure(415, 'This form accepts URL-encoded fields only.')
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength) {
    const bytes = Number(declaredLength)
    if (!Number.isSafeInteger(bytes) || bytes < 0) return failure(400, 'Invalid form body length.')
    if (bytes > maxBytes) return failure(413, 'Form body is too large.')
  }

  const reader = request.body?.getReader()
  if (!reader) return failure(400, 'Form body is required.')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return failure(413, 'Form body is too large.')
      }
      chunks.push(value)
    }
  } catch {
    return failure(400, 'Form body could not be read.')
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let body: string
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return failure(400, 'Form body must be valid UTF-8.')
  }
  try {
    decodeURIComponent(body.replaceAll('+', ' '))
  } catch {
    return failure(400, 'Form body contains invalid encoding.')
  }

  const formData = new FormData()
  for (const [key, value] of new URLSearchParams(body)) formData.append(key, value)
  return { ok: true, formData }
}

export function nativeFormRedirect(
  destination: NativeFormDestination,
  parameter: { notice: string } | { error: string },
  publicOrigin = resolvePublicOrigin()
): Response {
  const url = new URL(destination, publicOrigin)
  url.search = new URLSearchParams(parameter).toString()
  return new Response(null, {
    status: 303,
    headers: {
      'cache-control': 'no-store',
      location: url.toString(),
    },
  })
}
