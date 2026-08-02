import { NextResponse } from 'next/server'
import { getUser } from '@third-code-erp/auth'
import { getDocumentProcessingStatusThroughCoreApi } from '@/lib/erp-core-client'

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId } = await context.params
  const result = await getDocumentProcessingStatusThroughCoreApi(jobId)
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Document processing status is unavailable.' },
      { status: 502 }
    )
  }

  return NextResponse.json(result.data, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  })
}
