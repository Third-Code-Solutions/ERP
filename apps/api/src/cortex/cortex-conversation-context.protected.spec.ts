import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import { CortexConversationContextController } from './cortex-conversation-context.controller'
import { CortexConversationContextService } from './cortex-conversation-context.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'

function databaseWithMembership(
  membership:
    | {
        tenantId: string
        role: string
        email: string
      }
    | undefined
): DatabaseService {
  const limit = vi.fn().mockResolvedValue(membership ? [membership] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  return { client: { select } } as unknown as DatabaseService
}

describe('Cortex conversation context protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    membership:
      | {
          tenantId: string
          role: string
          email: string
        }
      | undefined,
    resolve = vi.fn()
  ) {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }),
    } as unknown as SupabaseIdentityService
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexConversationContextController],
      providers: [
        {
          provide: CortexConversationContextService,
          useValue: { resolve },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(
        identity,
        reflector,
        databaseWithMembership(membership)
      ),
      new CapabilityGuard(reflector)
    )
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    await app.init()
    close = () => app.close()
    return { app, identity }
  }

  it('rejects unauthenticated context reads before the resolver', async () => {
    const resolve = vi.fn()
    const { app, identity } = await appFor({
      tenantId: TENANT_B,
      role: 'viewer',
      email: 'viewer@example.test',
    }, resolve)

    await request(app.getHttpServer())
      .get('/v1/cortex/conversation-context')
      .expect(401)

    expect(identity.verifyAccessToken).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('uses verified membership scope and rejects caller-selected tenants', async () => {
    const resolve = vi.fn().mockResolvedValue({
      conversationId: null,
      context: null,
    })
    const { app, identity } = await appFor(
      {
        tenantId: TENANT_B,
        role: 'viewer',
        email: 'viewer@example.test',
      },
      resolve
    )

    await request(app.getHttpServer())
      .get('/v1/cortex/conversation-context')
      .set('Authorization', 'Bearer verified-token')
      .expect(200)

    expect(identity.verifyAccessToken).toHaveBeenCalledWith('verified-token')
    expect(resolve).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: USER_ID,
        tenantId: TENANT_B,
        role: 'viewer',
      })
    )

    await request(app.getHttpServer())
      .get(`/v1/cortex/conversation-context?tenantId=${TENANT_A}`)
      .set('Authorization', 'Bearer verified-token')
      .expect(400)

    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('rejects a token without an ERP tenant membership', async () => {
    const resolve = vi.fn()
    const { app } = await appFor(undefined, resolve)

    await request(app.getHttpServer())
      .get('/v1/cortex/conversation-context')
      .set('Authorization', 'Bearer verified-token')
      .expect(401)

    expect(resolve).not.toHaveBeenCalled()
  })
})
