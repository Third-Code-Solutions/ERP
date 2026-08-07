import { getUserProfile } from '@third-code-erp/auth'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import {
  cancelCortexAssistantGenerationJobThroughCoreApi,
  cortexAssistantGenerationJobsUseCoreApi,
  getCortexAssistantGenerationResultThroughCoreApi,
} from '@/lib/erp-core-client'
import {
  CORTEX_CITATIONS_HEADER,
  encodeCortexCitationHeader,
} from '@/lib/cortex/citation-header'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'

const jobIdSchema = z.string().uuid()

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: CORTEX_PRIVATE_HEADERS }
  )
}

type JobAuthorization =
  | { ok: false; response: Response }
  | { ok: true; jobId: string }

async function authorize(jobId: string): Promise<JobAuthorization> {
  const profile = await getUserProfile()
  if (!profile) {
    return { ok: false, response: jsonError('Unauthorized', 401) }
  }
  if (!cortexAssistantGenerationJobsUseCoreApi(profile.tenantId)) {
    return {
      ok: false,
      response: jsonError('Cortex generation jobs are paused.', 503),
    }
  }
  const parsed = jobIdSchema.safeParse(jobId)
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError('Invalid Cortex generation job.', 400),
    }
  }
  return { ok: true, jobId: parsed.data }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const authorized = await authorize((await params).jobId)
  if (!authorized.ok) return authorized.response

  const result = await getCortexAssistantGenerationResultThroughCoreApi(
    authorized.jobId
  )
  if (!result.ok || !result.data) {
    return jsonError(
      result.error ?? 'Cortex generation result is unavailable.',
      result.status ?? 503
    )
  }

  if (
    result.data.job.status === 'queued' ||
    result.data.job.status === 'processing'
  ) {
    return Response.json(result.data, {
      status: 202,
      headers: { ...CORTEX_PRIVATE_HEADERS, 'Retry-After': '1' },
    })
  }
  if (result.data.job.status === 'cancelled') {
    return jsonError('Cortex response generation was cancelled.', 409)
  }
  if (result.data.job.status === 'failed') {
    return jsonError('Cortex response generation did not complete.', 503)
  }
  if (!result.data.result) {
    return jsonError('Cortex generation result is unavailable.', 503)
  }

  const headers: Record<string, string> = {
    ...CORTEX_PRIVATE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Conversation-Id': result.data.result.conversationId,
  }
  const citationHeader = encodeCortexCitationHeader(
    result.data.result.citations
  )
  if (citationHeader) headers[CORTEX_CITATIONS_HEADER] = citationHeader
  return new Response(result.data.result.content, { headers })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const authorized = await authorize((await params).jobId)
  if (!authorized.ok) return authorized.response

  const result = await cancelCortexAssistantGenerationJobThroughCoreApi(
    authorized.jobId,
    `browser-cancel:${authorized.jobId}`
  )
  if (!result.ok || !result.data) {
    return jsonError(
      result.error ?? 'Cortex generation cancellation is unavailable.',
      result.status ?? 503
    )
  }
  return Response.json(result.data, { headers: CORTEX_PRIVATE_HEADERS })
}
