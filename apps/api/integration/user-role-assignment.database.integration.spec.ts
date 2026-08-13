import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  tenants,
  userRoleAssignmentRequests,
  users,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { UserRoleAssignmentController } from '../src/admin/user-role-assignment.controller'
import { UserRoleAssignmentService } from '../src/admin/user-role-assignment.service'
import { AuditService } from '../src/audit/audit.service'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { DatabaseService } from '../src/database/database.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
suite('User role assignment database integration', () => {
  it('enforces tenant, owner hierarchy, concurrency, replay, and atomic audit', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const ownerA = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const targetA = randomUUID()
    const adminB = randomUUID()
    const targetB = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    let app: INestApplication | undefined

    try {
      await db.insert(tenants).values([
        {
          id: tenantA,
          name: 'Role Integration A',
          slug: `role-integration-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Role Integration B',
          slug: `role-integration-b-${suffix}`,
        },
      ])
      await db.insert(users).values([
        {
          id: ownerA,
          tenant_id: tenantA,
          email: `owner-a-${suffix}@integration.test`,
          full_name: 'Owner A',
          role: 'owner',
        },
        {
          id: adminA,
          tenant_id: tenantA,
          email: `admin-a-${suffix}@integration.test`,
          full_name: 'Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `viewer-a-${suffix}@integration.test`,
          full_name: 'Viewer A',
          role: 'viewer',
        },
        {
          id: targetA,
          tenant_id: tenantA,
          email: `target-a-${suffix}@integration.test`,
          full_name: 'Target A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `admin-b-${suffix}@integration.test`,
          full_name: 'Admin B',
          role: 'admin',
        },
        {
          id: targetB,
          tenant_id: tenantB,
          email: `target-b-${suffix}@integration.test`,
          full_name: 'Target B',
          role: 'viewer',
        },
      ])

      const identities = new Map([
        ['owner-a-token', ownerA],
        ['admin-a-token', adminA],
        ['viewer-a-token', viewerA],
        ['admin-b-token', adminB],
      ])
      const database = { client: db } as DatabaseService
      const moduleRef = await Test.createTestingModule({
        controllers: [UserRoleAssignmentController],
        providers: [
          Reflector,
          UserRoleAssignmentService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: SupabaseIdentityService,
            useValue: {
              verifyAccessToken: async (token: string) => {
                const userId = identities.get(token)
                return userId ? { userId } : null
              },
            },
          },
          { provide: DatabaseService, useValue: database },
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string, fallback: unknown) => {
                if (
                  key ===
                  'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED'
                ) {
                  return true
                }
                if (
                  key ===
                  'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS'
                ) {
                  return [tenantA, tenantB]
                }
                return fallback
              }),
            },
          },
          { provide: APP_GUARD, useExisting: SupabaseJwtGuard },
          { provide: APP_GUARD, useExisting: CapabilityGuard },
        ],
      }).compile()
      app = moduleRef.createNestApplication()
      await app.init()
        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Idempotency-Key', 'role-integration-unauthenticated')
          .send({ expectedRole: 'viewer', role: 'pm' })
          .expect(401)

        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer viewer-a-token')
          .set('Idempotency-Key', 'role-integration-viewer')
          .send({ expectedRole: 'viewer', role: 'pm' })
          .expect(403)

        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetB}/role`)
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'role-integration-cross-tenant')
          .send({ expectedRole: 'viewer', role: 'pm' })
          .expect(404)

        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'role-integration-owner-denied')
          .send({ expectedRole: 'viewer', role: 'owner' })
          .expect(403)

        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${ownerA}/role`)
          .set('Authorization', 'Bearer owner-a-token')
          .set('Idempotency-Key', 'role-integration-owner-self')
          .send({ expectedRole: 'owner', role: 'admin' })
          .expect(403)

        const changed = await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer owner-a-token')
          .set('Idempotency-Key', 'role-integration-change')
          .send({ expectedRole: 'viewer', role: 'pm' })
          .expect(200)
        const replay = await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer owner-a-token')
          .set('Idempotency-Key', 'role-integration-change')
          .send({ expectedRole: 'viewer', role: 'pm' })
          .expect(200)
        expect(replay.body).toEqual(changed.body)
        expect(changed.body).toMatchObject({
          userId: targetA,
          tenantId: tenantA,
          previousRole: 'viewer',
          role: 'pm',
          status: 'updated',
        })

        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer owner-a-token')
          .set('Idempotency-Key', 'role-integration-change')
          .send({ expectedRole: 'pm', role: 'finance' })
          .expect(409)

        await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'role-integration-stale')
          .send({ expectedRole: 'viewer', role: 'finance' })
          .expect(409)

        const unchanged = await request(app.getHttpServer())
          .patch(`/v1/admin/users/${targetA}/role`)
          .set('Authorization', 'Bearer admin-a-token')
          .set('Idempotency-Key', 'role-integration-noop')
          .send({ expectedRole: 'pm', role: 'pm' })
          .expect(200)
        expect(unchanged.body.status).toBe('unchanged')

        const [targetRow] = await db
          .select({ role: users.role })
          .from(users)
          .where(
            and(eq(users.tenant_id, tenantA), eq(users.id, targetA))
          )
          .limit(1)
        const [otherTenantRow] = await db
          .select({ role: users.role })
          .from(users)
          .where(
            and(eq(users.tenant_id, tenantB), eq(users.id, targetB))
          )
          .limit(1)
        const requestRows = await db
          .select()
          .from(userRoleAssignmentRequests)
          .where(eq(userRoleAssignmentRequests.tenant_id, tenantA))
        const auditRows = await db
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'user'),
              eq(auditLog.entity_id, targetA),
              eq(auditLog.action, 'update')
            )
          )

        expect(targetRow?.role).toBe('pm')
        expect(otherTenantRow?.role).toBe('viewer')
        expect(requestRows).toHaveLength(2)
        expect(requestRows.every((row) => row.state === 'succeeded')).toBe(true)
        expect(auditRows).toHaveLength(1)
        expect(auditRows[0]?.diff).toMatchObject({
          role: { before: 'viewer', after: 'pm' },
          status: 'updated',
        })
        expect(JSON.stringify(auditRows[0]?.diff)).not.toContain(
          '@integration.test'
        )
    } finally {
      await app?.close()
    }
  })
})
