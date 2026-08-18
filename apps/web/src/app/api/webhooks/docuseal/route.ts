import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { docuSealWebhookCommandSchema } from '@third-code-erp/shared-types'
import { emailRoles } from '@/lib/operations/notifications'
import { processDocuSealWebhookThroughCoreApi } from '@/lib/erp-core-client'

interface IncomingDocuSealWebhook {
  event?: unknown
  submission_id?: unknown
  documents?: unknown
}

function matchesSecret(
  provided: string | null,
  expected: string
): boolean {
  if (!provided) return false
  const providedBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(expected)
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  )
}

function isWebhookPayload(value: unknown): value is IncomingDocuSealWebhook {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Authenticated DocuSeal ingress only. Core owns every durable business,
 * notification, and audit write in its single transaction; this route only
 * verifies the provider secret, normalizes the payload, and sends best-effort
 * email after Core has committed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim()
  if (!expectedSecret) {
    return NextResponse.json(
      { received: false, error: 'DocuSeal webhook is not configured.' },
      { status: 503 }
    )
  }

  if (!matchesSecret(req.headers.get('x-docuseal-secret'), expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: IncomingDocuSealWebhook
  try {
    const parsed = await req.json()
    if (!isWebhookPayload(parsed)) {
      return NextResponse.json(
        { received: false, error: 'Invalid JSON' },
        { status: 400 }
      )
    }
    payload = parsed
  } catch {
    return NextResponse.json(
      { received: false, error: 'Invalid JSON' },
      { status: 400 }
    )
  }

  if (payload.event !== 'submission.completed') {
    return NextResponse.json(
      {
        received: true,
        ignored: typeof payload.event === 'string' ? payload.event : null,
      },
      { status: 200 }
    )
  }

  const coreCommand = docuSealWebhookCommandSchema.safeParse({
    event: payload.event,
    submissionId: payload.submission_id,
    documents: payload.documents ?? [],
  })
  if (!coreCommand.success) {
    return NextResponse.json(
      { received: false, error: 'Invalid DocuSeal webhook payload' },
      { status: 400 }
    )
  }

  const coreResult = await processDocuSealWebhookThroughCoreApi(
    coreCommand.data
  )
  if (!coreResult.ok || !coreResult.data) {
    return NextResponse.json(
      {
        received: false,
        error: coreResult.error ?? 'DocuSeal webhook was not committed.',
      },
      { status: coreResult.status ?? 503 }
    )
  }

  if (
    coreResult.data.handled &&
    !coreResult.data.duplicate &&
    coreResult.data.projectId &&
    coreResult.data.tcvCents !== null &&
    coreResult.data.tenantId
  ) {
    const tcvPhp = (coreResult.data.tcvCents / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    try {
      await emailRoles({
        tenantId: coreResult.data.tenantId,
        recipientRoles: ['sales', 'commercial', 'admin', 'owner'],
        subject: `Client signed BOM — ${coreResult.data.projectName ?? 'project'}`,
        body: `DocuSeal recorded signature for the BOM. TCV: ₱${tcvPhp}.`,
        linkUrl: `/projects/${coreResult.data.projectId}/bom`,
        alsoEmail: true,
        templateId: 'bom-signed',
        templateVars: {
          project_name: coreResult.data.projectName ?? 'your project',
          tcv_php: tcvPhp,
          project_url: `/projects/${coreResult.data.projectId}`,
        },
      })
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'docuseal_webhook_email_delivery_failed',
          tenant_id: coreResult.data.tenantId,
          project_id: coreResult.data.projectId,
          error: error instanceof Error ? error.message : 'unknown',
        })
      )
    }
  }

  return NextResponse.json({
    received: true,
    handled: coreResult.data.handled,
    duplicate: coreResult.data.duplicate,
  })
}
