/**
 * DocuSeal client (REFACTOR.md §7.2).
 *
 * Self-hosted DocuSeal instance is optional. When configured, this module
 * creates DocuSeal submissions. The unified signing wrapper uses the
 * production-ready in-app canvas mechanism when DocuSeal is not configured.
 * The direct DocuSeal helper retains a typed dev stub for legacy callers.
 *
 * Live verification: set DOCUSEAL_API_URL + DOCUSEAL_API_TOKEN, restart,
 * call createSubmission() — a real DocuSeal submission_id comes back.
 * The webhook handler at /api/webhooks/docuseal records `submission.completed`.
 *
 * `createSigningSession` is the unified wrapper: it prefers the canvas
 * sign infrastructure (zero env vars, in-app signing) and falls through
 * to DocuSeal when DOCUSEAL_API_URL + DOCUSEAL_API_TOKEN are both set.
 */

import { z } from 'zod'

import { createCanvasSignSession, type SignableEntityType } from './canvas-sign'

interface CreateSubmissionInput {
  templateId: string
  submitters: { email: string; name?: string; role?: string }[]
  metadata?: Record<string, unknown>
  /** Send a templated email to submitters (we typically prefer false; the
   *  caller controls notifications via the dedicated /portal route + token). */
  sendEmail?: boolean
}

interface SubmissionResult {
  submission_id: string
  slug: string
  url: string
  is_dev_stub: boolean
}

/** Legacy marker used by pre-canvas development portal links. */
export function isDevelopmentStubSubmissionId(
  submissionId: string | null | undefined
): boolean {
  return submissionId?.startsWith('dev-sub-') ?? false
}

type DocuSealConfig = { apiUrl: URL; apiToken: string } | null

function docuSealConfig(): DocuSealConfig {
  const apiUrlValue = process.env.DOCUSEAL_API_URL?.trim()
  const apiToken = process.env.DOCUSEAL_API_TOKEN?.trim()
  if (Boolean(apiUrlValue) !== Boolean(apiToken)) {
    throw new Error(
      'DocuSeal configuration is incomplete: DOCUSEAL_API_URL and DOCUSEAL_API_TOKEN must be configured together.'
    )
  }
  if (!apiUrlValue || !apiToken) return null
  if (apiToken.length < 20) {
    throw new Error('DOCUSEAL_API_TOKEN must contain at least 20 characters.')
  }

  const apiUrl = new URL(apiUrlValue)
  if (
    !['http:', 'https:'].includes(apiUrl.protocol) ||
    (process.env.NODE_ENV === 'production' && apiUrl.protocol !== 'https:') ||
    apiUrl.username !== '' ||
    apiUrl.password !== '' ||
    apiUrl.search !== '' ||
    apiUrl.hash !== ''
  ) {
    throw new Error(
      'DOCUSEAL_API_URL must be a credential-free API base and use HTTPS in production.'
    )
  }
  if (!apiUrl.pathname.endsWith('/')) apiUrl.pathname += '/'
  return { apiUrl, apiToken }
}

const canUseDevelopmentStub = () => process.env.NODE_ENV !== 'production'

export async function createDocuSealSubmission(
  input: CreateSubmissionInput
): Promise<SubmissionResult> {
  const config = docuSealConfig()
  if (!config) {
    if (!canUseDevelopmentStub()) {
      throw new Error(
        'DocuSeal integration is not configured for production. Use in-app canvas signing or configure DOCUSEAL_API_URL and DOCUSEAL_API_TOKEN.'
      )
    }
    // Deterministic-ish ids in dev so screenshots/logs are readable.
    const seed = Math.random().toString(36).slice(2, 10)
    return {
      submission_id: `dev-sub-${seed}`,
      slug: `dev-${seed}`,
      url: `/portal/dev-sign/${seed}`,
      is_dev_stub: true,
    }
  }

  const res = await fetch(new URL('submissions', config.apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': config.apiToken,
    },
    body: JSON.stringify({
      template_id: input.templateId,
      submitters: input.submitters,
      metadata: input.metadata,
      send_email: input.sendEmail ?? false,
    }),
  })
  if (!res.ok) {
    throw new Error(`DocuSeal createSubmission failed (${res.status})`)
  }
  const body = (await res.json()) as { id: string; slug: string; url: string }
  return {
    submission_id: body.id,
    slug: body.slug,
    url: body.url,
    is_dev_stub: false,
  }
}

/**
 * Webhook payload type — matches DocuSeal `submission.completed` shape.
 */
export interface DocuSealWebhookPayload {
  event: 'submission.completed' | 'submission.opened' | 'submission.expired'
  submission_id: string
  documents?: { url: string; name?: string }[]
}

interface CreateSigningSessionInput {
  tenantId: string
  entityType: SignableEntityType
  entityId: string
  signerEmail?: string
  signerName?: string
}

type SigningSessionResult =
  | {
      url: string
      /** One-shot canvas token; absent from provider correlation columns. */
      token: string
      submissionId: null
      slug: null
      is_dev_stub: false
      mechanism: 'canvas'
    }
  | {
      url: string
      /** DocuSeal slug retained for link/display compatibility. */
      token: string
      submissionId: string
      slug: string
      is_dev_stub: boolean
      mechanism: 'docuseal'
    }

/**
 * Unified signing-session factory. Use this from any place that needs to
 * send a document for client signature.
 *
 * Routing:
 *   - If DOCUSEAL_API_URL AND DOCUSEAL_API_TOKEN are set → DocuSeal path.
 *   - Otherwise → canvas-sign path (in-app, zero infra).
 *
 * Both branches return the public URL the operator should hand to the
 * signer. The `token` is the one-shot value embedded in that URL — for
 * canvas-sign it is the raw token (URL stores SHA-256 hash only); for
 * DocuSeal it is the submission slug.
 */
export async function createSigningSession(
  input: CreateSigningSessionInput
): Promise<SigningSessionResult> {
  const config = docuSealConfig()

  if (config) {
    const templateId = templateIdFor(input.entityType)
    const signerEmail = z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase())
      .safeParse(input.signerEmail)
    if (!signerEmail.success) {
      throw new Error(
        'A valid client signer email is required for DocuSeal submissions.'
      )
    }
    const submitter: { email: string; name?: string; role: string } = {
      email: signerEmail.data,
      role: 'client',
    }
    if (input.signerName) submitter.name = input.signerName

    const submission = await createDocuSealSubmission({
      templateId,
      submitters: [submitter],
      metadata: {
        entity_type: input.entityType,
        entity_id: input.entityId,
        tenant_id: input.tenantId,
      },
      sendEmail: false,
    })
    return {
      url: submission.url,
      token: submission.slug,
      submissionId: submission.submission_id,
      slug: submission.slug,
      is_dev_stub: submission.is_dev_stub,
      mechanism: 'docuseal',
    }
  }

  const session = await createCanvasSignSession({
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    signerEmail: input.signerEmail,
    signerName: input.signerName,
  })
  return {
    url: session.url,
    token: session.token,
    submissionId: null,
    slug: null,
    // Canvas signing persists a real one-shot signature session and is not a
    // DocuSeal fallback stub.
    is_dev_stub: false,
    mechanism: 'canvas',
  }
}

function templateIdFor(entityType: SignableEntityType): string {
  const environmentKey = (() => {
    switch (entityType) {
      case 'bom':
        return 'DOCUSEAL_BOM_TEMPLATE_ID'
      case 'contract':
        return 'DOCUSEAL_CONTRACT_TEMPLATE_ID'
      case 'variation_order':
        return 'DOCUSEAL_VO_TEMPLATE_ID'
      case 'coc':
        return 'DOCUSEAL_COC_TEMPLATE_ID'
    }
  })()
  const templateId = process.env[environmentKey]?.trim()
  if (!templateId) {
    throw new Error(
      `${environmentKey} is required when DocuSeal is selected for ${entityType}.`
    )
  }
  return templateId
}
