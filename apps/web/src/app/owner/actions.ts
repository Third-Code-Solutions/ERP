'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@third-code-erp/database'
import {
  platformDemoRequests,
  tenants,
} from '@third-code-erp/database/schema'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'
import { eq } from 'drizzle-orm'
import { logPlatformAction, requireOwnerAdmin } from '@/lib/owner-admin'
import { PLATFORM_DEMO_REQUEST_STATUSES } from '@/lib/platform-demo-status'
import { writePlatformAuditLogInTransaction } from '@/lib/platform-audit'

type OwnerActionState = {
  message: string
  status: 'error' | 'idle' | 'success'
}

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(255),
  organizationType: z.enum(ORGANIZATION_TYPES),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use lowercase letters, numbers, and single hyphens only.'
    ),
})

const demoReviewSchema = z.object({
  requestId: z.string().uuid(),
  reviewNotes: z.string().trim().max(5_000).optional(),
  status: z.enum(PLATFORM_DEMO_REQUEST_STATUSES),
})

function optionalValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function firstValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message ?? 'Please review the form and try again.'
}

export async function createOrganization(
  _previousState: OwnerActionState,
  formData: FormData
): Promise<OwnerActionState> {
  const traceId = randomUUID()
  let actorId: string | null = null
  try {
    const owner = await requireOwnerAdmin()
    actorId = owner.id
    const parsed = organizationSchema.safeParse({
      name: formData.get('name'),
      organizationType: formData.get('organizationType'),
      slug: formData.get('slug'),
    })
    if (!parsed.success) {
      logPlatformAction({
        traceId,
        actorId,
        action: 'platform.organization.create',
        outcome: 'rejected',
      })
      return { status: 'error', message: firstValidationMessage(parsed.error) }
    }

    const input = parsed.data
    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1)
    if (existing) {
      logPlatformAction({
        traceId,
        actorId,
        action: 'platform.organization.create',
        outcome: 'rejected',
      })
      return { status: 'error', message: 'That organization slug is already in use.' }
    }

    const [organization] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          organization_type: input.organizationType,
          slug: input.slug,
        })
        .returning({ id: tenants.id, name: tenants.name })
      if (!created) throw new Error('Organization was not created.')

      await writePlatformAuditLogInTransaction(tx, {
        actorId: owner.id,
        actorEmail: owner.email,
        entityType: 'organization',
        entityId: created.id,
        action: 'create',
        details: {
          organization_type: input.organizationType,
          slug: input.slug,
        },
      })
      return [created]
    })
    if (!organization) throw new Error('Organization was not created.')
  } catch (error) {
    console.error('[owner:create-organization]', {
      trace_id: traceId,
      error: error instanceof Error ? error.message : 'unknown error',
    })
    logPlatformAction({
      traceId,
      actorId,
      action: 'platform.organization.create',
      outcome: 'failed',
    })
    return {
      status: 'error',
      message: 'The organization could not be created. Please try again.',
    }
  }

  logPlatformAction({
    traceId,
    actorId,
    action: 'platform.organization.create',
    outcome: 'allowed',
  })
  revalidatePath('/owner')
  return { status: 'success', message: 'Organization created.' }
}

export async function updateDemoRequestStatus(
  _previousState: OwnerActionState,
  formData: FormData
): Promise<OwnerActionState> {
  const traceId = randomUUID()
  let actorId: string | null = null
  try {
    const owner = await requireOwnerAdmin()
    actorId = owner.id
    const parsed = demoReviewSchema.safeParse({
      requestId: formData.get('requestId'),
      reviewNotes: optionalValue(formData.get('reviewNotes')),
      status: formData.get('status'),
    })
    if (!parsed.success) {
      logPlatformAction({
        traceId,
        actorId,
        action: 'platform.demo_request.review',
        outcome: 'rejected',
      })
      return { status: 'error', message: firstValidationMessage(parsed.error) }
    }

    const input = parsed.data
    const [existing] = await db
      .select({ id: platformDemoRequests.id, status: platformDemoRequests.status })
      .from(platformDemoRequests)
      .where(eq(platformDemoRequests.id, input.requestId))
      .limit(1)
    if (!existing) {
      logPlatformAction({
        traceId,
        actorId,
        action: 'platform.demo_request.review',
        outcome: 'rejected',
      })
      return { status: 'error', message: 'Demo request not found.' }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(platformDemoRequests)
        .set({
          review_notes: input.reviewNotes,
          reviewed_at: new Date(),
          reviewed_by: owner.id,
          reviewed_by_email: owner.email,
          status: input.status,
          updated_at: new Date(),
        })
        .where(eq(platformDemoRequests.id, input.requestId))

      await writePlatformAuditLogInTransaction(tx, {
        actorId: owner.id,
        actorEmail: owner.email,
        entityType: 'demo_request',
        entityId: input.requestId,
        action: 'review',
        details: {
          status_after: input.status,
          status_before: existing.status,
        },
      })
    })
  } catch (error) {
    console.error('[owner:update-demo-request]', {
      trace_id: traceId,
      error: error instanceof Error ? error.message : 'unknown error',
    })
    logPlatformAction({
      traceId,
      actorId,
      action: 'platform.demo_request.review',
      outcome: 'failed',
    })
    return {
      status: 'error',
      message: 'The demo request could not be updated. Please try again.',
    }
  }

  logPlatformAction({
    traceId,
    actorId,
    action: 'platform.demo_request.review',
    outcome: 'allowed',
  })
  revalidatePath('/owner')
  return { status: 'success', message: 'Demo request updated.' }
}
