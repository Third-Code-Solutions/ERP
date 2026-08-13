import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  adminUserRoleAssignmentWritesUseCoreApi: vi.fn(),
  assignUserRoleThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/erp-core-client', () => ({
  adminUserRoleAssignmentWritesUseCoreApi:
    mocks.adminUserRoleAssignmentWritesUseCoreApi,
  assignUserRoleThroughCoreApi: mocks.assignUserRoleThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  createUser,
  deleteUser,
  resetUserPassword,
  updateUserRole,
} from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const TARGET_ID = '33333333-3333-4333-8333-333333333333'
const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'admin',
  email: 'admin@example.test',
  fullName: 'Admin',
}

function roleForm(role: string): FormData {
  const form = new FormData()
  form.set('user_id', TARGET_ID)
  form.set('role', role)
  return form
}

function createUserForm(role: string): FormData {
  const form = new FormData()
  form.set('email', 'new-owner@example.test')
  form.set('password', 'long-enough-password')
  form.set('full_name', 'New Owner')
  form.set('role', role)
  return form
}

function userQuery(
  rows: Array<{ id: string; role: string; email: string }>
) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

describe('admin user role authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(false)
    const query = userQuery([
      { id: TARGET_ID, role: 'viewer', email: 'viewer@example.test' },
    ])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    })
  })

  it('uses Core for the selected tenant and performs no fallback write', async () => {
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(true)
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        userId: TARGET_ID,
        tenantId: TENANT_ID,
        previousRole: 'viewer',
        role: 'pm',
        status: 'updated',
        updatedAt: '2026-08-07T00:00:00.000Z',
      },
    })

    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({})

    expect(mocks.assignUserRoleThroughCoreApi).toHaveBeenCalledWith(
      TARGET_ID,
      { expectedRole: 'viewer', role: 'pm' },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('fails closed after a Core rejection', async () => {
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(true)
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'User role changed after this form was opened.',
    })

    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({
      error: 'User role changed after this form was opened.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('preserves the tenant-scoped server fallback while the canary is off', async () => {
    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({})

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityId: TARGET_ID,
        action: 'update',
      })
    )
    expect(mocks.assignUserRoleThroughCoreApi).not.toHaveBeenCalled()
  })

  it('prevents an admin from assigning owner before any mutation', async () => {
    await expect(updateUserRole(roleForm('owner'))).resolves.toEqual({
      error: 'Only an owner can assign or change the owner role.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.assignUserRoleThroughCoreApi).not.toHaveBeenCalled()
  })

  it('prevents an admin from creating an owner before database or Auth access', async () => {
    await expect(createUser(createUserForm('owner'))).resolves.toEqual({
      error: 'Only an owner can create another owner.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('prevents an admin from resetting an owner password', async () => {
    const query = userQuery([
      { id: TARGET_ID, role: 'owner', email: 'owner@example.test' },
    ])
    mocks.select.mockReturnValue({ from: query.from })
    const form = new FormData()
    form.set('user_id', TARGET_ID)
    form.set('password', 'long-enough-password')

    await expect(resetUserPassword(form)).resolves.toEqual({
      error: 'Only an owner can reset another owner password.',
    })
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('prevents an admin from deleting an owner', async () => {
    const query = userQuery([
      { id: TARGET_ID, role: 'owner', email: 'owner@example.test' },
    ])
    mocks.select.mockReturnValue({ from: query.from })
    const form = new FormData()
    form.set('user_id', TARGET_ID)

    await expect(deleteUser(form)).resolves.toEqual({
      error: 'Only an owner can delete another owner.',
    })
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a target outside the tenant', async () => {
    const query = userQuery([])
    mocks.select.mockReturnValue({ from: query.from })

    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({
      error: 'User not found in this workspace.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
