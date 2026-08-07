import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { cortexSemanticIndexCommandSchema } from '@third-code-erp/shared-types'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  cortexSemanticIndexJobsUseCoreApi,
  createCortexSemanticIndexJobThroughCoreApi,
} from '@/lib/erp-core-client'
import { canonicalRole } from '@/lib/operations/nav-config'

export async function POST(request: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  if (canonicalRole(profile.role) !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  if (!cortexSemanticIndexJobsUseCoreApi(profile.tenantId)) {
    return NextResponse.json(
      { error: 'Semantic indexing is paused.' },
      { status: 503, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 256) {
    return NextResponse.json(
      { error: 'Valid Idempotency-Key header is required.' },
      { status: 400, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  const body: unknown = await request.json().catch(() => null)
  const command = cortexSemanticIndexCommandSchema.safeParse(body)
  if (!command.success) {
    return NextResponse.json(
      { error: 'Invalid semantic index request.' },
      { status: 400, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const result = await createCortexSemanticIndexJobThroughCoreApi(
    command.data,
    idempotencyKey
  )
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Semantic index service is unavailable.' },
      { status: result.status ?? 503, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  return NextResponse.json(result.data, {
    status: result.data.status === 'queued' ? 202 : 200,
    headers: CORTEX_PRIVATE_HEADERS,
  })
}
