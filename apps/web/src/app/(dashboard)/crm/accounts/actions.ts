'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  contacts,
  accountKycArtifacts,
  documents,
  users as usersTable,
} from '@third-code-erp/database/schema'
import {
  createAccountSchema,
  reviewKycSchema,
  addKycArtifactSchema,
  type KycArtifactType,
} from '@third-code-erp/shared-types'
import { writeAuditLog } from '@/lib/audit'

function guard(role: AppRole, capability: ErpCapability) {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"` as const
  }
  return null
}

// REFACTOR.md M1 US-001 — Create Account with KYC.
// The form collects core fields; KYC artifacts are uploaded separately
// (via addKycArtifact) so the upload flow can use the existing 3-step
// signed-URL pipeline.
export async function createAccount(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'account.create')
  if (forbid) return { error: forbid }

  const parsed = createAccountSchema.safeParse({
    name: formData.get('name'),
    industry: formData.get('industry') || undefined,
    billing_address: formData.get('billing_address') || undefined,
    primary_email: formData.get('primary_email') || undefined,
    primary_phone: formData.get('primary_phone') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  // Duplicate detection (US-001 #4) — match on exact name (tenant-scoped).
  // Email-domain matching would be ideal but requires email parsing; the
  // unique index on (tenant_id, name) is the hard guard.
  const [dupe] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tenant_id, profile.tenantId), eq(accounts.name, input.name)))
    .limit(1)
  if (dupe) return { error: `An account named "${input.name}" already exists.` }

  const [created] = await db
    .insert(accounts)
    .values({
      tenant_id: profile.tenantId,
      name: input.name,
      industry: input.industry,
      billing_address: input.billing_address,
      primary_email: input.primary_email,
      primary_phone: input.primary_phone,
      kyc_status: 'pending',
      created_by: profile.user.id,
    })
    .returning({ id: accounts.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'account',
    entityId: created!.id,
    action: 'create',
    diff: { name: input.name, industry: input.industry, kyc_status: 'pending' },
  })

  revalidatePath('/crm/accounts')
  revalidatePath('/crm/kyc-queue')
  redirect(`/crm/accounts/${created!.id}`)
}

// REFACTOR.md M1 US-003 — Finance reviews KYC and stamps the decision.
export async function reviewKyc(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'account.kyc_review')
  if (forbid) return { error: forbid }

  const parsed = reviewKycSchema.safeParse({
    account_id: formData.get('account_id'),
    decision: formData.get('decision'),
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  // Verify tenant ownership before updating.
  const [existing] = await db
    .select({
      id: accounts.id,
      kyc_status: accounts.kyc_status,
      name: accounts.name,
    })
    .from(accounts)
    .where(and(eq(accounts.id, input.account_id), eq(accounts.tenant_id, profile.tenantId)))
    .limit(1)
  if (!existing) return { error: 'Account not found' }

  const before = existing.kyc_status
  const decisionMap = {
    approved: 'approved' as const,
    flagged: 'flagged' as const,
    rejected: 'rejected' as const,
  }

  await db
    .update(accounts)
    .set({
      kyc_status: decisionMap[input.decision],
      kyc_notes: input.notes,
      kyc_decided_at: new Date(),
      kyc_decided_by: profile.user.id,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(accounts.id, input.account_id),
        eq(accounts.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'account',
    entityId: input.account_id,
    action: input.decision === 'approved' ? 'approve' : 'status_change',
    diff: {
      kyc_status: { before, after: decisionMap[input.decision] },
      notes: input.notes ?? null,
    },
  })

  revalidatePath('/crm/kyc-queue')
  revalidatePath(`/crm/accounts/${input.account_id}`)
  return {}
}

// Attach an uploaded document as a KYC artifact (AFS×3, BIR 2303, etc.).
export async function addKycArtifact(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'account.create')
  if (forbid) return { error: forbid }

  const parsed = addKycArtifactSchema.safeParse({
    account_id: formData.get('account_id'),
    artifact_type: formData.get('artifact_type'),
    document_id: formData.get('document_id') || undefined,
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.account_id), eq(accounts.tenant_id, profile.tenantId)))
    .limit(1)
  if (!account) return { error: 'Account not found' }

  if (input.document_id) {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, input.document_id), eq(documents.tenant_id, profile.tenantId)))
      .limit(1)
    if (!doc) return { error: 'Document not found' }
  }

  const [created] = await db
    .insert(accountKycArtifacts)
    .values({
      tenant_id: profile.tenantId,
      account_id: input.account_id,
      artifact_type: input.artifact_type,
      document_id: input.document_id,
      notes: input.notes,
      uploaded_by: profile.user.id,
    })
    .returning({ id: accountKycArtifacts.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'account_kyc_artifact',
    entityId: created!.id,
    action: 'create',
    diff: { artifact_type: input.artifact_type, account_id: input.account_id },
  })

  revalidatePath(`/crm/accounts/${input.account_id}`)
  return {}
}
