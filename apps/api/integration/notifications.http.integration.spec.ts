import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  notifications,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { RequestObservabilityMiddleware } from '../src/observability/request-observability.middleware'
import { NotificationsController } from '../src/notifications/notifications.controller'
import { NotificationsService } from '../src/notifications/notifications.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (
            scopedTransaction: DatabaseTransaction
          ) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })

  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

suite('Notifications protected HTTP canary', () => {
  it('proves recipient and tenant isolation, audited read-state updates, terminal disablement, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const userA = randomUUID()
    const otherUserA = randomUUID()
    const userB = randomUUID()
    const notificationAUnread = randomUUID()
    const notificationAUnreadTwo = randomUUID()
    const notificationARead = randomUUID()
    const notificationAOtherUser = randomUUID()
    const notificationB = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Notification HTTP Tenant A',
          slug: `notification-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Notification HTTP Tenant B',
          slug: `notification-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `notification-http-a-${suffix}@integration.test`,
          full_name: 'Notification HTTP A',
          role: 'viewer',
        },
        {
          id: otherUserA,
          tenant_id: tenantA,
          email: `notification-http-other-${suffix}@integration.test`,
          full_name: 'Notification HTTP Other A',
          role: 'viewer',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `notification-http-b-${suffix}@integration.test`,
          full_name: 'Notification HTTP B',
          role: 'viewer',
        },
      ])
      await transaction.insert(notifications).values([
        {
          id: notificationAUnread,
          tenant_id: tenantA,
          recipient_user_id: userA,
          channel: 'in_app',
          subject: 'A unread',
          body: 'Tenant A unread notification',
          link_url: '/projects/a',
          is_read: false,
          created_at: new Date('2026-08-10T02:00:00.000Z'),
        },
        {
          id: notificationAUnreadTwo,
          tenant_id: tenantA,
          recipient_user_id: userA,
          channel: 'in_app',
          subject: 'A unread two',
          body: 'Tenant A second unread notification',
          link_url: null,
          is_read: false,
          created_at: new Date('2026-08-10T03:00:00.000Z'),
        },
        {
          id: notificationARead,
          tenant_id: tenantA,
          recipient_user_id: userA,
          channel: 'in_app',
          subject: 'A read',
          body: 'Tenant A read notification',
          link_url: null,
          is_read: true,
          read_at: new Date('2026-08-09T02:00:00.000Z'),
          created_at: new Date('2026-08-10T01:00:00.000Z'),
        },
        {
          id: notificationAOtherUser,
          tenant_id: tenantA,
          recipient_user_id: otherUserA,
          channel: 'in_app',
          subject: 'A other user',
          body: 'Tenant A private notification',
          link_url: null,
          is_read: false,
          created_at: new Date('2026-08-10T04:00:00.000Z'),
        },
        {
          id: notificationB,
          tenant_id: tenantB,
          recipient_user_id: userB,
          channel: 'in_app',
          subject: 'B unread',
          body: 'Tenant B unread notification',
          link_url: null,
          is_read: false,
          created_at: new Date('2026-08-10T05:00:00.000Z'),
        },
      ])

      const database = transactionBoundDatabase(transaction)
      const identities = new Map([
        ['viewer-a-token', userA],
        ['viewer-b-token', userB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_NOTIFICATION_READ_STATE_ENABLED') return true
          if (key === 'ERP_NOTIFICATION_READ_STATE_TENANT_IDS') {
            return [tenantA, tenantB]
          }
          return fallback
        }),
      }
      const service = new NotificationsService(
        config as unknown as ConfigService,
        database,
        new AuditService()
      )

      const createApp = async (
        notificationService: NotificationsService
      ) => {
        const moduleRef = await Test.createTestingModule({
          controllers: [NotificationsController],
          providers: [
            Reflector,
            SupabaseJwtGuard,
            CapabilityGuard,
            {
              provide: SupabaseIdentityService,
              useValue: identity,
            },
            {
              provide: DatabaseService,
              useValue: database,
            },
            {
              provide: NotificationsService,
              useValue: notificationService,
            },
            {
              provide: APP_GUARD,
              useExisting: SupabaseJwtGuard,
            },
            {
              provide: APP_GUARD,
              useExisting: CapabilityGuard,
            },
          ],
        }).compile()
        const app = moduleRef.createNestApplication()
        const observability = new RequestObservabilityMiddleware()
        app.use(observability.use.bind(observability))
        app.useGlobalPipes(
          new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        )
        await app.init()
        return app
      }

      const app = await createApp(service)
      try {
        await request(app.getHttpServer())
          .get('/v1/notifications')
          .expect(401)

        const tenantAResponse = await request(app.getHttpServer())
          .get('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(tenantAResponse.body.unread).toBe(2)
        expect(tenantAResponse.body.items.map((item: { subject: string }) => item.subject)).toEqual([
          'A unread two',
          'A unread',
          'A read',
        ])
        expect(tenantAResponse.body.items).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ subject: 'A other user' }),
            expect.objectContaining({ subject: 'B unread' }),
          ])
        )

        const tenantBResponse = await request(app.getHttpServer())
          .get('/v1/notifications')
          .set('Authorization', 'Bearer viewer-b-token')
          .expect(200)
        expect(tenantBResponse.body.unread).toBe(1)
        expect(tenantBResponse.body.items.map((item: { subject: string }) => item.subject)).toEqual([
          'B unread',
        ])

        const markReadResponse = await request(app.getHttpServer())
          .post('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .set('x-request-id', REQUEST_ID)
          .send({ action: 'mark_read', id: notificationAUnread })
          .expect(200)
        expect(markReadResponse.headers['x-request-id']).toBe(REQUEST_ID)
        expect(markReadResponse.body).toEqual({ ok: true })

        const [markedRead] = await transaction
          .select({ isRead: notifications.is_read, readAt: notifications.read_at })
          .from(notifications)
          .where(eq(notifications.id, notificationAUnread))
        expect(markedRead?.isRead).toBe(true)
        expect(markedRead?.readAt).toBeInstanceOf(Date)

        await request(app.getHttpServer())
          .post('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .send({ action: 'mark_read', id: notificationAOtherUser })
          .expect(200)
        const [otherUserNotification] = await transaction
          .select({ isRead: notifications.is_read })
          .from(notifications)
          .where(eq(notifications.id, notificationAOtherUser))
        expect(otherUserNotification?.isRead).toBe(false)

        await request(app.getHttpServer())
          .post('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .send({ action: 'mark_read' })
          .expect(400)

        await request(app.getHttpServer())
          .post('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .send({ action: 'mark_all_read' })
          .expect(200, { ok: true })
        const remainingUnread = await transaction
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.tenant_id, tenantA),
              eq(notifications.recipient_user_id, userA),
              eq(notifications.is_read, false)
            )
          )
        expect(remainingUnread).toEqual([])

        const auditRows = await transaction
          .select({ entityId: auditLog.entity_id, action: auditLog.action })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              inArray(auditLog.entity_id, [notificationAUnread, userA])
            )
          )
        expect(auditRows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ entityId: notificationAUnread, action: 'update' }),
            expect.objectContaining({ entityId: userA, action: 'update' }),
          ])
        )
      } finally {
        await app.close()
      }

      const disabledConfig = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_NOTIFICATION_READ_STATE_ENABLED') return false
          if (key === 'ERP_NOTIFICATION_READ_STATE_TENANT_IDS') return []
          return fallback
        }),
      }
      const disabledService = new NotificationsService(
        disabledConfig as unknown as ConfigService,
        database,
        new AuditService()
      )
      const disabledApp = await createApp(disabledService)
      try {
        await request(disabledApp.getHttpServer())
          .get('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(503)
        await request(disabledApp.getHttpServer())
          .post('/v1/notifications')
          .set('Authorization', 'Bearer viewer-a-token')
          .send({ action: 'mark_all_read' })
          .expect(503)
      } finally {
        await disabledApp.close()
      }
    })

    const rolledBackRows = await db
      .select({ id: notifications.id, isRead: notifications.is_read })
      .from(notifications)
      .where(
        inArray(notifications.id, [
          notificationAUnread,
          notificationAUnreadTwo,
          notificationARead,
          notificationAOtherUser,
          notificationB,
        ])
      )
    expect(rolledBackRows).toEqual([])
    const rolledBackAuditRows = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenant_id, tenantA),
          inArray(auditLog.entity_id, [notificationAUnread, userA])
        )
      )
    expect(rolledBackAuditRows).toEqual([])
  })
})
