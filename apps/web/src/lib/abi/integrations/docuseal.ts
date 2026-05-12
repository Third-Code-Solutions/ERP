/**
 * DocuSeal client (REFACTOR.md §7.2).
 *
 * Self-hosted DocuSeal instance is expected at DOCUSEAL_API_URL with token
 * DOCUSEAL_API_TOKEN. When either is missing this module emits a typed
 * "dev-mode" submission so the rest of the system can wire up signing
 * flows end-to-end before the live integration lands.
 *
 * Live verification: set DOCUSEAL_API_URL + DOCUSEAL_API_TOKEN, restart,
 * call createSubmission() — a real DocuSeal submission_id comes back.
 * The webhook handler at /api/webhooks/docuseal records `submission.completed`.
 *
 * `createSigningSession` is the unified wrapper: it prefers the canvas
 * sign infrastructure (zero env vars, in-app signing) and falls through
 * to DocuSeal when DOCUSEAL_API_URL + DOCUSEAL_API_TOKEN are both set.
 */

import {
  createCanvasSignSession,
  type SignableEntityType,
} from './canvas-sign'

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

const isDev = () =>
  !process.env.DOCUSEAL_API_URL || !process.env.DOCUSEAL_API_TOKEN

export async function createDocuSealSubmission(
  input: CreateSubmissionInput
): Promise<SubmissionResult> {
  if (isDev()) {
    // Deterministic-ish ids in dev so screenshots/logs are readable.
    const seed = Math.random().toString(36).slice(2, 10)
    return {
      submission_id: `dev-sub-${seed}`,
      slug: `dev-${seed}`,
      url: `/portal/dev-sign/${seed}`,
      is_dev_stub: true,
    }
  }

  const res = await fetch(`${process.env.DOCUSEAL_API_URL}/api/v1/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': process.env.DOCUSEAL_API_TOKEN!,
    },
    body: JSON.stringify({
      template_id: input.templateId,
      submitters: input.submitters,
      metadata: input.metadata,
      send_email: input.sendEmail ?? false,
    }),
  })
  if (!res.ok) {
    throw new Error(`DocuSeal createSubmission failed (${res.status}): ${await res.text()}`)
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

interface SigningSessionResult {
  url: string
  /** One-shot token — display once. Audit log holds traceability afterwards. */
  token: string
  is_dev_stub: boolean
  mechanism: 'canvas' | 'docuseal'
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
  input: CreateSigningSessionInput,
): Promise<SigningSessionResult> {
  const docusealConfigured =
    Boolean(process.env.DOCUSEAL_API_URL) &&
    Boolean(process.env.DOCUSEAL_API_TOKEN)

  if (docusealConfigured) {
    const templateId = templateIdFor(input.entityType)
    const submitter: { email: string; name?: string; role: string } = {
      email: input.signerEmail ?? 'client@unknown.local',
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
    is_dev_stub: isDev(),
    mechanism: 'canvas',
  }
}

function templateIdFor(entityType: SignableEntityType): string {
  switch (entityType) {
    case 'bom':
      return process.env.DOCUSEAL_BOM_TEMPLATE_ID ?? 'bom-default'
    case 'contract':
      return process.env.DOCUSEAL_CONTRACT_TEMPLATE_ID ?? 'contract-default'
    case 'variation_order':
      return process.env.DOCUSEAL_VO_TEMPLATE_ID ?? 'vo-default'
    case 'coc':
      return process.env.DOCUSEAL_COC_TEMPLATE_ID ?? 'coc-default'
  }
}
