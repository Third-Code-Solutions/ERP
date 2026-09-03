import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  db,
  notifications,
  opportunityKycTracks,
  opportunityProjectConversionRequests,
  opportunityStageTransitionRequests,
  opportunities,
  preConChecklistItems,
  preConChecklists,
  projects,
  slaLogs,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
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
import { OpportunityProjectConversionService } from '../src/crm/opportunity-project-conversion.service'
import { OpportunityCreationController } from '../src/crm/opportunity-creation.controller'
import { OpportunityCreationPipe } from '../src/crm/opportunity-creation.pipe'
import { OpportunityCreationService } from '../src/crm/opportunity-creation.service'
import { OpportunityStageTransitionController } from '../src/crm/opportunity-stage-transition.controller'
import { OpportunityStageTransitionPipe } from '../src/crm/opportunity-stage-transition.pipe'
import { OpportunityStageTransitionService } from '../src/crm/opportunity-stage-transition.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => transaction.transaction(callback)
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

suite('Opportunity stage transition protected HTTP canary', () => {
  it('proves strict state, KYC, idempotency, atomic won handoff, SLA, audit, tenant isolation, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const salesA = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const salesB = randomUUID()
    const accountA = randomUUID()
    const accountB = randomUUID()
    const leadOpportunityA = randomUUID()
    const leadOpportunityB = randomUUID()
    const contractOpportunityA = randomUUID()
    const invalidAccountOpportunityA = randomUUID()
    const rollbackOpportunityA = randomUUID()
    const rollbackProjectA = randomUUID()
    const accountlessProjectA = randomUUID()
    const accountlessOpportunityA = randomUUID()
    const contractOpportunityB = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    const observedAt = new Date('2026-08-10T04:00:00.000Z')

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Stage HTTP Tenant A',
          slug: `stage-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Stage HTTP Tenant B',
          slug: `stage-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: salesA,
          tenant_id: tenantA,
          email: `stage-sales-a-${suffix}@integration.test`,
          full_name: 'Stage Sales A',
          role: 'sales',
        },
        {
          id: adminA,
          tenant_id: tenantA,
          email: `stage-admin-a-${suffix}@integration.test`,
          full_name: 'Stage Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `stage-viewer-a-${suffix}@integration.test`,
          full_name: 'Stage Viewer A',
          role: 'viewer',
        },
        {
          id: salesB,
          tenant_id: tenantB,
          email: `stage-sales-b-${suffix}@integration.test`,
          full_name: 'Stage Sales B',
          role: 'sales',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: 'Stage Client A',
          industry: 'office',
          // New PPRF opportunities remain account-pending while their two
          // opportunity-level Finance tracks are approved independently.
          kyc_status: 'pending',
          created_by: salesA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: 'Stage Client B',
          industry: 'industrial',
          kyc_status: 'approved',
          created_by: salesB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(projects).values([
        {
          id: rollbackProjectA,
          tenant_id: tenantA,
          account_id: accountA,
          name: 'Stage rollback project',
          client: 'Stage Client A',
          status: 'lead',
          created_by: salesA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: accountlessProjectA,
          tenant_id: tenantA,
          name: 'Legacy accountless project',
          client: 'Legacy Client',
          status: 'lead',
          created_by: salesA,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(opportunities).values([
        {
          id: leadOpportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          stage: 'lead',
          tcv_cents: 100_000,
          probability: 10,
          weighted_tcv_cents: 10_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: contractOpportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          stage: 'contract',
          opportunity_type: 'A atomic fit-out',
          tcv_cents: 1_000_000,
          probability: 90,
          weighted_tcv_cents: 900_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: invalidAccountOpportunityA,
          tenant_id: tenantA,
          account_id: accountB,
          stage: 'contract',
          opportunity_type: 'A malformed cross-tenant Account reference',
          tcv_cents: 600_000,
          probability: 90,
          weighted_tcv_cents: 540_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: rollbackOpportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          project_id: rollbackProjectA,
          stage: 'contract',
          opportunity_type: 'A rollback fit-out',
          tcv_cents: 800_000,
          probability: 90,
          weighted_tcv_cents: 720_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: accountlessOpportunityA,
          tenant_id: tenantA,
          project_id: accountlessProjectA,
          stage: 'site_survey',
          tcv_cents: 200_000,
          probability: 25,
          weighted_tcv_cents: 50_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: contractOpportunityB,
          tenant_id: tenantB,
          account_id: accountB,
          stage: 'contract',
          opportunity_type: 'B fit-out',
          tcv_cents: 500_000,
          probability: 90,
          weighted_tcv_cents: 450_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: leadOpportunityB,
          tenant_id: tenantB,
          account_id: accountB,
          stage: 'lead',
          opportunity_type: 'B lead',
          tcv_cents: 300_000,
          probability: 10,
          weighted_tcv_cents: 30_000,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(opportunityKycTracks).values(
        [
          contractOpportunityA,
          invalidAccountOpportunityA,
          rollbackOpportunityA,
        ].flatMap((opportunityId) =>
          (['financial_evaluation', 'credit_investigation'] as const).map(
            (trackType) => ({
              tenant_id: tenantA,
              opportunity_id: opportunityId,
              track_type: trackType,
              status: 'approved' as const,
              due_at: observedAt,
              fc_recommended_by: adminA,
              fc_recommended_at: observedAt,
              president_decided_by: adminA,
              president_decided_at: observedAt,
              created_at: observedAt,
              updated_at: observedAt,
            })
          )
        )
      )
      const [initialLeadClock] = await transaction
        .insert(slaLogs)
        .values({
        tenant_id: tenantA,
        entity_type: 'opportunity',
        entity_id: leadOpportunityA,
        sla_label: 'opp.stage_response',
        sla_seconds: { breach_at_seconds: 432_000, warning_at_pct: 0.8 },
        started_at: observedAt,
        })
        .returning({ id: slaLogs.id })
      expect(initialLeadClock).toBeTruthy()

      const identities = new Map([
        ['stage-sales-a-token', salesA],
        ['stage-admin-a-token', adminA],
        ['stage-viewer-a-token', viewerA],
        ['stage-sales-b-token', salesB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = {
        stageEnabled: true,
        stageTenantIds: [tenantA, tenantB],
        conversionEnabled: true,
        conversionTenantIds: [tenantA, tenantB],
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_OPPORTUNITY_STAGE_WRITES_ENABLED') {
            return featureState.stageEnabled
          }
          if (key === 'ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS') {
            return featureState.stageTenantIds
          }
          if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED') {
            return featureState.conversionEnabled
          }
          if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS') {
            return featureState.conversionTenantIds
          }
          return fallback
        }),
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [
          OpportunityCreationController,
          OpportunityStageTransitionController,
        ],
        providers: [
          Reflector,
          OpportunityCreationPipe,
          OpportunityCreationService,
          OpportunityStageTransitionPipe,
          OpportunityStageTransitionService,
          OpportunityProjectConversionService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: ConfigService,
            useValue: config,
          },
          {
            provide: DatabaseService,
            useValue: database,
          },
          {
            provide: SupabaseIdentityService,
            useValue: identity,
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
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.init()

      try {
        const route = (opportunityId: string) =>
          `/v1/crm/opportunities/${opportunityId}/stage-transition`

        const accountlessGate = await request(app.getHttpServer())
          .post(route(accountlessOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'accountless-design')
          .send({ newStage: 'design' })
          .expect(409)
        expect(accountlessGate.body).toMatchObject({
          message: 'Opportunity Account is required before this stage',
          statusCode: 409,
        })

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .send({ newStage: 'site_survey' })
          .expect(401)

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .send({ newStage: 'site_survey' })
          .expect(400)

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'body-rejected')
          .send({ newStage: 'site_survey', tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send({ newStage: 'site_survey' })
          .expect(403)

        featureState.stageEnabled = false
        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'stage-disabled')
          .send({ newStage: 'site_survey' })
          .expect(503)
        featureState.stageEnabled = true

        const created = await request(app.getHttpServer())
          .post('/v1/crm/opportunities')
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'project-opportunity-create')
          .send({
            projectId: rollbackProjectA,
            tcvCents: '10005',
            gpCents: '-2000',
            closingDate: '2026-09-03T00:00:00+08:00',
          })
          .expect(201)
        expect(created.body).toMatchObject({
          ok: true,
          tenantId: tenantA,
          projectId: rollbackProjectA,
          accountId: accountA,
          repId: salesA,
          stage: 'opportunity_creation',
          probability: 10,
          tcvCents: '10005',
          gpCents: '-2000',
          weightedTcvCents: '1001',
        })
        const createReplay = await request(app.getHttpServer())
          .post('/v1/crm/opportunities')
          .set('Authorization', 'Bearer stage-admin-a-token')
          .set('Idempotency-Key', 'project-opportunity-create')
          .send({
            projectId: rollbackProjectA,
            tcvCents: '10005',
            gpCents: '-2000',
            closingDate: '2026-09-03T00:00:00+08:00',
          })
          .expect(201)
        expect(createReplay.body).toEqual(created.body)

        await request(app.getHttpServer())
          .post('/v1/crm/opportunities')
          .set('Authorization', 'Bearer stage-viewer-a-token')
          .set('Idempotency-Key', 'viewer-create')
          .send({ projectId: rollbackProjectA })
          .expect(403)

        await request(app.getHttpServer())
          .post('/v1/crm/opportunities')
          .set('Authorization', 'Bearer stage-sales-b-token')
          .set('Idempotency-Key', 'foreign-project-create')
          .send({ projectId: rollbackProjectA })
          .expect(404)

        await request(app.getHttpServer())
          .post(route(contractOpportunityA))
          .set('Authorization', 'Bearer stage-sales-b-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send({ newStage: 'won' })
          .expect(404)

        featureState.conversionEnabled = false
        await request(app.getHttpServer())
          .post(route(contractOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'conversion-disabled')
          .send({ newStage: 'won' })
          .expect(503)
        featureState.conversionEnabled = true

        const invalidAccountAuditBefore = await transaction
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, invalidAccountOpportunityA)
            )
          )
        const invalidAccount = await request(app.getHttpServer())
          .post(route(invalidAccountOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'invalid-cross-tenant-account')
          .send({ newStage: 'won' })
          .expect(409)
        expect(invalidAccount.body).toMatchObject({
          message: 'Opportunity Account is not available in this tenant',
          statusCode: 409,
        })

        const [invalidOpportunity] = await transaction
          .select({
            stage: opportunities.stage,
            projectId: opportunities.project_id,
          })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenant_id, tenantA),
              eq(opportunities.id, invalidAccountOpportunityA)
            )
          )
          .limit(1)
        expect(invalidOpportunity).toEqual({
          stage: 'contract',
          projectId: null,
        })
        expect(
          await transaction
            .select({ id: opportunityStageTransitionRequests.id })
            .from(opportunityStageTransitionRequests)
            .where(
              and(
                eq(opportunityStageTransitionRequests.tenant_id, tenantA),
                eq(
                  opportunityStageTransitionRequests.opportunity_id,
                  invalidAccountOpportunityA
                )
              )
            )
        ).toHaveLength(0)
        expect(
          await transaction
            .select({ id: opportunityProjectConversionRequests.id })
            .from(opportunityProjectConversionRequests)
            .where(
              and(
                eq(opportunityProjectConversionRequests.tenant_id, tenantA),
                eq(
                  opportunityProjectConversionRequests.opportunity_id,
                  invalidAccountOpportunityA
                )
              )
            )
        ).toHaveLength(0)
        expect(
          await transaction
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.tenant_id, tenantA),
                eq(projects.account_id, accountB)
              )
            )
        ).toHaveLength(0)
        expect(
          await transaction
            .select({ id: preConChecklists.id })
            .from(preConChecklists)
            .where(eq(preConChecklists.tenant_id, tenantA))
        ).toHaveLength(0)
        expect(
          await transaction
            .select({ id: preConChecklistItems.id })
            .from(preConChecklistItems)
            .where(eq(preConChecklistItems.tenant_id, tenantA))
        ).toHaveLength(0)
        expect(
          await transaction
            .select({ id: notifications.id })
            .from(notifications)
            .where(eq(notifications.tenant_id, tenantA))
        ).toHaveLength(0)
        const invalidAccountAuditAfter = await transaction
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, invalidAccountOpportunityA)
            )
          )
        expect(invalidAccountAuditAfter).toEqual(invalidAccountAuditBefore)
        expect(
          await transaction
            .select({ id: slaLogs.id })
            .from(slaLogs)
            .where(
              and(
                eq(slaLogs.tenant_id, tenantA),
                eq(slaLogs.entity_id, invalidAccountOpportunityA)
              )
            )
        ).toHaveLength(0)

        await transaction
          .update(opportunityKycTracks)
          .set({ status: 'pending', updated_at: new Date() })
          .where(
            and(
              eq(opportunityKycTracks.tenant_id, tenantA),
              eq(
                opportunityKycTracks.opportunity_id,
                contractOpportunityA
              ),
              eq(
                opportunityKycTracks.track_type,
                'credit_investigation'
              )
            )
          )
        const incompleteKyc = await request(app.getHttpServer())
          .post(route(contractOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'dual-track-incomplete')
          .send({ newStage: 'won' })
          .expect(409)
        expect(incompleteKyc.body).toMatchObject({
          message: 'Pipeline locked until both Finance tracks are approved',
          statusCode: 409,
        })
        const [kycBlocked] = await transaction
          .select({ stage: opportunities.stage })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenant_id, tenantA),
              eq(opportunities.id, contractOpportunityA)
            )
          )
          .limit(1)
        expect(kycBlocked?.stage).toBe('contract')
        const blockedRequests = await transaction
          .select({ id: opportunityStageTransitionRequests.id })
          .from(opportunityStageTransitionRequests)
          .where(
            and(
              eq(opportunityStageTransitionRequests.tenant_id, tenantA),
              eq(
                opportunityStageTransitionRequests.idempotency_key,
                'dual-track-incomplete'
              )
            )
          )
        expect(blockedRequests).toHaveLength(0)
        await transaction
          .update(opportunityKycTracks)
          .set({ status: 'approved', updated_at: new Date() })
          .where(
            and(
              eq(opportunityKycTracks.tenant_id, tenantA),
              eq(
                opportunityKycTracks.opportunity_id,
                contractOpportunityA
              ),
              eq(
                opportunityKycTracks.track_type,
                'credit_investigation'
              )
            )
          )

        const missingLostReason = await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'lead-lost-without-reason')
          .send({ newStage: 'lost' })
          .expect(409)
        expect(missingLostReason.body).toMatchObject({
          message: 'reason_required',
          statusCode: 409,
        })
        const missingReasonRequests = await transaction
          .select({ id: opportunityStageTransitionRequests.id })
          .from(opportunityStageTransitionRequests)
          .where(
            and(
              eq(opportunityStageTransitionRequests.tenant_id, tenantA),
              eq(
                opportunityStageTransitionRequests.idempotency_key,
                'lead-lost-without-reason'
              )
            )
          )
        expect(missingReasonRequests).toHaveLength(0)

        const nonTerminal = await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'lead-site-survey')
          .send({
            newStage: 'site_survey',
            tcvCents: '100002',
            gpCents: '-2500',
            closingDate: '2026-10-31T00:00:00.000Z',
          })
          .expect(200)
        expect(nonTerminal.body).toMatchObject({
          ok: true,
          opportunityId: leadOpportunityA,
          tenantId: tenantA,
          fromStage: 'lead',
          toStage: 'site_survey',
          projectId: null,
          checklistId: null,
          convertedToProject: false,
        })

        const replay = await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-admin-a-token')
          .set('Idempotency-Key', 'lead-site-survey')
          .send({
            newStage: 'site_survey',
            tcvCents: '100002',
            gpCents: '-2500',
            closingDate: '2026-10-31T00:00:00.000Z',
          })
          .expect(200)
        expect(replay.body).toEqual(nonTerminal.body)

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-viewer-a-token')
          .set('Idempotency-Key', 'lead-site-survey')
          .send({ newStage: 'site_survey' })
          .expect(403)

        await transaction
          .update(users)
          .set({ role: 'viewer', updated_at: new Date() })
          .where(
            and(eq(users.id, salesA), eq(users.tenant_id, tenantA))
          )
        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'lead-site-survey')
          .send({ newStage: 'site_survey' })
          .expect(403)
        await transaction
          .update(users)
          .set({ role: 'sales', updated_at: new Date() })
          .where(
            and(eq(users.id, salesA), eq(users.tenant_id, tenantA))
          )

        const isolatedTenantReplayKey = await request(app.getHttpServer())
          .post(route(leadOpportunityB))
          .set('Authorization', 'Bearer stage-sales-b-token')
          .set('Idempotency-Key', 'lead-site-survey')
          .send({ newStage: 'site_survey' })
          .expect(200)
        expect(isolatedTenantReplayKey.body).toMatchObject({
          opportunityId: leadOpportunityB,
          tenantId: tenantB,
          fromStage: 'lead',
          toStage: 'site_survey',
        })

        const tenantALeadRequests = await transaction
          .select({ id: opportunityStageTransitionRequests.id })
          .from(opportunityStageTransitionRequests)
          .where(
            and(
              eq(opportunityStageTransitionRequests.tenant_id, tenantA),
              eq(
                opportunityStageTransitionRequests.idempotency_key,
                'lead-site-survey'
              )
            )
          )
        expect(tenantALeadRequests).toHaveLength(1)
        const tenantALeadAudits = await transaction
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, leadOpportunityA),
              eq(auditLog.action, 'stage_change')
            )
          )
        expect(tenantALeadAudits).toHaveLength(1)

        const [persistedCreate] = await transaction
          .select({
            projectId: opportunities.project_id,
            accountId: opportunities.account_id,
            repId: opportunities.rep_id,
            stage: opportunities.stage,
            tcvCents: opportunities.tcv_cents,
            gpCents: opportunities.gp_cents,
            weightedTcvCents: opportunities.weighted_tcv_cents,
            closingDate: opportunities.closing_date,
          })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenant_id, tenantA),
              eq(opportunities.id, created.body.opportunityId)
            )
          )
          .limit(1)
        expect(persistedCreate).toEqual({
          projectId: rollbackProjectA,
          accountId: accountA,
          repId: salesA,
          stage: 'opportunity_creation',
          tcvCents: 10_005,
          gpCents: -2_000,
          weightedTcvCents: 1_001,
          closingDate: new Date('2026-09-02T16:00:00.000Z'),
        })
        const createRequests = await transaction
          .select()
          .from(opportunityStageTransitionRequests)
          .where(
            and(
              eq(opportunityStageTransitionRequests.tenant_id, tenantA),
              eq(
                opportunityStageTransitionRequests.idempotency_key,
                'opportunity-create:project-opportunity-create'
              )
            )
          )
        expect(createRequests).toHaveLength(1)
        expect(createRequests[0]).toMatchObject({
          opportunity_id: created.body.opportunityId,
          state: 'succeeded',
          from_stage: 'opportunity_creation',
          to_stage: 'opportunity_creation',
          project_id: rollbackProjectA,
        })
        const createAudits = await transaction
          .select({ diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, created.body.opportunityId),
              eq(auditLog.action, 'create')
            )
          )
        expect(createAudits).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              diff: expect.objectContaining({ source: 'opportunity_create_core' }),
            }),
          ])
        )

        const [accountlessAfterGate] = await transaction
          .select({ stage: opportunities.stage })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenant_id, tenantA),
              eq(opportunities.id, accountlessOpportunityA)
            )
          )
          .limit(1)
        expect(accountlessAfterGate?.stage).toBe('site_survey')

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'lead-site-survey')
          .send({ newStage: 'lost', reason: 'Different command' })
          .expect(409)

        const conversion = await request(app.getHttpServer())
          .post(route(contractOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'contract-won')
          .send({ newStage: 'won', reason: 'Signed contract' })
          .expect(200)
        expect(conversion.body).toMatchObject({
          ok: true,
          opportunityId: contractOpportunityA,
          tenantId: tenantA,
          fromStage: 'contract',
          toStage: 'won',
          convertedToProject: true,
        })
        expect(conversion.body.projectId).toEqual(expect.any(String))
        expect(conversion.body.checklistId).toEqual(expect.any(String))

        await request(app.getHttpServer())
          .post(route(rollbackOpportunityA))
          .set('Authorization', 'Bearer stage-sales-a-token')
          .set('Idempotency-Key', 'rollback-won')
          .send({ newStage: 'won' })
          .expect(409)

        const [lead] = await transaction
          .select({
            stage: opportunities.stage,
            tcvCents: opportunities.tcv_cents,
            gpCents: opportunities.gp_cents,
            weightedTcvCents: opportunities.weighted_tcv_cents,
            closingDate: opportunities.closing_date,
          })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, leadOpportunityA),
              eq(opportunities.tenant_id, tenantA)
            )
          )
          .limit(1)
        expect(lead).toMatchObject({
          stage: 'site_survey',
          tcvCents: 100_002,
          gpCents: -2_500,
          weightedTcvCents: 25_001,
          closingDate: new Date('2026-10-31T00:00:00.000Z'),
        })

        const [converted] = await transaction
          .select()
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, contractOpportunityA),
              eq(opportunities.tenant_id, tenantA)
            )
          )
          .limit(1)
        expect(converted?.stage).toBe('won')
        expect(converted?.project_id).toBe(conversion.body.projectId)

        const [rollback] = await transaction
          .select({ stage: opportunities.stage, projectId: opportunities.project_id })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, rollbackOpportunityA),
              eq(opportunities.tenant_id, tenantA)
            )
          )
          .limit(1)
        expect(rollback).toEqual({ stage: 'contract', projectId: rollbackProjectA })

        const [stageRequest] = await transaction
          .select()
          .from(opportunityStageTransitionRequests)
          .where(
            and(
              eq(opportunityStageTransitionRequests.tenant_id, tenantA),
              eq(opportunityStageTransitionRequests.idempotency_key, 'contract-won')
            )
          )
          .limit(1)
        expect(stageRequest).toMatchObject({
          state: 'succeeded',
          from_stage: 'contract',
          to_stage: 'won',
          project_id: conversion.body.projectId,
          checklist_id: conversion.body.checklistId,
        })

        const [openLeadClock] = await transaction
          .select()
        .from(slaLogs)
          .where(
            and(
              eq(slaLogs.tenant_id, tenantA),
              eq(slaLogs.entity_id, leadOpportunityA),
              eq(slaLogs.sla_label, 'opp.stage_response'),
              isNull(slaLogs.completed_at)
            )
          )
          .limit(1)
        expect(openLeadClock).toBeTruthy()
        const [completedInitialClock] = await transaction
          .select()
          .from(slaLogs)
          .where(
            and(
              eq(slaLogs.tenant_id, tenantA),
              eq(slaLogs.entity_id, leadOpportunityA),
              eq(slaLogs.sla_label, 'opp.stage_response'),
              eq(slaLogs.id, initialLeadClock!.id),
              isNotNull(slaLogs.completed_at)
            )
          )
          .limit(1)
        expect(completedInitialClock).toBeTruthy()

        const semanticAuditRows = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_id, contractOpportunityA),
              eq(auditLog.action, 'stage_change')
            )
          )
        expect(
          semanticAuditRows.some(
            (row) =>
              typeof row.diff === 'object' &&
              !Array.isArray(row.diff) &&
              (row.diff as Record<string, unknown>).source ===
                'opportunity_stage_core'
          )
        ).toBe(true)

        const otherTenantRows = await transaction
          .select()
          .from(opportunityStageTransitionRequests)
          .where(eq(opportunityStageTransitionRequests.tenant_id, tenantB))
        expect(otherTenantRows).toHaveLength(1)
        expect(otherTenantRows[0]).toMatchObject({
          opportunity_id: leadOpportunityB,
          idempotency_key: 'lead-site-survey',
          state: 'succeeded',
        })
        const [untouchedB] = await transaction
          .select({ stage: opportunities.stage })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, contractOpportunityB),
              eq(opportunities.tenant_id, tenantB)
            )
          )
          .limit(1)
        expect(untouchedB?.stage).toBe('contract')
        const [transitionedLeadB] = await transaction
          .select({ stage: opportunities.stage })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, leadOpportunityB),
              eq(opportunities.tenant_id, tenantB)
            )
          )
          .limit(1)
        expect(transitionedLeadB?.stage).toBe('site_survey')
      } finally {
        await app.close()
      }
    })
  })
})
