'use server'

// REFACTOR.md M5 — Progress Milestone Claim flow (create-side).
//
// This module owns ONLY the create action so the list page can stay green.
// Submit / certify / handover / invoice / paid transitions live in
// /claims/[id]/actions.ts under Track 3's ownership.

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { progressClaims, projects } from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'

// Either AR-code creators (finance) or pre-con leads (sd_pm_pe / pm /
// commercial) can raise a progress claim. The capability check accepts
// EITHER capability so both flows are reachable.
const ALLOWED_CAPS: ErpCapability[] = ['kyc.create_ar_code', 'precon.manage_checklist']

function guard(role: AppRole): string | null {
  const ok = ALLOWED_CAPS.some((cap) => can(role, cap))
  if (!ok) {
    return `Forbidden: role "${role}" lacks claim-create permission`
  }
  return null
}

const createSchema = z.object({
  project_id: z.string().uuid(),
  milestone_pct: z.coerce.number().int().min(0).max(100),
  amount_cents: z.coerce.number().int().positive(),
  description: z.string().max(5000).optional(),
})

const PAD_WIDTH = 5

function nextClaimNumberFromMax(maxNumber: string | null): string {
  if (!maxNumber) return `PC-${'1'.padStart(PAD_WIDTH, '0')}`
  const numericPart = maxNumber.replace('PC-', '')
  const parsed = Number.parseInt(numericPart, 10)
  const next = Number.isFinite(parsed) ? parsed + 1 : 1
  return `PC-${String(next).padStart(PAD_WIDTH, '0')}`
}

export async function createClaim(
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role)
  if (forbid) return { error: forbid }

  const rawAmount = formData.get('amount_php')
  // Convert the human-entered ₱ amount to cents. We accept either a raw
  // cents value (amount_cents) or a peso value (amount_php) — the form
  // sends peso so we compute cents here.
  const amountCents = (() => {
    if (typeof rawAmount === 'string' && rawAmount.trim().length > 0) {
      const php = Number.parseFloat(rawAmount)
      if (!Number.isFinite(php)) return NaN
      return Math.round(php * 100)
    }
    const direct = formData.get('amount_cents')
    if (typeof direct === 'string' && direct.length > 0) {
      return Number.parseInt(direct, 10)
    }
    return NaN
  })()

  const parsed = createSchema.safeParse({
    project_id: formData.get('project_id'),
    milestone_pct: formData.get('milestone_pct'),
    amount_cents: amountCents,
    description:
      typeof formData.get('description') === 'string' && (formData.get('description') as string).length > 0
        ? formData.get('description')
        : undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  const input = parsed.data

  // Verify project tenancy.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.project_id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  // Sequence is computed per-tenant: max(claim_number) + 1. We rely on the
  // (tenant_id, claim_number) unique index as the integrity guard — if
  // two writers race, the second insert errors out and we retry once.
  const [maxRow] = await db
    .select({
      max_number: sql<string | null>`max(${progressClaims.claim_number})`.as('max_number'),
    })
    .from(progressClaims)
    .where(eq(progressClaims.tenant_id, profile.tenantId))

  let claimNumber = nextClaimNumberFromMax(maxRow?.max_number ?? null)

  let inserted: { id: string } | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await db
        .insert(progressClaims)
        .values({
          tenant_id: profile.tenantId,
          project_id: input.project_id,
          claim_number: claimNumber,
          milestone_pct: input.milestone_pct,
          amount_cents: input.amount_cents,
          description: input.description,
          status: 'draft',
          created_by: profile.user.id,
        })
        .returning({ id: progressClaims.id })
      inserted = result[0]
      break
    } catch (err: unknown) {
      // Unique violation on (tenant_id, claim_number) — bump and retry.
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('idx_progress_claims_tenant_number') && !msg.toLowerCase().includes('unique')) {
        return { error: `Failed to create claim: ${msg}` }
      }
      // Re-read the max and try again.
      const [retryMax] = await db
        .select({
          max_number: sql<string | null>`max(${progressClaims.claim_number})`.as('max_number'),
        })
        .from(progressClaims)
        .where(eq(progressClaims.tenant_id, profile.tenantId))
      claimNumber = nextClaimNumberFromMax(retryMax?.max_number ?? null)
    }
  }

  if (!inserted) {
    return { error: 'Failed to assign claim number after retries' }
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'progress_claim',
    entityId: inserted.id,
    action: 'create',
    diff: {
      milestone_pct: input.milestone_pct,
      amount_cents: input.amount_cents,
      project_id: input.project_id,
    },
  })

  revalidatePath('/claims')
  revalidatePath(`/projects/${input.project_id}`)
  return { id: inserted.id }
}

