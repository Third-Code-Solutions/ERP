'use server'

// REFACTOR.md M6 US-Post-002 — Certificate of Completion (COC) workflow.
//
// State machine: null → draft → pending_signature → signed.
//   - draftCoc: requires turnover compiled.
//   - sendForSignature: creates a DocuSeal submission, stores submission_id.
//   - recordCocSigned: webhook-driven path; sets signed_at + warranty window
//     and pings CX to start M7 onboarding.

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
  accounts,
  contacts,
  opportunities,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'
import { createSigningSession } from '@/lib/operations/integrations/docuseal'

const DEFAULT_WARRANTY_DAYS = 365

function guard(role: AppRole, capability: ErpCapability): string | null {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"`
  }
  return null
}

export async function draftCoc(
  projectId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: 'Invalid project id' }
  }

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

export async function sendCocForSignature(
  projectId: string
): Promise<{ error?: string; url?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const [coc] = await db
    .select()
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.project_id, projectId),
        eq(certificatesOfCompletion.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!coc) return { error: 'COC not found' }
  if (coc.status !== 'draft') {
    return { error: `COC is in status "${coc.status}", cannot resend` }
  }

  // Resolve the client signatory via the project's primary opportunity → account → primary contact.
  // This is a best-effort lookup; if it fails we fall back to a placeholder
  // so the DocuSeal call still works in dev.
  const [opp] = await db
    .select({ account_id: opportunities.account_id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.project_id, projectId),
        eq(opportunities.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  let signerEmail = 'client@example.com'
  let signerName = 'Client Signatory'
  if (opp?.account_id) {
    const [primary] = await db
      .select({
        full_name: contacts.full_name,
        email: contacts.email,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.account_id, opp.account_id),
          eq(contacts.tenant_id, profile.tenantId),
          eq(contacts.is_primary, true)
        )
      )
      .limit(1)
    if (primary?.email) {
      signerEmail = primary.email
      signerName = primary.full_name ?? signerName
    }
    // Stamp account name into the submission metadata for traceability.
    const [acct] = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, opp.account_id))
      .limit(1)
    if (acct?.name && !primary?.email) signerName = `${acct.name} representative`
  }

  const session = await createSigningSession({
    tenantId: profile.tenantId,
    entityType: 'coc',
    entityId: coc.id,
    signerEmail,
    signerName,
  })

  await db
    .update(certificatesOfCompletion)
    .set({
      status: 'pending_signature',
      docuseal_submission_id:
        session.mechanism === 'docuseal' ? session.token : null,
    })
    .where(eq(certificatesOfCompletion.id, coc.id))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'certificate_of_completion',
    entityId: coc.id,
    action: 'status_change',
    diff: {
      status: { before: 'draft', after: 'pending_signature' },
      signing_url: session.url,
      mechanism: session.mechanism,
      is_dev_stub: session.is_dev_stub,
    },
  })

  revalidatePath(`/projects/${projectId}/coc`)
  return { url: session.url }
}

// Webhook path. The DocuSeal webhook handler (Track 4) calls this once
// the submission is signed. We keep it idempotent: if already signed we
// short-circuit.
export async function recordCocSigned(
  cocId: string,
  signedDocumentId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  // Capability-checked here for the manual "force record" path; the
  // webhook handler should call this with an internal service identity.
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const [coc] = await db
    .select()
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

  // Document must belong to this tenant.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, signedDocumentId), eq(documents.tenant_id, profile.tenantId)))
    .limit(1)
  if (!doc) return { error: 'Signed document not found' }

  const signedAt = new Date()
  const warrantyEndsAt = new Date(signedAt.getTime() + DEFAULT_WARRANTY_DAYS * 86_400_000)

  await db
    .update(certificatesOfCompletion)
    .set({
      status: 'signed',
      signed_document_id: signedDocumentId,
      signed_at: signedAt,
      warranty_period_starts_at: signedAt,
      warranty_period_ends_at: warrantyEndsAt,
    })
    .where(eq(certificatesOfCompletion.id, coc.id))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'certificate_of_completion',
    entityId: coc.id,
    action: 'approve',
    diff: {
      status: { before: coc.status, after: 'signed' },
      signed_at: signedAt.toISOString(),
      warranty_window_days: DEFAULT_WARRANTY_DAYS,
    },
  })

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
