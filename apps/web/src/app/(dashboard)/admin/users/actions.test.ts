import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  stampActorInTransaction: vi.fn(),
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
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
  stampActorInTransaction: mocks.stampActorInTransaction,
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
  suspendUser,
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

function resetPasswordForm(): FormData {
  const form = new FormData()
  form.set('user_id', TARGET_ID)
  form.set('password', 'long-enough-password')
  return form
}

function userQuery(
  rows: Array<{
    id: string
    role: string
    email: string
    tenant_id?: string
    tenantId?: string
    accountStatus?: string
    activeAdministratorCount?: number
  }>
) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const value = Promise.resolve(rows)
  const limitResult = { for: rowLock, then: value.then.bind(value) }
  const limit = vi.fn().mockReturnValue(limitResult)
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

describe('admin user role authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued *Once implementations, so a test that exits early
    // would otherwise leak a stubbed query result into the next test.
    mocks.select.mockReset()
    mocks.insert.mockReset()
    mocks.update.mockReset()
    mocks.transaction.mockReset()
    mocks.writeAuditLogInTransaction.mockReset()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.adminUserRoleAssignmentWritesUseCoreApi.mockReturnValue(true)
    const query = userQuery([
      { id: TARGET_ID, role: 'viewer', email: 'viewer@example.test', accountStatus: 'active' },
    ])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: TARGET_ID }]),
        }),
      }),
    })
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        execute: vi.fn().mockResolvedValue([]),
        select: mocks.select,
        insert: mocks.insert,
        update: mocks.update,
      }),
    )
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

  it('provisions a new workspace user through the server-built invite claim', async () => {
    mocks.select
      .mockReturnValueOnce({ from: userQuery([]).from })
      .mockReturnValueOnce({
        from: userQuery([
          {
            id: TARGET_ID,
            tenant_id: TENANT_ID,
            tenantId: TENANT_ID,
            role: 'viewer',
            email: 'new-owner@example.test',
          },
        ]).from,
      })
    const createAuthUser = vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null })
    const deleteAuthUser = vi.fn().mockResolvedValue({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser: createAuthUser, deleteUser: deleteAuthUser } },
    })

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual({ userId: TARGET_ID })

    expect(createAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new-owner@example.test',
        email_confirm: true,
        app_metadata: {
          erp_invite: { tenant_id: TENANT_ID, invited_by: USER_ID, role: 'viewer' },
        },
      }),
    )
    // The auth trigger owns the row; the action must never insert a second one.
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityId: TARGET_ID,
        action: 'create',
      }),
    )
    expect(deleteAuthUser).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('ignores browser-supplied tenant and inviter fields', async () => {
    const OTHER_TENANT = '99999999-9999-4999-8999-999999999999'
    const OTHER_ACTOR = '88888888-8888-4888-8888-888888888888'
    mocks.select
      .mockReturnValueOnce({ from: userQuery([]).from })
      .mockReturnValueOnce({
        from: userQuery([
          {
            id: TARGET_ID,
            tenant_id: TENANT_ID,
            tenantId: TENANT_ID,
            role: 'viewer',
            email: 'new-owner@example.test',
          },
        ]).from,
      })
    const createAuthUser = vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser: createAuthUser, deleteUser: vi.fn() } },
    })
    const form = createUserForm('viewer')
    form.set('tenant_id', OTHER_TENANT)
    form.set('invited_by', OTHER_ACTOR)
    form.set('app_metadata', JSON.stringify({ erp_invite: { tenant_id: OTHER_TENANT } }))

    await expect(createUser(form)).resolves.toEqual({ userId: TARGET_ID })

    expect(createAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        app_metadata: {
          erp_invite: { tenant_id: TENANT_ID, invited_by: USER_ID, role: 'viewer' },
        },
      }),
    )
  })

  it('compensates Auth when the trigger did not apply the invite', async () => {
    mocks.select
      .mockReturnValueOnce({ from: userQuery([]).from })
      .mockReturnValueOnce({ from: userQuery([]).from })
    const createAuthUser = vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null })
    const deleteAuthUser = vi.fn().mockResolvedValue({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser: createAuthUser, deleteUser: deleteAuthUser } },
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
        error: 'User creation failed before the workspace account was committed.',
      })
      expect(deleteAuthUser).toHaveBeenCalledWith(TARGET_ID)
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('compensates Auth when the user audit cannot commit', async () => {
    mocks.select
      .mockReturnValueOnce({ from: userQuery([]).from })
      .mockReturnValueOnce({
        from: userQuery([
          {
            id: TARGET_ID,
            tenant_id: TENANT_ID,
            tenantId: TENANT_ID,
            role: 'viewer',
            email: 'new-owner@example.test',
          },
        ]).from,
      })
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const createAuthUser = vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null })
    const deleteAuthUser = vi.fn().mockResolvedValue({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser: createAuthUser, deleteUser: deleteAuthUser } },
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
        error: 'User creation failed before the workspace account was committed.',
      })
      expect(deleteAuthUser).toHaveBeenCalledWith(TARGET_ID)
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('reports reconciliation when Auth compensation also fails', async () => {
    mocks.select
      .mockReturnValueOnce({ from: userQuery([]).from })
      .mockReturnValueOnce({
        from: userQuery([
          {
            id: TARGET_ID,
            tenant_id: TENANT_ID,
            tenantId: TENANT_ID,
            role: 'viewer',
            email: 'new-owner@example.test',
          },
        ]).from,
      })
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const createAuthUser = vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null })
    const deleteAuthUser = vi.fn().mockResolvedValue({ error: new Error('synthetic cleanup failure') })
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { createUser: createAuthUser, deleteUser: deleteAuthUser } },
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
        error: 'User creation could not be confirmed. Contact support to reconcile the Auth account.',
      })
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
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

  it('does not submit a password reset when authorization audit fails', async () => {
    mocks.writeAuditLog.mockRejectedValueOnce(new Error('synthetic audit failure'))

    await expect(resetUserPassword(resetPasswordForm())).resolves.toEqual({
      error: 'Password reset could not be audited. No password change was submitted.',
    })
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('audits the authorized and confirmed phases around the provider update', async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })

    await expect(resetUserPassword(resetPasswordForm())).resolves.toEqual({})

    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(2)
    const [authorized, confirmed] = mocks.writeAuditLog.mock.calls.map(([entry]) => entry)
    expect(authorized).toMatchObject({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityId: TARGET_ID,
      entityType: 'user_password_reset',
      diff: { phase: 'authorized' },
    })
    expect(confirmed).toMatchObject({
      entityType: 'user_password_reset',
      diff: { phase: 'provider_confirmed', operation_id: authorized.diff.operation_id },
    })
    expect(mocks.writeAuditLog.mock.invocationCallOrder[0]!).toBeLessThan(
      updateUserById.mock.invocationCallOrder[0]!
    )
    expect(updateUserById.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.writeAuditLog.mock.invocationCallOrder[1]!
    )
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain('long-enough-password')
  })

  it('reports a partially confirmed reset when the final audit fails', async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })
    mocks.writeAuditLog.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('synthetic audit failure'))

    await expect(resetUserPassword(resetPasswordForm())).resolves.toEqual({
      error: 'Password may have changed, but confirmation could not be audited. Contact support before retrying.',
    })
    expect(updateUserById).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('reports an unknown provider outcome after a thrown Auth request', async () => {
    const updateUserById = vi.fn().mockRejectedValue(new Error('synthetic timeout'))
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })

    await expect(resetUserPassword(resetPasswordForm())).resolves.toEqual({
      error: 'Password reset outcome could not be confirmed. Contact support before retrying.',
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
  })

  it('prevents an admin from deleting an owner', async () => {
    const query = userQuery([
      { id: TARGET_ID, role: 'owner', email: 'owner@example.test' },
    ])
    mocks.select.mockReturnValue({ from: query.from })
    const form = new FormData()
    form.set('user_id', TARGET_ID)

    await expect(deleteUser(form)).resolves.toEqual({
      error: 'Only an owner can suspend another owner.',
    })
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('suspends a retained-history user without deleting identity or row', async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const deleteUser = vi.fn()
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { updateUserById, deleteUser } },
    })
    const form = new FormData()
    form.set('user_id', TARGET_ID)
    form.set('reason', 'Access review retained history')

    await expect(suspendUser(form)).resolves.toEqual({ ok: true, status: 'suspended' })
    expect(updateUserById).toHaveBeenCalledWith(TARGET_ID, { ban_duration: '876000h' })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'status_change',
      entityId: TARGET_ID,
      diff: expect.objectContaining({ to_status: 'suspended', reason: 'Access review retained history' }),
    }))
  })

  it('rejects an invalid suspension reason before Auth', async () => {
    const updateUserById = vi.fn()
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })
    const form = new FormData()
    form.set('user_id', TARGET_ID)
    form.set('reason', 'x')

    await expect(suspendUser(form)).resolves.toMatchObject({ error: expect.stringContaining('reason') })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('protects the last active workspace administrator after the tenant lock', async () => {
    const query = userQuery([
      {
        id: TARGET_ID,
        role: 'admin',
        email: 'only-admin@example.test',
        accountStatus: 'active',
        activeAdministratorCount: 0,
      },
    ])
    mocks.select.mockReturnValue({ from: query.from })
    const updateUserById = vi.fn()
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })
    const form = new FormData()
    form.set('user_id', TARGET_ID)
    form.set('reason', 'Retain history during review')

    await expect(suspendUser(form)).resolves.toEqual({
      error: 'Cannot suspend the last active admin/owner in this workspace.',
    })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('compensates the Auth ban when the audited transaction cannot commit', async () => {
    const updateUserById = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const form = new FormData()
    form.set('user_id', TARGET_ID)
    form.set('reason', 'Retain history during review')

    await expect(suspendUser(form)).resolves.toEqual({
      error: 'User suspension could not be confirmed. Retry or reconcile with support.',
    })
    expect(updateUserById).toHaveBeenNthCalledWith(1, TARGET_ID, { ban_duration: '876000h' })
    expect(updateUserById).toHaveBeenNthCalledWith(2, TARGET_ID, { ban_duration: 'none' })
  })

  it('reconciles compensation to a newer committed durable suspension', async () => {
    const activeTarget = userQuery([
      { id: TARGET_ID, role: 'viewer', email: 'viewer@example.test', accountStatus: 'active' },
    ])
    const committedTarget = userQuery([
      { id: TARGET_ID, role: 'viewer', email: 'viewer@example.test', accountStatus: 'suspended' },
    ])
    mocks.select
      .mockReturnValueOnce({ from: activeTarget.from })
      .mockReturnValueOnce({ from: committedTarget.from })
      .mockReturnValueOnce({ from: committedTarget.from })
    const updateUserById = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } })
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const form = new FormData()
    form.set('user_id', TARGET_ID)
    form.set('reason', 'Retain history during review')

    await expect(suspendUser(form)).resolves.toEqual({
      error: 'User suspension could not be confirmed. Retry or reconcile with support.',
    })
    expect(updateUserById).toHaveBeenNthCalledWith(1, TARGET_ID, { ban_duration: '876000h' })
    expect(updateUserById).toHaveBeenNthCalledWith(2, TARGET_ID, { ban_duration: '876000h' })
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
