import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { db, platformAuditEvents, platformRoleAssignments, tenants, users } from '@third-code-erp/database'
import { eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { CapabilityGuard } from '../src/auth/capability.guard'
import { PlatformOwnerGuard, PLATFORM_OWNER_EMAIL } from '../src/auth/platform-owner.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { DatabaseService } from '../src/database/database.service'
import { PlatformAdministrationController } from '../src/platform-admin/platform-administration.controller'
import { PlatformAdministrationService } from '../src/platform-admin/platform-administration.service'
import { PlatformIdentityAdminService } from '../src/platform-admin/platform-identity-admin.service'

const suite = process.env.DATABASE_URL && process.env.ERP_API_INTEGRATION_EXPECTED === '1' ? describe : describe.skip

suite('platform administration real database/HTTP boundary', () => {
  it('denies tenant roles and proves cross-tenant commands, owner protection, audit and support lifecycle', async () => {
    const rollback = new Error('rollback platform fixture')
    try {
      await db.transaction(async (tx) => {
        const tenantA = randomUUID()
        const tenantB = randomUUID()
        const ownerId = randomUUID()
        const adminId = randomUUID()
        const memberId = randomUUID()
        await tx.insert(tenants).values([
          { id: tenantA, name: 'Platform Fixture A', slug: `platform-a-${tenantA}` },
          { id: tenantB, name: 'Platform Fixture B', slug: `platform-b-${tenantB}` },
        ])
        await tx.insert(users).values([
          { id: ownerId, tenant_id: tenantA, email: PLATFORM_OWNER_EMAIL, full_name: 'Platform Fixture Owner', role: 'owner' },
          { id: adminId, tenant_id: tenantA, email: `admin-${adminId}@example.invalid`, full_name: 'Tenant Admin', role: 'admin' },
          { id: memberId, tenant_id: tenantB, email: `member-${memberId}@example.invalid`, full_name: 'Tenant B Member', role: 'viewer' },
        ])
        await tx.execute(sql`insert into auth.users (id, email, email_confirmed_at) values (${ownerId}, ${PLATFORM_OWNER_EMAIL}, now())`)
        await tx.insert(platformRoleAssignments).values({ user_id: ownerId, normalized_email: PLATFORM_OWNER_EMAIL, created_by: ownerId })
        const identityAdmin = { configured: () => false, setSuspended: vi.fn().mockResolvedValue(undefined), sendPasswordReset: vi.fn().mockResolvedValue(undefined) }
        const moduleRef = await Test.createTestingModule({
          controllers: [PlatformAdministrationController],
          providers: [Reflector, PlatformAdministrationService, PlatformOwnerGuard, SupabaseJwtGuard, CapabilityGuard,
            { provide: DatabaseService, useValue: { client: tx, ping: async () => { await tx.execute(sql`select 1`) } } },
            { provide: ConfigService, useValue: new ConfigService({}) },
            { provide: PlatformIdentityAdminService, useValue: identityAdmin },
            { provide: SupabaseIdentityService, useValue: { verifyAccessToken: async (token: string) => token === 'owner-fixture' ? { userId: ownerId, email: PLATFORM_OWNER_EMAIL, emailConfirmedAt: '2026-09-04T00:00:00Z', authenticatedAt: Math.floor(Date.now() / 1000) } : token === 'admin-fixture' ? { userId: adminId, email: 'admin@example.invalid', emailConfirmedAt: '2026-09-04T00:00:00Z', authenticatedAt: Math.floor(Date.now() / 1000) } : null } },
            { provide: APP_GUARD, useExisting: SupabaseJwtGuard },
            { provide: APP_GUARD, useExisting: CapabilityGuard },
          ],
        }).compile()
        const app = moduleRef.createNestApplication()
        await app.init()
        try {
          const http = app.getHttpServer()
          await request(http).get('/v1/platform-admin').expect(401)
          await request(http).get('/v1/platform-admin').set('Authorization', 'Bearer admin-fixture').expect(403)
          const overview = await request(http).get('/v1/platform-admin').set('Authorization', 'Bearer owner-fixture').expect(200)
          expect(overview.headers['cache-control']).toContain('no-store')
          const directory = await request(http).get('/v1/platform-admin/tenants?q=Platform%20Fixture').set('Authorization', 'Bearer owner-fixture').expect(200)
          expect(directory.body.rows.map((row: { id: string }) => row.id).sort()).toEqual([tenantA, tenantB].sort())
          await request(http).get('/v1/platform-admin/analytics/operations').expect(401)
          await request(http).get('/v1/platform-admin/analytics/operations').set('Authorization', 'Bearer admin-fixture').expect(403)
          const beforeOperations = await request(http).get('/v1/platform-admin/analytics/operations').set('Authorization', 'Bearer owner-fixture').expect(200)
          const projectA = randomUUID()
          const projectB = randomUUID()
          const documentA = randomUUID()
          const opportunityA = randomUUID()
          await tx.execute(sql`insert into projects(id,tenant_id,name,client,status) values
            (${projectA},${tenantA},'Analytics A','Fixture','active'), (${projectB},${tenantB},'Analytics B','Fixture','active')`)
          await tx.execute(sql`insert into documents(id,tenant_id,project_id,uploaded_by,document_type,file_name,storage_path,mime_type,size_bytes) values
            (${documentA},${tenantA},${projectA},${ownerId},'pdf','fixture-a.pdf','fixture/no-object-a','application/pdf',200),
            (${randomUUID()},${tenantB},${projectB},${memberId},'pdf','fixture-b.pdf','fixture/no-object-b','application/pdf',400)`)
          await tx.execute(sql`insert into document_processing_jobs(tenant_id,document_id,project_id,created_by,idempotency_key,request_hash,status,failure_code,completed_at)
            values (${tenantA},${documentA},${projectA},${ownerId},${randomUUID()},${'a'.repeat(64)},'failed','FIXTURE_FAILURE',now())`)
          await tx.execute(sql`insert into cortex_semantic_index_jobs(tenant_id,requested_by,idempotency_key,request_hash,backlog_at_request,status,failure_code,completed_at)
            values (${tenantB},${memberId},${randomUUID()},${'b'.repeat(64)},1,'failed','FIXTURE_FAILURE',now())`)
          await tx.execute(sql`insert into opportunities(id,tenant_id,project_id) values (${opportunityA},${tenantA},${projectA})`)
          await tx.execute(sql`insert into opportunity_kyc_tracks(tenant_id,opportunity_id,track_type,status,due_at) values
            (${tenantA},${opportunityA},'financial_evaluation','pending',now()-interval '1 day'),
            (${tenantA},${opportunityA},'credit_investigation','in_review',now()+interval '1 day')`)
          const operations = await request(http).get('/v1/platform-admin/analytics/operations').set('Authorization', 'Bearer owner-fixture').expect(200)
          expect(operations.headers['cache-control']).toContain('no-store')
          expect(operations.body.documents.total).toBe(beforeOperations.body.documents.total + 2)
          expect(BigInt(operations.body.documents.bytes)).toBe(BigInt(beforeOperations.body.documents.bytes) + 600n)
          expect(operations.body.jobs.documentFailed).toBe(beforeOperations.body.jobs.documentFailed + 1)
          expect(operations.body.jobs.indexFailed).toBe(beforeOperations.body.jobs.indexFailed + 1)
          expect(operations.body.kyc.pendingTracks).toBe(beforeOperations.body.kyc.pendingTracks + 2)
          expect(operations.body.kyc.overdueTracks).toBe(beforeOperations.body.kyc.overdueTracks + 1)
          await request(http).patch(`/v1/platform-admin/users/${memberId}/role`).set('Authorization', 'Bearer owner-fixture').send({ role: 'pm' }).expect(403)
          await request(http).post(`/v1/platform-admin/users/${memberId}/password-reset`).set('Authorization', 'Bearer owner-fixture').expect(403)
          expect(identityAdmin.sendPasswordReset).not.toHaveBeenCalled()
          const context = await request(http).post('/v1/platform-admin/support-context').set('Authorization', 'Bearer owner-fixture').send({ tenantId: tenantB, reason: 'Fixture support', durationMinutes: 30 }).expect(201)
          const supportHeader = { 'x-platform-support-session': context.body.id as string }
          for (const [actor, expired] of [[adminId, false], [ownerId, true]] as const) {
            const invalidSessionId = randomUUID()
            await tx.execute(sql`insert into platform_support_sessions(id,actor_id,tenant_id,reason,created_at,expires_at)
              values (${invalidSessionId},${actor},${tenantB},'Negative context fixture',now()-interval '2 hours',
                case when ${expired} then now()-interval '1 hour' else now()+interval '1 hour' end)`)
            await request(http).patch(`/v1/platform-admin/users/${memberId}/role`).set('Authorization', 'Bearer owner-fixture')
              .set('x-platform-support-session', invalidSessionId).send({ role: 'pm' }).expect(403)
          }
          await request(http).get('/v1/platform-admin').set('Authorization', 'Bearer owner-fixture').set('x-platform-support-session', 'malformed').expect(403)
          await request(http).patch(`/v1/platform-admin/users/${memberId}/role`).set('Authorization', 'Bearer owner-fixture').set(supportHeader).send({ role: 'pm' }).expect(200)
          expect((await tx.select().from(users).where(eq(users.id, memberId)))[0]?.role).toBe('pm')
          await request(http).patch(`/v1/platform-admin/users/${ownerId}/role`).set('Authorization', 'Bearer owner-fixture').send({ role: 'viewer' }).expect(403)
          await request(http).patch(`/v1/platform-admin/users/${ownerId}/status`).set('Authorization', 'Bearer owner-fixture').send({ status: 'suspended', reason: 'Must be denied' }).expect(403)
          await request(http).patch(`/v1/platform-admin/tenants/${tenantA}/status`).set('Authorization', 'Bearer owner-fixture').send({ status: 'disabled', reason: 'Must be denied' }).expect(403)
          await request(http).patch(`/v1/platform-admin/tenants/${tenantA}`).set('Authorization', 'Bearer owner-fixture').set(supportHeader).send({ name: 'Wrong tenant' }).expect(403)
          await request(http).patch(`/v1/platform-admin/tenants/${tenantB}/status`).set('Authorization', 'Bearer owner-fixture').set(supportHeader).send({ status: 'suspended', reason: 'Fixture suspension' }).expect(200)
          await request(http).patch(`/v1/platform-admin/tenants/${tenantB}/status`).set('Authorization', 'Bearer owner-fixture').set(supportHeader).send({ status: 'active', reason: null }).expect(200)
          expect(context.body.tenantId).toBe(tenantB)
          const withoutContext = await request(http).get('/v1/platform-admin').set('Authorization', 'Bearer owner-fixture').expect(200)
          expect(withoutContext.body.activeSupportSession).toBeNull()
          await request(http).delete(`/v1/platform-admin/support-context/${context.body.id}`).set('Authorization', 'Bearer owner-fixture').expect(403)
          await request(http).delete(`/v1/platform-admin/support-context/${context.body.id}`).set('Authorization', 'Bearer owner-fixture').set(supportHeader).expect(200)
          await request(http).patch(`/v1/platform-admin/users/${memberId}/role`).set('Authorization', 'Bearer owner-fixture').set(supportHeader).send({ role: 'viewer' }).expect(403)
          const audit = await tx.select().from(platformAuditEvents).where(eq(platformAuditEvents.actor_id, ownerId))
          expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(['platform.user.role', 'platform.tenant.status', 'platform.support_context.start', 'platform.support_context.end']))
          expect(audit.every((row) => row.actor_id === ownerId)).toBe(true)
          expect(identityAdmin.setSuspended).not.toHaveBeenCalled()
        } finally {
          await app.close()
        }
        throw rollback
      })
    } catch (error) {
      if (error !== rollback) throw error
    }
  }, 30_000)
})
