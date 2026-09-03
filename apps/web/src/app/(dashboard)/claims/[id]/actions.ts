'use server'

// REFACTOR.md M5 — Progress Claim state-transition actions (Track 3).
//
// The list/create flow at /claims is owned by Track 2. This module owns
// every mutation on a single claim:
//   draft → submitted → certificate_pending → certified →
//   handed_over_finance → invoiced → paid
// plus rejection / cancellation side-paths.
//
// All actions follow the same contract:
//   1. requireUserProfile() to bind tenant + actor.
//   2. Verify the claim belongs to this tenant before touching it.
//   3. Capability check (when one applies).
//   4. Enforce the allowed state transition server-side — never trust
//      whatever status the client thinks should come next.
//   5. writeAuditLog + revalidatePath. Notify the right role bucket.

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
  progressClaims,
  progressClaimDocuments,
  documents,
  invoices,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'certificate_pending'
  | 'certified'
  | 'handed_over_finance'
  | 'invoiced'
  | 'paid'
  | 'rejected'
  | 'cancelled'

const COMMERCIAL_ROLES: AppRole[] = ['admin', 'owner', 'commercial']
const FINANCE_ROLES: AppRole[] = ['admin', 'owner', 'finance']

function hasAnyCapability(role: AppRole, caps: ErpCapability[]): boolean {
  return caps.some((c) => can(role, c))
}

function hasAnyRole(role: AppRole, allowed: AppRole[]): boolean {
  return allowed.includes(role)
}

const DOCUMENT_KINDS = ['photo', 'certificate', 'measurement', 'other'] as const

const attachSchema = z.object({
  document_id: z.string().uuid('document_id must be a UUID'),
  kind: z.enum(DOCUMENT_KINDS),
  caption: z.string().max(255).optional(),
})

function revalidateClaim(claimId: string): void {
  revalidatePath('/claims')
  revalidatePath(`/claims/${claimId}`)
}

async function loadClaim(claimId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(progressClaims)
    .where(
      and(eq(progressClaims.id, claimId), eq(progressClaims.tenant_id, tenantId))
    )
    .limit(1)
  return row ?? null
}

// ─────────────────────────────────────────────────────────────────────
// submitClaim: draft → submitted
// ─────────────────────────────────────────────────────────────────────

export async function submitClaim(claimId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (
    !hasAnyCapability(profile.role, ['precon.manage_checklist', 'po.create'])
  ) {
    return {
      error: `Forbidden: role "${profile.role}" cannot submit progress claims`,
    }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'draft') {
    return { error: `Cannot submit a claim in status "${claim.status}"` }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({
      status: 'submitted',
      submitted_at: now,
      submitted_by: profile.user.id,
      updated_at: now,
    })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: { from: 'draft', to: 'submitted' },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['commercial'],
    subject: `Progress claim ${claim.claim_number} submitted for review`,
    body: `Milestone ${claim.milestone_pct}% · ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}`,
    linkUrl: `/claims/${claimId}`,
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// markCertificatePending: submitted → certificate_pending
// ─────────────────────────────────────────────────────────────────────

export async function markCertificatePending(
  claimId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, COMMERCIAL_ROLES)) {
    return {
      error: `Forbidden: only Commercial can mark a claim as awaiting certificate`,
    }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'submitted') {
    return {
      error: `Cannot mark certificate pending from status "${claim.status}"`,
    }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({ status: 'certificate_pending', updated_at: now })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: { from: 'submitted', to: 'certificate_pending' },
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// recordCertification: submitted | certificate_pending → certified
// ─────────────────────────────────────────────────────────────────────

export async function recordCertification(
  claimId: string,
  certificateDocumentId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, COMMERCIAL_ROLES)) {
    return {
      error: `Forbidden: only Commercial can certify a progress claim`,
    }
  }

  const docIdResult = z.string().uuid().safeParse(certificateDocumentId)
  if (!docIdResult.success) {
    return { error: 'certificate_document_id must be a UUID' }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'submitted' && claim.status !== 'certificate_pending') {
    return { error: `Cannot certify a claim in status "${claim.status}"` }
  }

  // Verify certificate document belongs to the same tenant before linking.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, certificateDocumentId),
        eq(documents.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!doc) return { error: 'Certificate document not found in this tenant' }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({
      status: 'certified',
      certified_at: now,
      certified_by: profile.user.id,
      certificate_document_id: certificateDocumentId,
      updated_at: now,
    })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: {
      from: claim.status,
      to: 'certified',
      certificate_document_id: certificateDocumentId,
    },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['finance'],
    subject: `Progress claim ${claim.claim_number} certified`,
    body: `Ready for handover to Finance. ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}.`,
    linkUrl: `/claims/${claimId}`,
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// handoverToFinance: certified → handed_over_finance
// ─────────────────────────────────────────────────────────────────────

export async function handoverToFinance(
  claimId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, COMMERCIAL_ROLES)) {
    return {
      error: `Forbidden: only Commercial can hand over a claim to Finance`,
    }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'certified') {
    return { error: `Cannot handover a claim in status "${claim.status}"` }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({
      status: 'handed_over_finance',
      handed_over_to_finance_at: now,
      handed_over_to_finance_by: profile.user.id,
      updated_at: now,
    })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: { from: 'certified', to: 'handed_over_finance' },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['finance'],
    subject: `Progress claim ${claim.claim_number} handed over for invoicing`,
    body: `Issue the sales invoice for ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}.`,
    linkUrl: `/claims/${claimId}`,
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// linkInvoice: handed_over_finance → invoiced
// ─────────────────────────────────────────────────────────────────────

export async function linkInvoice(
  claimId: string,
  invoiceId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, FINANCE_ROLES)) {
    return { error: `Forbidden: only Finance can link an invoice to a claim` }
  }

  const invoiceIdResult = z.string().uuid().safeParse(invoiceId)
  if (!invoiceIdResult.success) return { error: 'invoice_id must be a UUID' }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'handed_over_finance') {
    return {
      error: `Cannot link invoice from status "${claim.status}"`,
    }
  }

  const [invoice] = await db
    .select({
      id: invoices.id,
      project_id: invoices.project_id,
      invoice_number: invoices.invoice_number,
    })
    .from(invoices)
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!invoice) return { error: 'Invoice not found in this tenant' }
  if (invoice.project_id !== claim.project_id) {
    return { error: 'Invoice belongs to a different project than the claim' }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({
      status: 'invoiced',
      invoice_id: invoiceId,
      updated_at: now,
    })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: {
      from: 'handed_over_finance',
      to: 'invoiced',
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
    },
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// recordPayment: invoiced → paid
// ─────────────────────────────────────────────────────────────────────

export async function recordPayment(
  claimId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, FINANCE_ROLES)) {
    return { error: `Forbidden: only Finance can record a claim payment` }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'invoiced') {
    return { error: `Cannot record payment from status "${claim.status}"` }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({ status: 'paid', paid_at: now, updated_at: now })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: { from: 'invoiced', to: 'paid', paid_at: now.toISOString() },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['admin', 'owner', 'sales'],
    subject: `Progress claim ${claim.claim_number} paid`,
    body: `Payment recorded for ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}.`,
    linkUrl: `/claims/${claimId}`,
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// rejectClaim: any non-terminal status → rejected
// ─────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: ClaimStatus[] = ['paid', 'rejected', 'cancelled']

export async function rejectClaim(
  claimId: string,
  reason: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  const reasonResult = z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(2000)
    .safeParse(reason)
  if (!reasonResult.success) {
    return { error: reasonResult.error.errors[0]?.message ?? 'Invalid reason' }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (TERMINAL_STATUSES.includes(claim.status as ClaimStatus)) {
    return { error: `Cannot reject a claim in terminal status "${claim.status}"` }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({
      status: 'rejected',
      rejected_at: now,
      rejected_reason: reasonResult.data,
      updated_at: now,
    })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: { from: claim.status, to: 'rejected', reason: reasonResult.data },
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// cancelClaim: draft → cancelled
// ─────────────────────────────────────────────────────────────────────

export async function cancelClaim(
  claimId: string,
  reason: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  const reasonResult = z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(2000)
    .safeParse(reason)
  if (!reasonResult.success) {
    return { error: reasonResult.error.errors[0]?.message ?? 'Invalid reason' }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  if (claim.status !== 'draft') {
    return { error: `Only draft claims can be cancelled (was "${claim.status}")` }
  }

  const now = new Date()
  await db
    .update(progressClaims)
    .set({
      status: 'cancelled',
      rejected_reason: reasonResult.data,
      updated_at: now,
    })
    .where(
      and(
        eq(progressClaims.id, claimId),
        eq(progressClaims.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: claimId,
    action: 'status_change',
    diff: { from: 'draft', to: 'cancelled', reason: reasonResult.data },
  })

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// attachClaimDocument: insert a row in progress_claim_documents
// ─────────────────────────────────────────────────────────────────────

export async function attachClaimDocument(
  claimId: string,
  documentId: string,
  kind: 'photo' | 'certificate' | 'measurement' | 'other',
  caption?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'document.manage')) {
    return {
      error: `Forbidden: role "${profile.role}" lacks document.manage`,
    }
  }

  const parsed = attachSchema.safeParse({
    document_id: documentId,
    kind,
    caption: caption || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  const input = parsed.data

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }

  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(eq(documents.id, input.document_id), eq(documents.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!doc) return { error: 'Document not found in this tenant' }

  const [created] = await db
    .insert(progressClaimDocuments)
    .values({
      tenant_id: profile.tenantId,
      claim_id: claimId,
      document_id: input.document_id,
      kind: input.kind,
      caption: input.caption,
      uploaded_by: profile.user.id,
    })
    .returning({ id: progressClaimDocuments.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim_document',
    entityId: created!.id,
    action: 'create',
    diff: {
      claim_id: claimId,
      document_id: input.document_id,
      kind: input.kind,
    },
  })

  revalidateClaim(claimId)
  return {}
}
