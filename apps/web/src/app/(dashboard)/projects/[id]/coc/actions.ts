'use server'

// REFACTOR.md M6 US-Post-002 — Certificate of Completion (COC) workflow.
//
// State machine: null → draft → pending_signature → signed.
//   - draftCoc: requires turnover compiled.
//   - sendCocForSignature: creates a signing session, emails the link to the
//     signer and returns it so the sender can also copy it.
//   - resendCocSigningLink: replaces the link while pending (links expire).
//   - cancelCocSigningRequest: pending_signature → draft, link revoked.
//   - recordCocSigned: manual record of a DocuSeal signature, only while
//     pending; sets signed_at + warranty window and pings CX to start M7
//     onboarding. Canvas signatures are recorded by the public signing path.

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  certificatesOfCompletion,
  documents,
  projects,
  turnoverPackages,
} from '@third-code-erp/database/schema'
import { writeAuditLog, writeAuditLogInTransaction } from '@/lib/audit'
import { notifyExternalEmail, notifyRoles } from '@/lib/operations/notifications'
import {
  archiveDocuSealSubmission,
  createSigningSession,
} from '@/lib/operations/integrations/docuseal'
import {
  newestOpenSigningSessionAt,
  revokeOpenSigningSessions,
} from '@/lib/operations/signing-sessions'
import { findDefaultCocSigner } from './queries'

const DEFAULT_WARRANTY_DAYS = 365
// Matches the createCanvasSignSession default; shown to the signer and sender.
const SIGNING_LINK_HOURS = 48
const DEFAULT_SIGNER_NAME = 'Client Signatory'
const COC_NOT_PENDING_ERROR =
  'The certificate is not waiting for signature, so it cannot be recorded as signed.'

export interface CocSignerInput {
  name?: string
  email?: string
}

export interface CocSigningLinkResult {
  error?: string
  /** One-time signing link. Shown to the sender once; never stored or logged. */
  url?: string
  /** True only when the email provider confirmed delivery. */
  emailed?: boolean
  signerEmail?: string
  expiresAt?: string
}

function guard(role: AppRole, capability: ErpCapability): string | null {
  if (!can(role, capability)) {
    return 'You do not have permission to manage the Certificate of Completion.'
  }
  return null
}

function isUuid(value: string): boolean {
  return z.string().uuid().safeParse(value).success
}

export async function draftCoc(
  projectId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  if (!isUuid(projectId)) return { error: 'Invalid project id' }

  // Project + tenant ownership.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  // Gate: turnover must be compiled first.
  const [pkg] = await db
    .select({ compiled_at: turnoverPackages.compiled_at })
    .from(turnoverPackages)
    .where(
      and(
        eq(turnoverPackages.project_id, projectId),
        eq(turnoverPackages.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!pkg?.compiled_at) {
    return { error: 'Turnover package must be compiled before drafting COC' }
  }

  // Idempotency — don't create a second COC row.
  const [existing] = await db
    .select({ id: certificatesOfCompletion.id })
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.project_id, projectId),
        eq(certificatesOfCompletion.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (existing) return { error: 'COC already exists for this project' }

  const [created] = await db
    .insert(certificatesOfCompletion)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      status: 'draft',
    })
    .returning({ id: certificatesOfCompletion.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'certificate_of_completion',
    entityId: created!.id,
    action: 'create',
    diff: { status: 'draft', project_id: projectId },
  })

  revalidatePath(`/projects/${projectId}/coc`)
  return {}
}

/**
 * The sender may type the signer. If either field is typed both are required
 * and used as-is; if neither is typed, fall back to the client account's
 * primary contact.
 */
async function resolveSigner(
  tenantId: string,
  projectId: string,
  projectAccountId: string | null,
  typed: CocSignerInput | undefined
): Promise<{ signer: { name: string; email: string } } | { error: string }> {
  const typedName = typed?.name?.trim() ?? ''
  const typedEmail = typed?.email?.trim() ?? ''

  if (typedName || typedEmail) {
    if (!typedName) return { error: 'Enter the name of the client signer.' }
    if (typedName.length > 255) return { error: 'The signer name is too long.' }
    const email = z.string().email().max(255).safeParse(typedEmail)
    if (!email.success) {
      return { error: 'Enter a valid email address for the client signer.' }
    }
    return { signer: { name: typedName, email: email.data } }
  }

  const primary = await findDefaultCocSigner(tenantId, projectId, projectAccountId)
  const email = z.string().trim().email().safeParse(primary?.email)
  if (!email.success) {
    return {
      error:
        'Enter the name and email of the client signer. This project has no client contact with a valid email on file.',
    }
  }
  return { signer: { name: primary?.name || DEFAULT_SIGNER_NAME, email: email.data } }
}

async function loadCoc(projectId: string, tenantId: string) {
  // A malformed id is "not found"; it must not reach a uuid column comparison.
  if (!isUuid(projectId)) return undefined
  const [coc] = await db
    .select()
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.project_id, projectId),
        eq(certificatesOfCompletion.tenant_id, tenantId)
      )
    )
    .limit(1)
  return coc
}

function formatLinkExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const COC_CHANGED_ERROR =
  'The certificate changed while the link was being created. Refresh the page and check its status.'

/** Least time between two signing links for one certificate, so resends cannot flood the signer. */
const COC_RESEND_COOLDOWN_MS = 10 * 60_000

/** Whole minutes until another link may be sent; 0 when it may go now. */
async function cocResendWaitMinutes(tx: Tx, tenantId: string, cocId: string): Promise<number> {
  const issuedAt = await newestOpenSigningSessionAt(tx, tenantId, 'coc', cocId)
  if (!issuedAt) return 0
  const remainingMs = issuedAt.getTime() + COC_RESEND_COOLDOWN_MS - Date.now()
  return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0
}

function cocResendThrottledMessage(waitMinutes: number): string {
  const wait = waitMinutes === 1 ? '1 minute' : `${waitMinutes} minutes`
  return `A signing link was sent for this certificate a few minutes ago. Try again in ${wait}.`
}

/**
 * Lock the certificate row while it is still in `status`. Sends, resends,
 * cancels and signatures of one certificate then run one after another, and in
 * the same order as the signing paths (certificate first, then its links).
 */
async function lockCocInStatus(
  tx: Tx,
  tenantId: string,
  cocId: string,
  status: 'draft' | 'pending_signature'
): Promise<{ docusealSubmissionId: string | null } | null> {
  const [locked] = await tx
    .select({ docusealSubmissionId: certificatesOfCompletion.docuseal_submission_id })
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.id, cocId),
        eq(certificatesOfCompletion.tenant_id, tenantId),
        eq(certificatesOfCompletion.status, status)
      )
    )
    .for('update')
  return locked ?? null
}

/**
 * Move the certificate out of `from`. The status predicate repeats the lock's,
 * so the write can never land on a certificate in another status; a miss throws
 * and rolls the whole transaction back (no link survives it).
 */
async function moveCocFromStatus(
  tx: Tx,
  tenantId: string,
  cocId: string,
  from: 'draft' | 'pending_signature',
  values: Partial<typeof certificatesOfCompletion.$inferInsert>
): Promise<void> {
  const moved = await tx
    .update(certificatesOfCompletion)
    .set(values)
    .where(
      and(
        eq(certificatesOfCompletion.id, cocId),
        eq(certificatesOfCompletion.tenant_id, tenantId),
        eq(certificatesOfCompletion.status, from)
      )
    )
    .returning({ id: certificatesOfCompletion.id })
  if (moved.length !== 1) throw new Error(COC_CHANGED_ERROR)
}

// Shared by send (from draft) and resend (from pending_signature): mint the
// link under the certificate lock, move the certificate, then email the signer.
// The link is a bearer credential, so it only goes back to the caller and the
// signer's inbox, never into the audit log.
async function issueCocSigningLink(
  profile: { tenantId: string; user: { id: string } },
  coc: { id: string; project_id: string },
  from: 'draft' | 'pending_signature',
  signerInput: CocSignerInput | undefined
): Promise<CocSigningLinkResult> {
  const [project] = await db
    .select({ name: projects.name, account_id: projects.account_id })
    .from(projects)
    .where(
      and(eq(projects.id, coc.project_id), eq(projects.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const resolved = await resolveSigner(
    profile.tenantId,
    coc.project_id,
    project.account_id,
    signerInput
  )
  if ('error' in resolved) return { error: resolved.error }
  const { signer } = resolved

  type Issued =
    | {
        session: Awaited<ReturnType<typeof createSigningSession>>
        previousSubmissionId: string | null
      }
    | { error: string }
  const issued = await db.transaction(async (tx): Promise<Issued> => {
    // A second request waits here and its link becomes the only one; a request
    // that finds the certificate moved mints no link at all.
    const locked = await lockCocInStatus(tx, profile.tenantId, coc.id, from)
    if (!locked) return { error: COC_CHANGED_ERROR }
    // Read under the certificate lock, so a resend racing this one waits and then
    // sees the link this one issued. A refusal mints, revokes, emails and audits nothing.
    if (from === 'pending_signature') {
      const waitMinutes = await cocResendWaitMinutes(tx, profile.tenantId, coc.id)
      if (waitMinutes > 0) return { error: cocResendThrottledMessage(waitMinutes) }
    }

    let session: Awaited<ReturnType<typeof createSigningSession>>
    try {
      // The canvas link row goes through this transaction: on the single-connection
      // pool a second, outer connection would wait on the lock this request holds.
      session = await createSigningSession(
        {
          tenantId: profile.tenantId,
          entityType: 'coc',
          entityId: coc.id,
          signerEmail: signer.email,
          signerName: signer.name,
        },
        tx
      )
    } catch {
      console.error('[coc] signing session creation failed')
      return { error: 'The signing link could not be created. Try again.' }
    }

    await moveCocFromStatus(tx, profile.tenantId, coc.id, from, {
      status: 'pending_signature',
      // The submission id, never the signing slug: the slug is a credential.
      docuseal_submission_id:
        session.mechanism === 'docuseal' ? (session.submissionId ?? null) : null,
    })

    // Only the newest link may sign. A first send revokes too, so a link from
    // an earlier, cancelled request is never revived.
    await revokeOpenSigningSessions(tx, profile.tenantId, 'coc', coc.id, session.token)

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'certificate_of_completion',
      entityId: coc.id,
      action: from === 'draft' ? 'status_change' : 'update',
      diff: {
        ...(from === 'draft'
          ? { status: { before: 'draft', after: 'pending_signature' } }
          : { signing_link: 'reissued', previous_links_revoked: true }),
        signer_email: signer.email,
        // Never log the signing link: it is a bearer credential and audit rows are tenant-readable.
        mechanism: session.mechanism,
        is_dev_stub: session.is_dev_stub,
      },
    })
    return { session, previousSubmissionId: locked.docusealSubmissionId }
  })
  if ('error' in issued) return { error: issued.error }
  const { session } = issued

  await archiveDocuSealSubmission(issued.previousSubmissionId)

  // The email goes out after the commit; its notification row records the delivery.
  const expiresAt = new Date(Date.now() + SIGNING_LINK_HOURS * 60 * 60 * 1000)
  let emailed = false
  try {
    const delivery = await notifyExternalEmail({
      tenantId: profile.tenantId,
      recipientEmail: signer.email,
      subject: `Certificate of Completion ready for signature: ${project.name}`,
      templateId: 'coc-signing-link',
      templateVars: {
        project_name: project.name,
        portal_url: session.url,
        valid_until: formatLinkExpiry(expiresAt),
      },
    })
    emailed = delivery.delivered
  } catch {
    console.error('[coc] signing link email failed')
  }

  revalidatePath(`/projects/${coc.project_id}/coc`)
  return {
    url: session.url,
    emailed,
    signerEmail: signer.email,
    expiresAt: expiresAt.toISOString(),
  }
}

export async function sendCocForSignature(
  projectId: string,
  signer?: CocSignerInput
): Promise<CocSigningLinkResult> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const coc = await loadCoc(projectId, profile.tenantId)
  if (!coc) return { error: 'COC not found' }
  if (coc.status !== 'draft') {
    return { error: 'Only a draft certificate can be sent for signature.' }
  }

  return issueCocSigningLink(profile, coc, 'draft', signer)
}

// Links expire after 48 hours; without this a pending certificate is stuck.
export async function resendCocSigningLink(
  projectId: string,
  signer?: CocSignerInput
): Promise<CocSigningLinkResult> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const coc = await loadCoc(projectId, profile.tenantId)
  if (!coc) return { error: 'COC not found' }
  if (coc.status !== 'pending_signature') {
    return { error: 'A new signing link can only be sent while the certificate is waiting for signature.' }
  }

  return issueCocSigningLink(profile, coc, 'pending_signature', signer)
}

export async function cancelCocSigningRequest(
  projectId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const coc = await loadCoc(projectId, profile.tenantId)
  if (!coc) return { error: 'COC not found' }
  if (coc.status !== 'pending_signature') {
    return { error: 'Only a certificate that is waiting for signature can be cancelled.' }
  }

  // The status lock makes a signature that lands first win over the cancel.
  const cancelled = await db.transaction(async (tx) => {
    const locked = await lockCocInStatus(tx, profile.tenantId, coc.id, 'pending_signature')
    if (!locked) return null

    await moveCocFromStatus(tx, profile.tenantId, coc.id, 'pending_signature', {
      status: 'draft',
      docuseal_submission_id: null,
    })
    await revokeOpenSigningSessions(tx, profile.tenantId, 'coc', coc.id)
    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'certificate_of_completion',
      entityId: coc.id,
      action: 'status_change',
      diff: {
        status: { before: 'pending_signature', after: 'draft' },
        signing_link: 'revoked',
      },
    })
    return locked
  })
  if (!cancelled) {
    return { error: 'The certificate is no longer waiting for signature. Refresh the page.' }
  }

  // A cancelled DocuSeal request must not stay signable in DocuSeal.
  await archiveDocuSealSubmission(cancelled.docusealSubmissionId)

  revalidatePath(`/projects/${projectId}/coc`)
  return {}
}

// Manual record of a DocuSeal signature. Idempotent for a signed certificate;
// otherwise the certificate must still be waiting for signature, so a cancelled
// (draft) certificate cannot be marked signed.
export async function recordCocSigned(
  cocId: string,
  signedDocumentId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }
  if (!isUuid(cocId)) return { error: 'COC not found' }
  if (!isUuid(signedDocumentId)) return { error: 'Signed document not found' }

  const [coc] = await db
    .select({
      id: certificatesOfCompletion.id,
      project_id: certificatesOfCompletion.project_id,
      status: certificatesOfCompletion.status,
    })
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.id, cocId),
        eq(certificatesOfCompletion.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!coc) return { error: 'COC not found' }
  if (coc.status === 'signed') return {} // idempotent
  if (coc.status !== 'pending_signature') return { error: COC_NOT_PENDING_ERROR }

  // The signed file must be one of this certificate's project documents: it is
  // the evidence behind the billing milestone.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, signedDocumentId),
        eq(documents.tenant_id, profile.tenantId),
        eq(documents.project_id, coc.project_id)
      )
    )
    .limit(1)
  if (!doc) return { error: 'Signed document not found' }

  const signedAt = new Date()
  const warrantyEndsAt = new Date(signedAt.getTime() + DEFAULT_WARRANTY_DAYS * 86_400_000)

  const recorded = await db.transaction(async (tx) => {
    const locked = await lockCocInStatus(tx, profile.tenantId, coc.id, 'pending_signature')
    if (!locked) return false

    await moveCocFromStatus(tx, profile.tenantId, coc.id, 'pending_signature', {
      status: 'signed',
      signed_document_id: signedDocumentId,
      signed_at: signedAt,
      warranty_period_starts_at: signedAt,
      warranty_period_ends_at: warrantyEndsAt,
    })
    // A signed certificate must not be signed again through a link still out.
    await revokeOpenSigningSessions(tx, profile.tenantId, 'coc', coc.id)
    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'certificate_of_completion',
      entityId: coc.id,
      action: 'approve',
      diff: {
        status: { before: 'pending_signature', after: 'signed' },
        signed_at: signedAt.toISOString(),
        warranty_window_days: DEFAULT_WARRANTY_DAYS,
      },
    })
    return true
  })
  if (!recorded) return { error: COC_NOT_PENDING_ERROR }

  // Hand off to CX so M7 (warranty + customer onboarding) can begin.
  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['cx'],
    subject: 'COC signed — start customer onboarding',
    body: `Warranty window: ${signedAt.toLocaleDateString('en-PH')} → ${warrantyEndsAt.toLocaleDateString('en-PH')}`,
    linkUrl: `/projects/${coc.project_id}/coc`,
  })

  revalidatePath(`/projects/${coc.project_id}/coc`)
  return {}
}
