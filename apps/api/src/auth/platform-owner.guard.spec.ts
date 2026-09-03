import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../database/database.service'
import type { PlatformAuthenticatedRequest } from './platform-owner.guard'
import {
  PLATFORM_OWNER_EMAIL,
  PlatformOwnerGuard,
} from './platform-owner.guard'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

function contextFor(
  request: Partial<PlatformAuthenticatedRequest>
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function databaseWith(
  assignment:
    | {
        userId: string
        email: string
        role: string
        accountStatus: string
      }
    | undefined,
  activeCount: number
): DatabaseService {
  const assignmentLimit = vi
    .fn()
    .mockResolvedValue(assignment ? [assignment] : [])
  const assignmentWhere = vi.fn().mockReturnValue({ limit: assignmentLimit })
  const assignmentJoin = vi.fn().mockReturnValue({ where: assignmentWhere })
  const assignmentFrom = vi.fn().mockReturnValue({ innerJoin: assignmentJoin })

  const countWhere = vi.fn().mockResolvedValue([{ value: activeCount }])
  const countFrom = vi.fn().mockReturnValue({ where: countWhere })

  const select = vi
    .fn()
    .mockReturnValueOnce({ from: assignmentFrom })
    .mockReturnValueOnce({ from: countFrom })

  return { client: { select } } as unknown as DatabaseService
}

function verifiedRequest(
  overrides: Partial<
    NonNullable<PlatformAuthenticatedRequest['verifiedIdentity']>
  > = {}
): Partial<PlatformAuthenticatedRequest> {
  return {
    verifiedIdentity: {
      userId: OWNER_ID,
      email: PLATFORM_OWNER_EMAIL,
      emailConfirmedAt: '2026-09-04T00:00:00.000Z',
      ...overrides,
    },
  }
}

describe('PlatformOwnerGuard', () => {
  it.each(['POST', 'PATCH', 'DELETE'])('denies %s without recent authentication', async (method) => {
    const request = { ...verifiedRequest(), method }
    const guard = new PlatformOwnerGuard(databaseWith({
      userId: OWNER_ID, email: PLATFORM_OWNER_EMAIL, role: 'platform_owner', accountStatus: 'active',
    }, 1))
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow('sign-in within the last 15 minutes')
  })

  it('allows recently authenticated mutations', async () => {
    const request = { ...verifiedRequest({ authenticatedAt: Math.floor(Date.now() / 1000) }), method: 'POST' }
    const guard = new PlatformOwnerGuard(databaseWith({
      userId: OWNER_ID, email: PLATFORM_OWNER_EMAIL, role: 'platform_owner', accountStatus: 'active',
    }, 1))
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
  })

  it('accepts only the sole active exact verified identity', async () => {
    const request = verifiedRequest()
    const guard = new PlatformOwnerGuard(
      databaseWith(
        {
          userId: OWNER_ID,
          email: PLATFORM_OWNER_EMAIL,
          role: 'platform_owner',
          accountStatus: 'active',
        },
        1
      )
    )

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request.platformPrincipal).toEqual({
      userId: OWNER_ID,
      email: PLATFORM_OWNER_EMAIL,
    })
  })

  it.each([
    ['missing identity', {}, PLATFORM_OWNER_EMAIL],
    ['unverified email', verifiedRequest({ emailConfirmedAt: null }), PLATFORM_OWNER_EMAIL],
    ['request email mismatch', verifiedRequest({ email: 'attacker@example.test' }), PLATFORM_OWNER_EMAIL],
  ])('denies %s before assignment lookup', async (_label, request) => {
    const database = databaseWith(undefined, 0)
    const guard = new PlatformOwnerGuard(database)

    await expect(
      guard.canActivate(
        contextFor(request as Partial<PlatformAuthenticatedRequest>)
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(database.client.select).not.toHaveBeenCalled()
  })

  it.each([
    ['missing assignment', undefined, 0],
    [
      'different immutable id',
      {
        userId: '22222222-2222-4222-8222-222222222222',
        email: PLATFORM_OWNER_EMAIL,
        role: 'platform_owner',
        accountStatus: 'active',
      },
      1,
    ],
    [
      'suspended owner',
      {
        userId: OWNER_ID,
        email: PLATFORM_OWNER_EMAIL,
        role: 'platform_owner',
        accountStatus: 'suspended',
      },
      1,
    ],
    [
      'ambiguous active assignment count',
      {
        userId: OWNER_ID,
        email: PLATFORM_OWNER_EMAIL,
        role: 'platform_owner',
        accountStatus: 'active',
      },
      2,
    ],
  ])('denies %s', async (_label, assignment, activeCount) => {
    const guard = new PlatformOwnerGuard(databaseWith(assignment, activeCount))
    await expect(
      guard.canActivate(contextFor(verifiedRequest()))
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
