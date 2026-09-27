'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
} from '@third-code-erp/database/schema'
import {
  createAccountSchema,
  reviewKycSchema,
  accountKycDocumentQuerySchema,
  kycArtifactCreateCommandSchema,
  type AccountKycDocumentResult,
} from '@third-code-erp/shared-types'
import { stampActorInTransaction, writeAuditLogInTransaction } from '@/lib/audit'
import {
  createKycArtifactThroughCoreApi,
  getAccountKycDocumentsThroughCoreApi,
} from '@/lib/erp-core-client'
import { z } from 'zod'

function guard(role: AppRole, capability: ErpCapability) {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"` as const
  }
  return null
}

type AccountAction = 'account.create' | 'account.kyc_review'

function logAccountAction(input: {
  traceId: string
  tenantId: string | null
  actorId: string | null
  action: AccountAction
  outcome: string
}): void {
  console.info(JSON.stringify({
    trace_id: input.traceId,
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: input.action,
    outcome: input.outcome,
  }))
}

async function requireAccountProfile(traceId: string, action: AccountAction) {
  try {
    return await requireUserProfile()
  } catch (error) {
    logAccountAction({ traceId, tenantId: null, actorId: null, action, outcome: 'profile_unavailable' })
    throw error
  }
}

// REFACTOR.md M1 US-001 — Create Account with KYC.
// The form collects core fields; KYC artifacts are uploaded separately
// (via addKycArtifact) so the upload flow can use the existing 3-step
// signed-URL pipeline.
export async function createAccount(formData: FormData): Promise<{ error?: string }> {
  const traceId = randomUUID()
  const action = 'account.create' as const
  const profile = await requireAccountProfile(traceId, action)
  const log = (outcome: string) => logAccountAction({ traceId, tenantId: profile.tenantId, actorId: profile.user.id, action, outcome })
  const forbid = guard(profile.role, 'account.create')
  if (forbid) {
    log('forbidden')
    return { error: forbid }
  }

  const parsed = createAccountSchema.safeParse({
    name: formData.get('name'),
    industry: formData.get('industry') || undefined,
    billing_address: formData.get('billing_address') || undefined,
    primary_email: formData.get('primary_email') || undefined,
    primary_phone: formData.get('primary_phone') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    log('validation_error')
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  let createdId: string | null
  try {
    createdId = await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      // Keep the duplicate check and audit append in the same transaction as
      // the insert. The database unique index remains the race guard.
      const [dupe] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.tenant_id, profile.tenantId), eq(accounts.name, input.name)))
        .limit(1)
      if (dupe) return null

      const [created] = await tx
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
      if (!created) throw new Error('Account insert returned no row')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'account',
        entityId: created.id,
        action: 'create',
        diff: { name: input.name, industry: input.industry, kyc_status: 'pending' },
      })
      return created.id
    })
  } catch {
    log('unknown')
    return { error: 'Account creation could not be confirmed. Refresh the account list before retrying.' }
  }
  if (!createdId) {
    log('duplicate')
    return { error: `An account named "${input.name}" already exists.` }
  }

  log('success')
  revalidatePath('/crm/accounts')
  revalidatePath('/crm/kyc-queue')
  redirect(`/crm/accounts/${createdId}`)
}

// REFACTOR.md M1 US-003 — Finance reviews KYC and stamps the decision.
export async function reviewKyc(formData: FormData): Promise<{ error?: string }> {
  const traceId = randomUUID()
  const action = 'account.kyc_review' as const
  const profile = await requireAccountProfile(traceId, action)
  const log = (outcome: string) => logAccountAction({ traceId, tenantId: profile.tenantId, actorId: profile.user.id, action, outcome })
  const forbid = guard(profile.role, 'account.kyc_review')
  if (forbid) {
    log('forbidden')
    return { error: forbid }
  }

  const parsed = reviewKycSchema.safeParse({
    account_id: formData.get('account_id'),
    decision: formData.get('decision'),
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    log('validation_error')
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  const decisionMap = {
    approved: 'approved' as const,
    flagged: 'flagged' as const,
    rejected: 'rejected' as const,
  }

  let found: boolean
  try {
    found = await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [existing] = await tx
        .select({ id: accounts.id, kyc_status: accounts.kyc_status, kyc_notes: accounts.kyc_notes })
        .from(accounts)
        .where(and(eq(accounts.id, input.account_id), eq(accounts.tenant_id, profile.tenantId)))
        .limit(1)
        .for('update')
      if (!existing) return false
      const notes = input.notes ?? existing.kyc_notes
      if (existing.kyc_status === decisionMap[input.decision] && existing.kyc_notes === notes) {
        return true
      }

      const [updated] = await tx
        .update(accounts)
        .set({
          kyc_status: decisionMap[input.decision],
          kyc_notes: notes,
          kyc_decided_at: new Date(),
          kyc_decided_by: profile.user.id,
          updated_at: new Date(),
        })
        .where(and(eq(accounts.id, input.account_id), eq(accounts.tenant_id, profile.tenantId)))
        .returning({ id: accounts.id })
      if (!updated) throw new Error('Account changed before KYC review was committed')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'account',
        entityId: input.account_id,
        action: input.decision === 'approved' ? 'approve' : 'status_change',
        diff: {
          kyc_status: { before: existing.kyc_status, after: decisionMap[input.decision] },
          notes,
        },
      })
      return true
    })
  } catch {
    log('unknown')
    return { error: 'KYC review could not be confirmed. Refresh the account before retrying.' }
  }
  if (!found) {
    log('not_found')
    return { error: 'Account not found' }
  }

  log('success')
  revalidatePath('/crm/kyc-queue')
  revalidatePath(`/crm/accounts/${input.account_id}`)
  return {}
}

export type KycArtifactActionResult = {
  error?: string
  success?: string
  changed?: boolean
  outcome?: 'rejected' | 'unknown'
}

// Attach an existing account-eligible document as a KYC artifact through Core.
// The Web action intentionally has no legacy database fallback: Core owns the
// relationship, tenant, idempotency and audit checks.
export async function addKycArtifact(
  accountId: unknown,
  command: unknown,
): Promise<KycArtifactActionResult> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'account.create')
  if (forbid) return { error: forbid }

  const parsedAccountId = z
    .string()
    .uuid('accountId must be a UUID')
    .transform((value) => value.toLowerCase())
    .safeParse(accountId)
  const parsedCommand = kycArtifactCreateCommandSchema.safeParse(command)
  if (!parsedAccountId.success) {
    const first = parsedAccountId.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  if (!parsedCommand.success) {
    const first = parsedCommand.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }

  const normalizedAccountId = parsedAccountId.data
  const normalizedCommand = parsedCommand.data
  const result = await createKycArtifactThroughCoreApi(
    normalizedAccountId,
    normalizedCommand,
  )
  if (!result.ok) {
    return {
      error: result.error ?? 'KYC artifact was not committed.',
      outcome:
        result.status !== undefined && result.status < 500
          ? 'rejected'
          : 'unknown',
    }
  }
  if (!result.data) {
    return {
      error: 'ERP Core API returned no KYC artifact result.',
      outcome: 'unknown',
    }
  }

  const sameScope =
    result.data.artifactId === normalizedCommand.clientRequestId &&
    result.data.accountId === normalizedAccountId &&
    result.data.tenantId.toLowerCase() === profile.tenantId.toLowerCase() &&
    result.data.documentId === normalizedCommand.documentId
  if (!sameScope) {
    return {
      error: 'ERP Core API returned an invalid KYC artifact result.',
      outcome: 'unknown',
    }
  }

  revalidatePath(`/crm/accounts/${normalizedAccountId}`)
  return {
    success: result.data.changed
      ? 'KYC artifact added.'
      : 'KYC artifact already exists.',
    changed: result.data.changed,
  }
}

export async function listAccountKycDocuments(
  accountId: unknown,
  query: unknown = {},
): Promise<
  | { ok: true; data: AccountKycDocumentResult }
  | { ok: false; error: string }
> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'account.create')
  if (forbid) return { ok: false, error: forbid }

  const parsedAccountId = z
    .string()
    .uuid('accountId must be a UUID')
    .transform((value) => value.toLowerCase())
    .safeParse(accountId)
  const parsedQuery = accountKycDocumentQuerySchema.safeParse(query)
  if (!parsedAccountId.success || !parsedQuery.success) {
    return { ok: false, error: 'Invalid KYC document request.' }
  }

  const result = await getAccountKycDocumentsThroughCoreApi(
    parsedAccountId.data,
    parsedQuery.data,
  )
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'Account documents were not loaded.',
    }
  }
  if (!result.data) {
    return { ok: false, error: 'ERP Core API returned no account documents.' }
  }

  const expectedAccountId = parsedAccountId.data
  const expectedTenantId = profile.tenantId.toLowerCase()
  const scopedRows = result.data.rows.every(
    (row) =>
      row.accountId === expectedAccountId &&
      row.tenantId.toLowerCase() === expectedTenantId,
  )
  const selected = result.data.selectedDocument
  const selectedIsScoped =
    selected === null ||
    (selected.accountId === expectedAccountId &&
      selected.tenantId.toLowerCase() === expectedTenantId)
  const selectedMatchesQuery = parsedQuery.data.selectedDocumentId
    ? selected === null ||
      selected?.documentId === parsedQuery.data.selectedDocumentId
    : selected === null
  if (
    result.data.accountId !== expectedAccountId ||
    result.data.tenantId.toLowerCase() !== expectedTenantId ||
    result.data.page !== parsedQuery.data.page ||
    result.data.limit !== parsedQuery.data.limit ||
    result.data.rows.length > parsedQuery.data.limit ||
    !scopedRows ||
    !selectedIsScoped ||
    !selectedMatchesQuery
  ) {
    return {
      ok: false,
      error: 'ERP Core API returned an invalid account document scope.',
    }
  }
  return { ok: true, data: result.data }
}
