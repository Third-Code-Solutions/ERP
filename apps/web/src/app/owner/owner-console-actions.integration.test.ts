import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  platformAuditLog,
  platformDemoRequests,
  tenants,
} from '@third-code-erp/database/schema'

const mocks = vi.hoisted(() => ({
  logPlatformAction: vi.fn(),
  requireOwnerAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/owner-admin', () => ({
  logPlatformAction: mocks.logPlatformAction,
  requireOwnerAdmin: mocks.requireOwnerAdmin,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { submitDemoRequest } from '../book-demo/actions'
import { createOrganization, updateDemoRequestStatus } from './actions'

const enabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.DATABASE_HARDENING_EXPECTED === '1'
const suite = enabled ? describe : describe.skip
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_EMAIL = 'kurt@thirdcodesolutions.com'

function demoRequestForm(email: string): FormData {
  const form = new FormData()
  form.set('contactName', 'Ana Reyes')
  form.set('workEmail', email)
  form.set('companyName', 'Reyes Builders')
  form.set('organizationType', 'construction')
  form.set('useCase', 'Unify handoff records and project cost controls.')
  form.set('privacyConsent', 'on')
  return form
}

function organizationForm(slug: string): FormData {
  const form = new FormData()
  form.set('name', 'Owner Console Test Organization')
  form.set('organizationType', 'construction')
  form.set('slug', slug)
  return form
}

function demoReviewForm(requestId: string): FormData {
  const form = new FormData()
  form.set('requestId', requestId)
  form.set('reviewNotes', 'Ready for a controlled trial discussion.')
  form.set('status', 'contacted')
  return form
}

suite('owner console actions against disposable PostgreSQL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwnerAdmin.mockResolvedValue({
      id: OWNER_ID,
      email: OWNER_EMAIL,
    })
  })

  it('persists a valid public request with its platform audit evidence', async () => {
    const email = `demo-${randomUUID()}@test.invalid`

    await expect(
      submitDemoRequest({ status: 'idle', message: '' }, demoRequestForm(email))
    ).resolves.toMatchObject({ status: 'success' })

    const [request] = await db
      .select({
        id: platformDemoRequests.id,
        workEmail: platformDemoRequests.work_email,
        status: platformDemoRequests.status,
      })
      .from(platformDemoRequests)
      .where(eq(platformDemoRequests.work_email, email))
      .limit(1)
    expect(request).toEqual({
      id: expect.any(String),
      workEmail: email,
      status: 'new',
    })

    const [audit] = await db
      .select({
        action: platformAuditLog.action,
        actorId: platformAuditLog.actor_id,
        details: platformAuditLog.details,
      })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.entity_type, 'demo_request'),
          eq(platformAuditLog.entity_id, request!.id),
          eq(platformAuditLog.action, 'create')
        )
      )
      .limit(1)
    expect(audit).toEqual({
      action: 'create',
      actorId: null,
      details: { source: 'book_demo' },
    })
  })

  it('requires owner authorization before a platform mutation', async () => {
    mocks.requireOwnerAdmin.mockRejectedValue(new Error('FORBIDDEN'))
    const slug = `forbidden-owner-${randomUUID().slice(0, 12)}`

    await expect(
      createOrganization({ status: 'idle', message: '' }, organizationForm(slug))
    ).resolves.toMatchObject({ status: 'error' })

    const [organization] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1)
    expect(organization).toBeUndefined()
  })

  it('persists owner mutations and matching platform audit evidence', async () => {
    const slug = `owner-${randomUUID().slice(0, 12)}`

    await expect(
      createOrganization({ status: 'idle', message: '' }, organizationForm(slug))
    ).resolves.toEqual({ status: 'success', message: 'Organization created.' })

    const [organization] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1)
    expect(organization?.id).toEqual(expect.any(String))

    const [organizationAudit] = await db
      .select({
        action: platformAuditLog.action,
        actorId: platformAuditLog.actor_id,
        actorEmail: platformAuditLog.actor_email,
        details: platformAuditLog.details,
      })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.entity_type, 'organization'),
          eq(platformAuditLog.entity_id, organization!.id),
          eq(platformAuditLog.action, 'create')
        )
      )
      .limit(1)
    expect(organizationAudit).toEqual({
      action: 'create',
      actorId: OWNER_ID,
      actorEmail: OWNER_EMAIL,
      details: { organization_type: 'construction', slug },
    })

    const [request] = await db
      .insert(platformDemoRequests)
      .values({
        contact_name: 'Review Target',
        work_email: `review-${randomUUID()}@test.invalid`,
        company_name: 'Review Builder',
        organization_type: 'construction',
        use_case: 'Verify owner review persistence in an isolated database.',
      })
      .returning({ id: platformDemoRequests.id })
    expect(request?.id).toEqual(expect.any(String))

    await expect(
      updateDemoRequestStatus(
        { status: 'idle', message: '' },
        demoReviewForm(request!.id)
      )
    ).resolves.toEqual({ status: 'success', message: 'Demo request updated.' })

    const [updatedRequest] = await db
      .select({
        reviewedBy: platformDemoRequests.reviewed_by,
        reviewedByEmail: platformDemoRequests.reviewed_by_email,
        reviewNotes: platformDemoRequests.review_notes,
        status: platformDemoRequests.status,
      })
      .from(platformDemoRequests)
      .where(eq(platformDemoRequests.id, request!.id))
      .limit(1)
    expect(updatedRequest).toEqual({
      reviewedBy: OWNER_ID,
      reviewedByEmail: OWNER_EMAIL,
      reviewNotes: 'Ready for a controlled trial discussion.',
      status: 'contacted',
    })

    const [reviewAudit] = await db
      .select({
        actorId: platformAuditLog.actor_id,
        action: platformAuditLog.action,
        details: platformAuditLog.details,
      })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.entity_type, 'demo_request'),
          eq(platformAuditLog.entity_id, request!.id),
          eq(platformAuditLog.action, 'review')
        )
      )
      .limit(1)
    expect(reviewAudit).toEqual({
      actorId: OWNER_ID,
      action: 'review',
      details: { status_after: 'contacted', status_before: 'new' },
    })
  })
})
