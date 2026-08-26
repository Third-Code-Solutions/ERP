import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logPlatformAction: vi.fn(),
  revalidatePath: vi.fn(),
  requireOwnerAdmin: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  writePlatformAuditLogInTransaction: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/owner-admin', () => ({
  logPlatformAction: mocks.logPlatformAction,
  requireOwnerAdmin: mocks.requireOwnerAdmin,
}))

vi.mock('@/lib/platform-audit', () => ({
  writePlatformAuditLogInTransaction: mocks.writePlatformAuditLogInTransaction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createOrganization, updateDemoRequestStatus } from './actions'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222'
const DEMO_REQUEST_ID = '33333333-3333-4333-8333-333333333333'

function organizationForm(): FormData {
  const form = new FormData()
  form.set('name', 'Reyes Builders')
  form.set('organizationType', 'construction')
  form.set('slug', 'reyes-builders')
  return form
}

function emptyOrganizationLookup() {
  const limit = vi.fn().mockResolvedValue([])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function demoRequestForm(status = 'contacted'): FormData {
  const form = new FormData()
  form.set('requestId', DEMO_REQUEST_ID)
  form.set('reviewNotes', 'Ready for a controlled trial discussion.')
  form.set('status', status)
  return form
}

describe('owner organization action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwnerAdmin.mockResolvedValue({
      id: OWNER_ID,
      email: 'kurt@thirdcodesolutions.com',
    })
    const lookup = emptyOrganizationLookup()
    mocks.select.mockReturnValue({ from: lookup.from })
  })

  it('fails closed before persistence when platform authorization is denied', async () => {
    mocks.requireOwnerAdmin.mockRejectedValue(new Error('FORBIDDEN'))

    await expect(
      createOrganization({ status: 'idle', message: '' }, organizationForm())
    ).resolves.toEqual({
      status: 'error',
      message: 'The organization could not be created. Please try again.',
    })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.writePlatformAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('creates an organization and owner audit evidence in one transaction', async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: ORGANIZATION_ID, name: 'Reyes Builders' }])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert }
    mocks.transaction.mockImplementation(async (callback) => callback(tx))

    await expect(
      createOrganization({ status: 'idle', message: '' }, organizationForm())
    ).resolves.toEqual({ status: 'success', message: 'Organization created.' })

    expect(values).toHaveBeenCalledWith({
      name: 'Reyes Builders',
      organization_type: 'construction',
      slug: 'reyes-builders',
    })
    expect(mocks.writePlatformAuditLogInTransaction).toHaveBeenCalledWith(tx, {
      actorId: OWNER_ID,
      actorEmail: 'kurt@thirdcodesolutions.com',
      entityType: 'organization',
      entityId: ORGANIZATION_ID,
      action: 'create',
      details: {
        organization_type: 'construction',
        slug: 'reyes-builders',
      },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/owner')
  })

  it('rejects invalid organization input before reading or writing platform data', async () => {
    const form = organizationForm()
    form.set('slug', 'Invalid Slug')

    await expect(
      createOrganization({ status: 'idle', message: '' }, form)
    ).resolves.toMatchObject({ status: 'error' })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'rejected' })
    )
  })

  it('rejects an organization slug that is already allocated', async () => {
    const existing = emptyOrganizationLookup()
    const limit = vi.fn().mockResolvedValue([{ id: ORGANIZATION_ID }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from })

    await expect(
      createOrganization({ status: 'idle', message: '' }, organizationForm())
    ).resolves.toEqual({
      status: 'error',
      message: 'That organization slug is already in use.',
    })

    expect(existing).toBeDefined()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe('owner demo review action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwnerAdmin.mockResolvedValue({
      id: OWNER_ID,
      email: 'kurt@thirdcodesolutions.com',
    })
  })

  it('updates a verified request and records an owner audit entry in the same transaction', async () => {
    const lookup = emptyOrganizationLookup()
    const limit = vi.fn().mockResolvedValue([
      { id: DEMO_REQUEST_ID, status: 'new' },
    ])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from })

    const updateWhere = vi.fn().mockResolvedValue([])
    const set = vi.fn().mockReturnValue({ where: updateWhere })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update }
    mocks.transaction.mockImplementation(async (callback) => callback(tx))

    await expect(
      updateDemoRequestStatus({ status: 'idle', message: '' }, demoRequestForm())
    ).resolves.toEqual({ status: 'success', message: 'Demo request updated.' })

    expect(lookup).toBeDefined()
    expect(mocks.writePlatformAuditLogInTransaction).toHaveBeenCalledWith(tx, {
      actorId: OWNER_ID,
      actorEmail: 'kurt@thirdcodesolutions.com',
      entityType: 'demo_request',
      entityId: DEMO_REQUEST_ID,
      action: 'review',
      details: { status_after: 'contacted', status_before: 'new' },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/owner')
  })

  it('rejects an invalid review before querying or mutating a request', async () => {
    await expect(
      updateDemoRequestStatus({ status: 'idle', message: '' }, demoRequestForm('unknown'))
    ).resolves.toMatchObject({ status: 'error' })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('fails closed when the demo request is not found', async () => {
    const lookup = emptyOrganizationLookup()
    mocks.select.mockReturnValue({ from: lookup.from })

    await expect(
      updateDemoRequestStatus({ status: 'idle', message: '' }, demoRequestForm())
    ).resolves.toEqual({ status: 'error', message: 'Demo request not found.' })

    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
