import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

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

import { platformUserInvitations, users } from '@third-code-erp/database/schema'
import { PLATFORM_OWNER_EMAIL } from '@third-code-erp/shared-types/platform-administration'
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
const INVITATION_ID = '55555555-5555-4555-8555-555555555555'
const OTHER_TENANT_ID = '66666666-6666-4666-8666-666666666666'
const RACER_ID = '77777777-7777-4777-8777-777777777777'
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
    accountStatus?: string
    activeAdministratorCount?: number
    platformIdentity?: boolean
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

type InvitationState = { status: string; authUserId: string | null }

/**
 * Database for createUser, dispatched by table so every predicate is captured:
 * the duplicate check finds nothing, the invitation insert returns
 * `invitation`, the post-Auth binding check returns `bound`, the failure close
 * returns `closed` (then a re-read returns `current`), and the ghost-row
 * cleanup disables `disabled` users.
 */
function createUserDatabase(options: {
  invitation?: Array<{ id: string }>
  bound?: Array<{ id: string }>
  closed?: InvitationState[]
  current?: InvitationState[]
  disabled?: Array<{ id: string }>
} = {}) {
  const noDuplicate = Promise.resolve([])
  // `limit()` is awaited by the duplicate check and row-locked by suspendUser.
  const userWhere = vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      then: noDuplicate.then.bind(noDuplicate),
      for: vi.fn().mockResolvedValue([
        { id: RACER_ID, role: 'viewer', email: 'new-owner@example.test', accountStatus: 'active', activeAdministratorCount: 1 },
      ]),
    }),
  })
  const bindingWhere = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(options.bound ?? [{ id: TARGET_ID }]),
  })
  const invitationWhere = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(options.current ?? []),
  })
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => table === platformUserInvitations
      ? { innerJoin: () => ({ where: bindingWhere }), where: invitationWhere }
      : { where: userWhere },
  }))
  const values = vi.fn().mockReturnValue({
    onConflictDoNothing: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(options.invitation ?? [{ id: INVITATION_ID }]),
    }),
  })
  mocks.insert.mockReturnValue({ values })
  const closeReturning = vi.fn().mockResolvedValue(
    options.closed ?? [{ status: 'failed', authUserId: null }]
  )
  const closeWhere = vi.fn().mockReturnValue({ returning: closeReturning })
  const disableWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(options.disabled ?? [{ id: TARGET_ID }]),
  })
  const suspendWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: RACER_ID }]),
  })
  const set = vi.fn((changes: Record<string, unknown>) => ({
    where: changes.account_status === 'disabled'
      ? disableWhere
      : changes.account_status === 'suspended' ? suspendWhere : closeWhere,
  }))
  mocks.update.mockReturnValue({ set })
  return { values, set, bindingWhere, closeWhere, closeReturning, invitationWhere, disableWhere }
}

function authAdmin(overrides: {
  createUser?: ReturnType<typeof vi.fn>
  deleteUser?: ReturnType<typeof vi.fn>
} = {}) {
  const createAuthUser = overrides.createUser
    ?? vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null })
  const deleteAuthUser = overrides.deleteUser ?? vi.fn().mockResolvedValue({ error: null })
  const updateUserById = vi.fn().mockResolvedValue({ error: null })
  mocks.createSupabaseAdminClient.mockReturnValue({
    auth: { admin: { createUser: createAuthUser, deleteUser: deleteAuthUser, updateUserById } },
  })
  return { createAuthUser, deleteAuthUser, updateUserById }
}

/** Maps each `"table"."column"` compared in a captured drizzle predicate to its bound value(s). */
function predicate(where: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const condition = where.mock.calls[0]?.[0] as SQL
  const { sql, params } = new PgDialect().sqlToQuery(condition)
  const bound: Record<string, unknown> = {}
  for (const [, column, operator, refs] of sql.matchAll(/("\w+"\."\w+") (=|in) \(?([$\d, ]+)\)?/g)) {
    const values = refs!.split(',').map((ref) => params[Number(ref.trim().slice(1)) - 1])
    bound[column!] = operator === 'in' ? values : values[0]
  }
  return bound
}

const INVITATION_FAILED = expect.objectContaining({ status: 'failed' })
const RECONCILE = {
  error: 'User creation could not be confirmed. Contact support to reconcile the Auth account.',
}
const DISABLED = {
  error: 'User creation failed. The partial account was disabled; contact support before inviting this email again.',
}

describe('admin user role authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // createUser tests queue one-shot select results; never leak them.
    mocks.select.mockReset()
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

  it('refuses a role without admin.users before any invitation or Auth call', async () => {
    mocks.can.mockReturnValue(false)
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role: 'pm' })

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
      error: 'Forbidden: role "pm" lacks admin.users',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('provisions through an invitation for the admin tenant and never inserts public.users itself', async () => {
    const { values, set, bindingWhere } = createUserDatabase()
    const { createAuthUser, deleteAuthUser } = authAdmin()

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual({ userId: TARGET_ID })

    // The Auth insert trigger writes the only public.users row.
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.insert).toHaveBeenCalledWith(platformUserInvitations)
    expect(mocks.insert).not.toHaveBeenCalledWith(users)
    expect(values).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      normalized_email: 'new-owner@example.test',
      full_name: 'New Owner',
      role: 'viewer',
      invited_by: USER_ID,
    })
    expect(values.mock.invocationCallOrder[0]!).toBeLessThan(
      createAuthUser.mock.invocationCallOrder[0]!
    )
    expect(createAuthUser).toHaveBeenCalledWith({
      email: 'new-owner@example.test',
      password: 'long-enough-password',
      email_confirm: true,
      user_metadata: { full_name: 'New Owner' },
    })
    // The binding is confirmed only for this invitation, still `sent`, bound to
    // the new identity in the admin's tenant with the granted role.
    expect(predicate(bindingWhere)).toEqual({
      '"platform_user_invitations"."id"': INVITATION_ID,
      '"platform_user_invitations"."status"': 'sent',
      '"users"."id"': TARGET_ID,
      '"users"."tenant_id"': TENANT_ID,
      '"users"."role"': 'viewer',
    })
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityId: TARGET_ID,
        action: 'create',
      }),
    )
    expect(set).not.toHaveBeenCalled()
    expect(deleteAuthUser).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/users')
  })

  it('normalizes the invitation email the way the Auth trigger matches it', async () => {
    const { values } = createUserDatabase()
    const { createAuthUser } = authAdmin()
    const form = createUserForm('viewer')
    form.set('email', '  New.Owner@Example.TEST ')

    await expect(createUser(form)).resolves.toEqual({ userId: TARGET_ID })
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      normalized_email: 'new.owner@example.test',
    }))
    expect(createAuthUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new.owner@example.test',
    }))
  })

  it('ignores browser-supplied tenant, inviter and status fields', async () => {
    const { values } = createUserDatabase()
    const { createAuthUser } = authAdmin()
    const form = createUserForm('viewer')
    form.set('tenant_id', OTHER_TENANT_ID)
    form.set('invited_by', TARGET_ID)
    form.set('status', 'accepted')

    await expect(createUser(form)).resolves.toEqual({ userId: TARGET_ID })
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT_ID,
      invited_by: USER_ID,
    }))
    expect(JSON.stringify(values.mock.calls)).not.toContain(OTHER_TENANT_ID)
    expect(JSON.stringify(createAuthUser.mock.calls)).not.toContain(OTHER_TENANT_ID)
  })

  it('refuses an email that already has an open invitation without calling Auth', async () => {
    createUserDatabase({ invitation: [] })
    const { createAuthUser } = authAdmin()

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
      error: 'This email already has an open invitation.',
    })
    expect(createAuthUser).not.toHaveBeenCalled()
  })

  it('closes the invitation when Auth rejects the user', async () => {
    const { set, closeWhere, invitationWhere } = createUserDatabase()
    const { deleteAuthUser, updateUserById } = authAdmin({
      createUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: new Error('A user with this email address has already been registered'),
      }),
    })

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
      error: 'A user with this email address has already been registered',
    })
    expect(set).toHaveBeenCalledWith(INVITATION_FAILED)
    // Only this tenant's invitation, and only while it is still open.
    expect(predicate(closeWhere)).toEqual({
      '"platform_user_invitations"."id"': INVITATION_ID,
      '"platform_user_invitations"."tenant_id"': TENANT_ID,
      '"platform_user_invitations"."status"': ['pending', 'sent'],
    })
    expect(invitationWhere).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
    expect(deleteAuthUser).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('suspends a racing sign-up that already accepted the invitation and reports reconciliation', async () => {
    const { set, invitationWhere } = createUserDatabase({
      closed: [],
      current: [{ status: 'accepted', authUserId: RACER_ID }],
    })
    const { deleteAuthUser, updateUserById } = authAdmin({
      createUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: new Error('A user with this email address has already been registered'),
      }),
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual(RECONCILE)
      expect(predicate(invitationWhere)).toEqual({
        '"platform_user_invitations"."id"': INVITATION_ID,
        '"platform_user_invitations"."tenant_id"': TENANT_ID,
      })
      expect(updateUserById).toHaveBeenCalledWith(RACER_ID, { ban_duration: '876000h' })
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ account_status: 'suspended' }))
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: TENANT_ID,
        entityId: RACER_ID,
        action: 'status_change',
        diff: expect.objectContaining({ to_status: 'suspended' }),
      }))
      expect(deleteAuthUser).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('suspends a racing sign-up that bound the open invitation first', async () => {
    const { invitationWhere } = createUserDatabase({
      closed: [{ status: 'failed', authUserId: RACER_ID }],
    })
    const { updateUserById } = authAdmin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('email_exists') }),
    })

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual(RECONCILE)
    expect(invitationWhere).not.toHaveBeenCalled()
    expect(updateUserById).toHaveBeenCalledWith(RACER_ID, { ban_duration: '876000h' })
  })

  it('reports reconciliation when the close matched no open invitation', async () => {
    createUserDatabase({ closed: [], current: [{ status: 'revoked', authUserId: null }] })
    const { updateUserById } = authAdmin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('rejected') }),
    })

    await expect(createUser(createUserForm('viewer'))).resolves.toEqual(RECONCILE)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('closes the invitation and reports reconciliation when the Auth request throws', async () => {
    const { set } = createUserDatabase()
    const { deleteAuthUser } = authAdmin({
      createUser: vi.fn().mockRejectedValue(new Error('synthetic timeout')),
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
        error: 'User creation could not be confirmed. Contact support to reconcile the Auth account.',
      })
      expect(set).toHaveBeenCalledWith(INVITATION_FAILED)
      expect(deleteAuthUser).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('deletes the Auth user and closes the invitation when it was not bound to the admin tenant', async () => {
    // Unbound: the identity's row landed outside this tenant, so nothing here can be disabled.
    const { set } = createUserDatabase({ bound: [], disabled: [] })
    const { deleteAuthUser } = authAdmin()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual(RECONCILE)
      expect(deleteAuthUser).toHaveBeenCalledWith(TARGET_ID)
      expect(set).toHaveBeenCalledWith(INVITATION_FAILED)
      // Closing the invitation first blocks activation even if Auth cleanup fails.
      expect(set.mock.invocationCallOrder[0]!).toBeLessThan(
        deleteAuthUser.mock.invocationCallOrder[0]!
      )
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('compensates Auth and disables the provisional row when the user audit cannot commit', async () => {
    const { set, disableWhere } = createUserDatabase({
      closed: [{ status: 'failed', authUserId: TARGET_ID }],
    })
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const { deleteAuthUser, updateUserById } = authAdmin()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual(DISABLED)
      expect(deleteAuthUser).toHaveBeenCalledWith(TARGET_ID)
      expect(set).toHaveBeenCalledWith(INVITATION_FAILED)
      // Own binding: nothing to suspend.
      expect(updateUserById).not.toHaveBeenCalled()
      // public.users rows cannot be deleted; the trigger-written row is disabled.
      expect(mocks.update).toHaveBeenCalledWith(users)
      expect(set).toHaveBeenCalledWith(expect.objectContaining({
        account_status: 'disabled',
        status_changed_by: USER_ID,
      }))
      expect(predicate(disableWhere)).toEqual({
        '"users"."id"': TARGET_ID,
        '"users"."tenant_id"': TENANT_ID,
        '"users"."account_status"': 'invited',
      })
      expect(deleteAuthUser.mock.invocationCallOrder[0]!).toBeLessThan(
        disableWhere.mock.invocationCallOrder[0]!
      )
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('reports reconciliation when the provisional row cannot be disabled', async () => {
    createUserDatabase({ closed: [{ status: 'failed', authUserId: TARGET_ID }], disabled: [] })
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const { deleteAuthUser } = authAdmin()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual(RECONCILE)
      expect(deleteAuthUser).toHaveBeenCalledWith(TARGET_ID)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('reports reconciliation when the invitation close fails but Auth deletion succeeds', async () => {
    const { closeReturning, disableWhere } = createUserDatabase()
    closeReturning.mockRejectedValueOnce(new Error('synthetic database outage'))
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('synthetic audit failure'))
    const { deleteAuthUser } = authAdmin()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual(RECONCILE)
      await expect(deleteAuthUser.mock.results[0]?.value).resolves.toEqual({ error: null })
      expect(deleteAuthUser).toHaveBeenCalledWith(TARGET_ID)
      expect(disableWhere).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('reports reconciliation when Auth compensation also fails', async () => {
    const { set, disableWhere } = createUserDatabase({ bound: [] })
    authAdmin({
      deleteUser: vi.fn().mockResolvedValue({ error: new Error('synthetic cleanup failure') }),
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
        error: 'User creation could not be confirmed. Contact support to reconcile the Auth account.',
      })
      expect(set).toHaveBeenCalledWith(INVITATION_FAILED)
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
      // The row stays behind an identity that still exists; support reconciles both.
      expect(disableWhere).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('reports reconciliation when the failed invitation cannot be closed', async () => {
    createUserDatabase()
    mocks.update.mockImplementation(() => {
      throw new Error('synthetic database outage')
    })
    authAdmin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('rejected') }),
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(createUser(createUserForm('viewer'))).resolves.toEqual({
        error: 'User creation could not be confirmed. Contact support to reconcile the Auth account.',
      })
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

  it.each(['admin', 'owner'])(
    'refuses a %s resetting a platform identity before any audit or Auth call',
    async (actorRole) => {
      mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role: actorRole })
      const query = userQuery([
        { id: TARGET_ID, role: 'viewer', email: 'platform@example.test', platformIdentity: true },
      ])
      mocks.select.mockReturnValue({ from: query.from })

      await expect(resetUserPassword(resetPasswordForm())).resolves.toEqual({
        error: 'Platform administration credentials cannot be changed from a workspace.',
      })
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
      expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    },
  )

  it('flags a platform identity by live role assignment or the pinned owner email', async () => {
    const query = userQuery([
      { id: TARGET_ID, role: 'viewer', email: PLATFORM_OWNER_EMAIL, platformIdentity: true },
    ])
    mocks.select.mockReturnValue({ from: query.from })

    await resetUserPassword(resetPasswordForm())

    const fields = mocks.select.mock.calls[0]?.[0] as { platformIdentity: SQL }
    const { sql, params } = new PgDialect().sqlToQuery(fields.platformIdentity)
    expect(sql).toContain('public.platform_role_assignments')
    expect(sql).toContain('platform_role.revoked_at is null')
    expect(params).toContain(PLATFORM_OWNER_EMAIL)
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
