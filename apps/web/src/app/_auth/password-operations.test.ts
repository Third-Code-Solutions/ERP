import { describe, expect, it, vi } from 'vitest'

import {
  changePasswordWithReauthentication,
  completeRecoveryPasswordChange,
  type PasswordAuthClient,
} from './password-operations'

const input = {
  email: 'user@abi.demo.ph',
  expectedUserId: 'user-id',
  currentPassword: 'FakeCurrent!2026',
  newPassword: 'FakeReplacement!2026',
}

function createAuth(overrides: Partial<PasswordAuthClient> = {}): PasswordAuthClient {
  return {
    signInWithPassword: vi.fn(async () => ({
      data: { user: { id: input.expectedUserId } },
      error: null,
    })),
    updateUser: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides,
  }
}

describe('authenticated password operations', () => {
  it('reauthenticates the server-known identity before updating and signing out', async () => {
    const auth = createAuth()

    await expect(changePasswordWithReauthentication(auth, input)).resolves.toEqual({
      ok: true,
    })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: input.email,
      password: input.currentPassword,
    })
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: input.newPassword,
      current_password: input.currentPassword,
    })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it.each([
    {
      name: 'returned reauthentication error',
      reauth: vi.fn(async () => ({
        data: { user: null },
        error: { message: 'provider detail' },
      })),
    },
    {
      name: 'thrown reauthentication error',
      reauth: vi.fn(async () => {
        throw new Error('provider detail')
      }),
    },
    {
      name: 'different authenticated identity',
      reauth: vi.fn(async () => ({
        data: { user: { id: 'different-user' } },
        error: null,
      })),
    },
  ])('does not update after $name', async ({ reauth }) => {
    const auth = createAuth({ signInWithPassword: reauth })

    await expect(changePasswordWithReauthentication(auth, input)).resolves.toEqual({
      ok: false,
      reason: 'reauth_failed',
    })
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'returned update error',
      update: vi.fn(async () => ({ error: { message: 'provider detail' } })),
    },
    {
      name: 'thrown update error',
      update: vi.fn(async () => {
        throw new Error('provider detail')
      }),
    },
  ])('does not claim success after $name', async ({ update }) => {
    const auth = createAuth({ updateUser: update })

    await expect(changePasswordWithReauthentication(auth, input)).resolves.toEqual({
      ok: false,
      reason: 'update_failed',
    })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'returned sign-out error',
      signOut: vi.fn(async () => ({ error: { message: 'provider detail' } })),
    },
    {
      name: 'thrown sign-out error',
      signOut: vi.fn(async () => {
        throw new Error('provider detail')
      }),
    },
  ])('does not claim success after $name', async ({ signOut }) => {
    const auth = createAuth({ signOut })

    await expect(changePasswordWithReauthentication(auth, input)).resolves.toEqual({
      ok: false,
      reason: 'sign_out_failed',
    })
  })
})

describe('recovery password operations', () => {
  it('updates, clears recovery authorization, and signs out in order', async () => {
    const calls: string[] = []
    const auth = createAuth({
      updateUser: vi.fn(async () => {
        calls.push('update')
        return { error: null }
      }),
      signOut: vi.fn(async () => {
        calls.push('sign-out')
        return { error: null }
      }),
    })
    const cleanup = vi.fn(async () => {
      calls.push('cleanup')
      return true
    })

    await expect(
      completeRecoveryPasswordChange(
        auth,
        { newPassword: input.newPassword },
        cleanup
      )
    ).resolves.toEqual({ ok: true })
    expect(calls).toEqual(['update', 'cleanup', 'sign-out'])
  })

  it.each([
    {
      name: 'returned update error',
      update: vi.fn(async () => ({ error: { message: 'provider detail' } })),
    },
    {
      name: 'thrown update error',
      update: vi.fn(async () => {
        throw new Error('provider detail')
      }),
    },
  ])('does not clean up or sign out after $name', async ({ update }) => {
    const auth = createAuth({ updateUser: update })
    const cleanup = vi.fn(async () => true)

    await expect(
      completeRecoveryPasswordChange(
        auth,
        { newPassword: input.newPassword },
        cleanup
      )
    ).resolves.toEqual({ ok: false, reason: 'update_failed' })
    expect(cleanup).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'returned cleanup failure',
      cleanup: vi.fn(async () => false),
    },
    {
      name: 'thrown cleanup failure',
      cleanup: vi.fn(async () => {
        throw new Error('cleanup detail')
      }),
    },
  ])('does not sign out or claim success after $name', async ({ cleanup }) => {
    const auth = createAuth()

    await expect(
      completeRecoveryPasswordChange(
        auth,
        { newPassword: input.newPassword },
        cleanup
      )
    ).resolves.toEqual({ ok: false, reason: 'cleanup_failed' })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'returned sign-out error',
      signOut: vi.fn(async () => ({ error: { message: 'provider detail' } })),
    },
    {
      name: 'thrown sign-out error',
      signOut: vi.fn(async () => {
        throw new Error('provider detail')
      }),
    },
  ])('does not claim success after $name', async ({ signOut }) => {
    const auth = createAuth({ signOut })

    await expect(
      completeRecoveryPasswordChange(
        auth,
        { newPassword: input.newPassword },
        async () => true
      )
    ).resolves.toEqual({ ok: false, reason: 'sign_out_failed' })
  })
})
