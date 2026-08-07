import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { z } from 'zod'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  cortexSemanticIndexJobsUseCoreApi,
  getCortexSemanticIndexJobThroughCoreApi,
} from '@/lib/erp-core-client'
import { canonicalRole } from '@/lib/operations/nav-config'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
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

  const parsed = z.string().uuid().safeParse((await params).jobId)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid semantic index job.' },
      { status: 400, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  const result = await getCortexSemanticIndexJobThroughCoreApi(parsed.data)
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Semantic index service is unavailable.' },
      { status: result.status ?? 503, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  return NextResponse.json(result.data, { headers: CORTEX_PRIVATE_HEADERS })
}
