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
//   5. Core commits the transition receipt; this adapter revalidates and
//      notifies the right role bucket.

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import {
  claimDocumentAttachCommandSchema,
  claimInvoiceAmountMismatch,
  claimTransitionPayload,
  projectDocumentListQuerySchema,
  type ProjectDocumentListResult,
  type ClaimTransitionCommand,
} from '@third-code-erp/shared-types'
import { db } from '@third-code-erp/database'
import { invoices, progressClaims } from '@third-code-erp/database/schema'
import { notifyRoles } from '@/lib/operations/notifications'
import {
  attachClaimDocumentThroughCoreApi,
  getProjectDocumentsThroughCoreApi,
} from '@/lib/erp-core-client'
import { transitionClaimThroughCoreApi } from '@/lib/claim-transition-core-client'

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

export type ClaimTransitionActionResult = {
  error?: string
  outcome?: 'rejected' | 'unknown'
  changed?: boolean
}

function requestId(input: string | undefined): string {
  const parsed = z.string().guid().safeParse(input)
  return (parsed.success ? parsed.data : randomUUID()).toLowerCase()
}

async function executeCoreTransition(
  profile: Awaited<ReturnType<typeof requireUserProfile>>,
  claim: NonNullable<Awaited<ReturnType<typeof loadClaim>>>,
  command: ClaimTransitionCommand,
  expectedToStatus: ClaimStatus,
): Promise<ClaimTransitionActionResult> {
  const result = await transitionClaimThroughCoreApi(claim.id, command)
  if (!result.ok) {
    return {
      error: result.error,
      outcome: result.outcomeUnknown ? 'unknown' : 'rejected',
    }
  }
  const receipt = result.data.receipt
  const expectedHash = createHash('sha256').update(claimTransitionPayload(claim.id, command)).digest('hex')
  if (
    result.data.claimId !== claim.id ||
    receipt.claimId !== claim.id ||
    receipt.projectId !== claim.project_id ||
    receipt.tenantId !== profile.tenantId ||
    receipt.actorId !== profile.user.id ||
    receipt.clientRequestId !== command.clientRequestId ||
    receipt.payloadHash !== expectedHash ||
    receipt.toStatus !== expectedToStatus ||
    (result.data.changed && receipt.fromStatus !== claim.status)
  ) {
    return {
      error: 'ERP Core API returned an invalid claim transition result.',
      outcome: 'unknown',
    }
  }
  return { changed: result.data.changed }
}

// ─────────────────────────────────────────────────────────────────────
// submitClaim: draft → submitted
// ─────────────────────────────────────────────────────────────────────

export async function submitClaim(
  claimId: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
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
  const transition = await executeCoreTransition(
    profile,
    claim,
    { action: 'submit', clientRequestId: requestId(clientRequestId) },
    'submitted',
  )
  if (transition.error) return transition

  if (transition.changed !== false) {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['commercial'],
      subject: `Progress claim ${claim.claim_number} submitted for review`,
      body: `Milestone ${claim.milestone_pct}% · ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}`,
      linkUrl: `/claims/${claimId}`,
    })
  }

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// markCertificatePending: submitted → certificate_pending
// ─────────────────────────────────────────────────────────────────────

export async function markCertificatePending(
  claimId: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, COMMERCIAL_ROLES)) {
    return {
      error: `Forbidden: only Commercial can mark a claim as awaiting certificate`,
    }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  const transition = await executeCoreTransition(
    profile,
    claim,
    { action: 'certificate_pending', clientRequestId: requestId(clientRequestId) },
    'certificate_pending',
  )
  if (transition.error) return transition

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// recordCertification: submitted | certificate_pending → certified
// ─────────────────────────────────────────────────────────────────────

export async function recordCertification(
  claimId: string,
  certificateDocumentId: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, COMMERCIAL_ROLES)) {
    return {
      error: `Forbidden: only Commercial can certify a progress claim`,
    }
  }

  const docIdResult = z.string().guid().safeParse(certificateDocumentId)
  if (!docIdResult.success) {
    return { error: 'certificate_document_id must be a UUID' }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  const transition = await executeCoreTransition(
    profile,
    claim,
    {
      action: 'certify',
      clientRequestId: requestId(clientRequestId),
      certificateDocumentId,
    },
    'certified',
  )
  if (transition.error) return transition

  if (transition.changed !== false) {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['finance'],
      subject: `Progress claim ${claim.claim_number} certified`,
      body: `Ready for handover to Finance. ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}.`,
      linkUrl: `/claims/${claimId}`,
    })
  }

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// handoverToFinance: certified → handed_over_finance
// ─────────────────────────────────────────────────────────────────────

export async function handoverToFinance(
  claimId: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, COMMERCIAL_ROLES)) {
    return {
      error: `Forbidden: only Commercial can hand over a claim to Finance`,
    }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  const transition = await executeCoreTransition(
    profile,
    claim,
    { action: 'handover', clientRequestId: requestId(clientRequestId) },
    'handed_over_finance',
  )
  if (transition.error) return transition

  if (transition.changed !== false) {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['finance'],
      subject: `Progress claim ${claim.claim_number} handed over for invoicing`,
      body: `Issue the sales invoice for ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}.`,
      linkUrl: `/claims/${claimId}`,
    })
  }

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// linkInvoice: handed_over_finance → invoiced
// ─────────────────────────────────────────────────────────────────────

export async function linkInvoice(
  claimId: string,
  invoiceId: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, FINANCE_ROLES)) {
    return { error: `Forbidden: only Finance can link an invoice to a claim` }
  }

  const invoiceIdResult = z.string().guid().safeParse(invoiceId)
  if (!invoiceIdResult.success) return { error: 'invoice_id must be a UUID' }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }

  // The claim amount and the invoice subtotal must agree before they are tied
  // together; Core checks the invoice status, reversal and one-claim-per-invoice.
  const [invoice] = await db
    .select({ subtotal_cents: invoices.subtotal_cents })
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceIdResult.data),
        eq(invoices.tenant_id, profile.tenantId),
        eq(invoices.project_id, claim.project_id)
      )
    )
    .limit(1)
  if (!invoice) return { error: 'Invoice not found in the claim project', outcome: 'rejected' }
  const mismatch = claimInvoiceAmountMismatch(claim.amount_cents, invoice.subtotal_cents)
  if (mismatch) return { error: mismatch, outcome: 'rejected' }

  const transition = await executeCoreTransition(
    profile,
    claim,
    {
      action: 'link_invoice',
      clientRequestId: requestId(clientRequestId),
      invoiceId,
    },
    'invoiced',
  )
  if (transition.error) return transition

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// recordPayment: invoiced → paid
// ─────────────────────────────────────────────────────────────────────

export async function recordPayment(
  claimId: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (!hasAnyRole(profile.role, FINANCE_ROLES)) {
    return { error: `Forbidden: only Finance can record a claim payment` }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  const transition = await executeCoreTransition(
    profile,
    claim,
    { action: 'record_payment', clientRequestId: requestId(clientRequestId) },
    'paid',
  )
  if (transition.error) return transition

  if (transition.changed !== false) {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['admin', 'owner', 'sales'],
      subject: `Progress claim ${claim.claim_number} paid`,
      body: `Payment recorded for ₱${(claim.amount_cents / 100).toLocaleString('en-PH')}.`,
      linkUrl: `/claims/${claimId}`,
    })
  }

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// rejectClaim: any non-terminal status → rejected
// ─────────────────────────────────────────────────────────────────────

export async function rejectClaim(
  claimId: string,
  reason: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (
    !hasAnyCapability(profile.role, [
      'po.create',
      'precon.manage_checklist',
      'finance.issue_invoice',
    ])
  ) {
    return {
      error: `Forbidden: role "${profile.role}" cannot reject progress claims`,
    }
  }

  const reasonResult = z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(2000)
    .safeParse(reason)
  if (!reasonResult.success) {
    return { error: reasonResult.error.issues[0]?.message ?? 'Invalid reason' }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  const transition = await executeCoreTransition(
    profile,
    claim,
    { action: 'reject', clientRequestId: requestId(clientRequestId), reason: reasonResult.data },
    'rejected',
  )
  if (transition.error) return transition

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// cancelClaim: draft → cancelled
// ─────────────────────────────────────────────────────────────────────

export async function cancelClaim(
  claimId: string,
  reason: string,
  clientRequestId?: string,
): Promise<ClaimTransitionActionResult> {
  const profile = await requireUserProfile()

  if (
    !hasAnyCapability(profile.role, [
      'po.create',
      'precon.manage_checklist',
      'finance.issue_invoice',
    ])
  ) {
    return {
      error: `Forbidden: role "${profile.role}" cannot cancel progress claims`,
    }
  }

  const reasonResult = z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(2000)
    .safeParse(reason)
  if (!reasonResult.success) {
    return { error: reasonResult.error.issues[0]?.message ?? 'Invalid reason' }
  }

  const claim = await loadClaim(claimId, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }
  const transition = await executeCoreTransition(
    profile,
    claim,
    { action: 'cancel', clientRequestId: requestId(clientRequestId), reason: reasonResult.data },
    'cancelled',
  )
  if (transition.error) return transition

  revalidateClaim(claimId)
  return {}
}

// ─────────────────────────────────────────────────────────────────────
// attachClaimDocument: Core-owned append with idempotent request identity
// ─────────────────────────────────────────────────────────────────────

export type ClaimDocumentAttachActionResult = {
  error?: string
  success?: string
  changed?: boolean
  outcome?: 'rejected' | 'unknown'
}

export async function attachClaimDocument(
  claimId: string,
  command: unknown,
): Promise<ClaimDocumentAttachActionResult> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'document.manage')) {
    return {
      error: `Forbidden: role "${profile.role}" lacks document.manage`,
    }
  }

  const parsedClaimId = z
    .string()
    .guid('claimId must be a UUID')
    .transform((value) => value.toLowerCase())
    .safeParse(claimId)
  const parsedCommand = claimDocumentAttachCommandSchema.safeParse(command)
  if (!parsedClaimId.success) {
    const first = parsedClaimId.error.issues[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  if (!parsedCommand.success) {
    const first = parsedCommand.error.issues[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }

  const claim = await loadClaim(parsedClaimId.data, profile.tenantId)
  if (!claim) return { error: 'Progress claim not found' }

  const result = await attachClaimDocumentThroughCoreApi(
    parsedClaimId.data,
    parsedCommand.data,
  )
  if (!result.ok) {
    return {
      error: result.error ?? 'Document attachment was not committed.',
      outcome: result.status !== undefined && result.status >= 500 ? 'unknown' : 'rejected',
    }
  }
  if (!result.data) {
    return {
      error: 'ERP Core API returned no attachment result.',
      outcome: 'unknown',
    }
  }

  if (
    result.data.attachmentId !== parsedCommand.data.clientRequestId ||
    result.data.tenantId !== profile.tenantId ||
    result.data.projectId !== claim.project_id ||
    result.data.claimId !== parsedClaimId.data ||
    result.data.documentId !== parsedCommand.data.documentId
  ) {
    return {
      error: 'ERP Core API returned an invalid claim document result.',
      outcome: 'unknown',
    }
  }

  revalidateClaim(parsedClaimId.data)
  return {
    success: result.data.changed ? 'Document attached.' : 'Document already attached.',
    changed: result.data.changed,
  }
}

export async function listClaimDocuments(
  claimId: string,
  query: unknown = {},
): Promise<
  | { ok: true; data: ProjectDocumentListResult }
  | { ok: false; error: string }
> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'document.manage')) {
    return {
      ok: false,
      error: `Forbidden: role "${profile.role}" lacks document.manage permission`,
    }
  }

  const parsedClaimId = z
    .string()
    .guid('claimId must be a UUID')
    .transform((value) => value.toLowerCase())
    .safeParse(claimId)
  const parsedQuery = projectDocumentListQuerySchema.safeParse(query)
  if (!parsedClaimId.success || !parsedQuery.success) {
    return { ok: false, error: 'Invalid project document request.' }
  }

  const claim = await loadClaim(parsedClaimId.data, profile.tenantId)
  if (!claim) return { ok: false, error: 'Progress claim not found' }

  const result = await getProjectDocumentsThroughCoreApi(
    claim.project_id,
    parsedQuery.data,
  )
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Project documents were not loaded.' }
  }
  if (!result.data) {
    return { ok: false, error: 'ERP Core API returned no project document list.' }
  }
  if (result.data.projectId !== claim.project_id) {
    return { ok: false, error: 'ERP Core API returned an invalid project document scope.' }
  }
  return { ok: true, data: result.data }
}
