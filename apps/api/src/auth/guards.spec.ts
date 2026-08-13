import 'reflect-metadata'

import {
  ForbiddenException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import {
  CapabilityGuard,
  RequireCapabilities,
} from './capability.guard'
import type { AuthenticatedRequest } from './current-principal.decorator'
import { Public, SupabaseJwtGuard } from './supabase-jwt.guard'
import type { SupabaseIdentityService } from './supabase-identity.service'

class GuardFixtureController {
  @RequireCapabilities('admin.users')
  userAdmin(): void {}

  @RequireCapabilities('asset.read')
  assetRead(): void {}

  @RequireCapabilities('cortex.search')
  cortexSearch(): void {}

  @RequireCapabilities('cortex.index.manage')
  cortexIndex(): void {}

  @RequireCapabilities('cortex.provider.health.read')
  cortexProviderHealth(): void {}

  @RequireCapabilities('finance.read')
  financeLedgerRead(): void {}

  @RequireCapabilities('project.read')
  projectRead(): void {}

  @RequireCapabilities('opportunity.read')
  opportunityRead(): void {}

  @RequireCapabilities('inventory.read')
  inventoryRead(): void {}

  @RequireCapabilities('audit.read')
  auditActivity(): void {}

  @RequireCapabilities('project.update')
  update(): void {}

  @RequireCapabilities('rfq.dispatch')
  dispatch(): void {}

  @RequireCapabilities('provider.quota.consume')
  quota(): void {}

  @Public()
  open(): void {}

  noPolicy(): void {}
}

function contextFor(
  method: keyof GuardFixtureController,
  request: Partial<AuthenticatedRequest>
): ExecutionContext {
  return {
    getClass: () => GuardFixtureController,
    getHandler: () => GuardFixtureController.prototype[method],
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext
}

function databaseWithMembership(
  membership:
    | {
        tenantId: string
        role: string
        email: string
      }
    | undefined
): DatabaseService {
  const limit = vi
    .fn()
    .mockResolvedValue(membership ? [membership] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  return {
    client: { select },
  } as unknown as DatabaseService
}

describe('SupabaseJwtGuard', () => {
  it('rejects a missing bearer token before identity lookup', async () => {
    const identity = {
      verifyAccessToken: vi.fn(),
    } as unknown as SupabaseIdentityService
    const guard = new SupabaseJwtGuard(
      identity,
      new Reflector(),
      databaseWithMembership(undefined)
    )

    await expect(
      guard.canActivate(contextFor('update', { headers: {} }))
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(identity.verifyAccessToken).not.toHaveBeenCalled()
  })

  it('rejects an invalid access token', async () => {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue(null),
    } as unknown as SupabaseIdentityService
    const guard = new SupabaseJwtGuard(
      identity,
      new Reflector(),
      databaseWithMembership(undefined)
    )

    await expect(
      guard.canActivate(
        contextFor('update', {
          headers: { authorization: 'Bearer invalid-token' },
        })
      )
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('derives the principal from database membership', async () => {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({
        userId: '11111111-1111-4111-8111-111111111111',
      }),
    } as unknown as SupabaseIdentityService
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as Partial<AuthenticatedRequest>
    const guard = new SupabaseJwtGuard(
      identity,
      new Reflector(),
      databaseWithMembership({
        tenantId: '22222222-2222-4222-8222-222222222222',
        role: 'admin',
        email: 'admin@example.test',
      })
    )

    await expect(
      guard.canActivate(contextFor('update', request))
    ).resolves.toBe(true)
    expect(request.principal).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      role: 'admin',
      email: 'admin@example.test',
    })
  })
})

describe('CapabilityGuard', () => {
  const reflector = new Reflector()
  const guard = new CapabilityGuard(reflector)

  it('allows an explicitly authorized role', () => {
    expect(
      guard.canActivate(
        contextFor('update', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'admin',
            email: 'admin@example.test',
          },
        })
      )
    ).toBe(true)
  })

  it('limits user administration to owners and admins', () => {
    expect(
      guard.canActivate(
        contextFor('userAdmin', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'owner',
            email: 'owner@example.test',
          },
        })
      )
    ).toBe(true)
    expect(() =>
      guard.canActivate(
        contextFor('userAdmin', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'pm',
            email: 'pm@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('rejects an authenticated role without the capability', () => {
    expect(() =>
      guard.canActivate(
        contextFor('update', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('allows only procurement-authorized roles to dispatch RFQs', () => {
    expect(
      guard.canActivate(
        contextFor('dispatch', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'procurement',
            email: 'procurement@example.test',
          },
        })
      )
    ).toBe(true)

    expect(() =>
      guard.canActivate(
        contextFor('dispatch', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'commercial',
            email: 'commercial@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('allows every authenticated ERP role to consume bounded provider quota', () => {
    expect(
      guard.canActivate(
        contextFor('quota', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toBe(true)
  })

  it('allows read-only Project access for a viewer', () => {
    expect(
      guard.canActivate(
        contextFor('projectRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toBe(true)
  })

  it('allows read-only Asset access for a viewer', () => {
    expect(
      guard.canActivate(
        contextFor('assetRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toBe(true)
  })

  it('allows read-only Cortex search for a viewer', () => {
    expect(
      guard.canActivate(
        contextFor('cortexSearch', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toBe(true)
  })

  it('limits provider health and spend evidence to operational roles', () => {
    expect(
      guard.canActivate(
        contextFor('cortexProviderHealth', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'finance',
            email: 'finance@example.test',
          },
        })
      )
    ).toBe(true)
    expect(() =>
      guard.canActivate(
        contextFor('cortexProviderHealth', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('limits provider-spending Cortex indexing to owners and admins', () => {
    expect(
      guard.canActivate(
        contextFor('cortexIndex', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'admin',
            email: 'admin@example.test',
          },
        })
      )
    ).toBe(true)
    expect(() =>
      guard.canActivate(
        contextFor('cortexIndex', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('allows ledger reads only for finance-authorized roles', () => {
    expect(
      guard.canActivate(
        contextFor('financeLedgerRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'finance',
            email: 'finance@example.test',
          },
        })
      )
    ).toBe(true)

    expect(() =>
      guard.canActivate(
        contextFor('financeLedgerRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('allows read-only Opportunity access for a viewer', () => {
    expect(
      guard.canActivate(
        contextFor('opportunityRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toBe(true)
  })

  it('keeps audit activity restricted to operational administrators', () => {
    expect(
      guard.canActivate(
        contextFor('auditActivity', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'admin',
            email: 'admin@example.test',
          },
        })
      )
    ).toBe(true)

    expect(() =>
      guard.canActivate(
        contextFor('auditActivity', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('allows inventory reads only for operationally authorized roles', () => {
    expect(
      guard.canActivate(
        contextFor('inventoryRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'procurement',
            email: 'procurement@example.test',
          },
        })
      )
    ).toBe(true)

    expect(() =>
      guard.canActivate(
        contextFor('inventoryRead', {
          principal: {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId: '22222222-2222-4222-8222-222222222222',
            role: 'viewer',
            email: 'viewer@example.test',
          },
        })
      )
    ).toThrow(ForbiddenException)
  })

  it('rejects protected routes without an explicit policy', () => {
    expect(() =>
      guard.canActivate(contextFor('noPolicy', {}))
    ).toThrow('Route has no explicit ERP capability policy')
  })

  it('allows a route explicitly marked public', () => {
    expect(guard.canActivate(contextFor('open', {}))).toBe(true)
  })
})
