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
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
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
  form.set('expected_role', 'viewer')
  form.set('client_request_id', REQUEST_ID)
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
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(true)
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

    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({ ok: true, role: 'pm' })

    expect(mocks.assignUserRoleThroughCoreApi).toHaveBeenCalledWith(
      TARGET_ID,
      { expectedRole: 'viewer', role: 'pm' },
      REQUEST_ID
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('fails closed after a Core rejection', async () => {
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(true)
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'User role changed after this form was opened.',
      outcome: 'rejected',
    })

    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({
      ok: false,
      error: 'User role changed after this form was opened.',
      outcome: 'rejected',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects without a database fallback when Core routing is disabled', async () => {
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(false)
    await expect(updateUserRole(roleForm('pm'))).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.assignUserRoleThroughCoreApi).not.toHaveBeenCalled()
  })

  it('prevents an admin from assigning owner before any mutation', async () => {
    await expect(updateUserRole(roleForm('owner'))).resolves.toEqual({
      ok: false,
      error: 'Only an owner can assign or change the owner role.',
      outcome: 'rejected',
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
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({ ok: false, error: 'User not found', outcome: 'rejected', status: 404 })

    await expect(updateUserRole(roleForm('pm'))).resolves.toEqual({
      ok: false, error: 'User not found', outcome: 'rejected',
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['user_id', 'expected_role', 'client_request_id'])('rejects invalid %s before Core', async (field) => {
    const form = roleForm('pm'); form.set(field, 'invalid')
    await expect(updateUserRole(form)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    expect(mocks.assignUserRoleThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('preserves an uncertain command and key across retries without rereading role', async () => {
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({ ok: false, error: 'Outcome not confirmed', outcome: 'unknown' })
    const form = roleForm('pm')
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(updateUserRole(form)).resolves.toEqual({ ok: false, error: 'Outcome not confirmed', outcome: 'unknown' })
      expect(mocks.assignUserRoleThroughCoreApi).toHaveBeenNthCalledWith(attempt + 1, TARGET_ID, { expectedRole: 'viewer', role: 'pm' }, REQUEST_ID)
    }
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not bypass Core for an apparently unchanged role', async () => {
    const form = roleForm('viewer')
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({ ok: false, error: 'Forbidden', outcome: 'rejected' })
    await expect(updateUserRole(form)).resolves.toMatchObject({ ok: false })
    expect(mocks.assignUserRoleThroughCoreApi).toHaveBeenCalledWith(TARGET_ID, { expectedRole: 'viewer', role: 'viewer' }, REQUEST_ID)
  })

  it('treats a cross-tenant success as unknown, never confirmed', async () => {
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({ ok: true, data: { userId: TARGET_ID, tenantId: USER_ID, previousRole: 'viewer', role: 'pm' } })
    await expect(updateUserRole(roleForm('pm'))).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not replace a stale expected role with a fresh database value', async () => {
    const form = roleForm('pm'); form.set('expected_role', 'sales')
    mocks.assignUserRoleThroughCoreApi.mockResolvedValue({ ok: false, error: 'Stale role', outcome: 'rejected', status: 409 })
    await expect(updateUserRole(form)).resolves.toEqual({ ok: false, error: 'Stale role', outcome: 'rejected' })
    expect(mocks.assignUserRoleThroughCoreApi).toHaveBeenCalledWith(TARGET_ID, { expectedRole: 'sales', role: 'pm' }, REQUEST_ID)
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('treats a thrown post-submission failure as unknown without exposing its detail', async () => {
    mocks.assignUserRoleThroughCoreApi.mockRejectedValue(new Error('private upstream detail'))
    const result = await updateUserRole(roleForm('pm'))
    expect(result).toMatchObject({ ok: false, outcome: 'unknown' })
    expect(JSON.stringify(result)).not.toContain('private upstream detail')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a pre-submission profile failure without Core or database writes', async () => {
    mocks.requireUserProfile.mockRejectedValue(new Error('private session detail'))
    const result = await updateUserRole(roleForm('pm'))
    expect(result).toMatchObject({ ok: false, outcome: 'rejected' })
    expect(JSON.stringify(result)).not.toContain('private session detail')
    expect(mocks.assignUserRoleThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
