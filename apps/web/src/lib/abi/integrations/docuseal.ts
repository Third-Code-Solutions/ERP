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
 */

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
