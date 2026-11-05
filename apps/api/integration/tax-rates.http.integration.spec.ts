import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe, type INestApplication, type Provider, type Type } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  boms,
  costCodes,
  db,
  invoices,
  projects,
  purchaseOrders,
  roadmapWorkflowEvents,
  taxProfiles,
  tenantFeatureFlags,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { CustomerInvoiceDraftCreateController } from '../src/finance/customer-invoice-draft-create.controller'
import { CustomerInvoiceDraftCreateService } from '../src/finance/customer-invoice-draft-create.service'
import { PurchaseOrderCreationService } from '../src/procurement/purchase-order-creation.service'
import { PurchaseOrderWorkflowService } from '../src/procurement/purchase-order-workflow.service'
import { PurchaseOrderController } from '../src/procurement/purchase-order.controller'
import { RoadmapController } from '../src/roadmap/roadmap.controller'
import { RoadmapService } from '../src/roadmap/roadmap.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) && process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(transaction: DatabaseTransaction): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (callback: (scopedTransaction: DatabaseTransaction) => Promise<unknown>) =>
          transaction.transaction(callback)
      }
      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function' ? value.bind(transaction) : value
    },
  })
  return { client } as DatabaseService
}

async function alwaysRollback(callback: (transaction: DatabaseTransaction) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

async function buildApp(
  transaction: DatabaseTransaction,
  controllers: Type<unknown>[],
  providers: Provider[],
  identities: Map<string, string>,
  configValues: Record<string, unknown>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers,
    providers: [
      ...providers,
      AuditService,
      {
        provide: ConfigService,
        useValue: {
          get: vi.fn((key: string, fallback?: unknown) => (key in configValues ? configValues[key] : fallback)),
        },
      },
      { provide: DatabaseService, useValue: transactionBoundDatabase(transaction) },
      {
        provide: SupabaseIdentityService,
        useValue: {
          verifyAccessToken: vi.fn(async (token: string) => {
            const userId = identities.get(token)
            return userId ? { userId } : null
          }),
        },
      },
      { provide: APP_GUARD, useClass: SupabaseJwtGuard },
      { provide: APP_GUARD, useClass: CapabilityGuard },
    ],
  }).compile()
  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  await app.init()
  return app
}

async function expectNoLeak(tenantId: string) {
  const leaked = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  expect(leaked).toHaveLength(0)
}

async function auditTax(
  transaction: DatabaseTransaction,
  tenantId: string,
  entityType: 'invoice' | 'purchase_order',
  entityId: string,
) {
  const [entry] = await transaction
    .select({ diff: auditLog.diff })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenant_id, tenantId),
        eq(auditLog.entity_type, entityType),
        eq(auditLog.entity_id, entityId),
        eq(auditLog.action, 'create'),
      ),
    )
    .limit(1)
  return (entry?.diff as { tax?: unknown } | undefined)?.tax
}

// Profiles that cover any test run date: started in the past, open-ended.
function activeProfile(tenantId: string, createdBy: string, code: string, overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: tenantId,
    code,
    name: `Profile ${code}`,
    valid_from: '2026-01-01',
    valid_to: null,
    vat_rate_bps: 1200,
    withholding_rate_bps: 200,
    retention_rate_bps: 1000,
    vat_registered: true,
    status: 'active',
    created_by: createdBy,
    approved_by: createdBy,
    approved_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

suite('Tenant tax rates protected HTTP canary (spec tenancy)', () => {
  it('gates, scopes and maker-checks tax profile activation (AC-TEN-05, AC-TEN-16)', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const preparerA = randomUUID()
    const checkerA = randomUUID()
    const pmA = randomUUID()
    const financeB = randomUUID()
    const draftA = randomUUID()
    const draftB = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        { id: tenantA, name: 'Tax profile HTTP tenant A', slug: `tax-profile-http-a-${suffix}` },
        { id: tenantB, name: 'Tax profile HTTP tenant B', slug: `tax-profile-http-b-${suffix}` },
      ])
      await transaction.insert(users).values([
        { id: preparerA, tenant_id: tenantA, email: `tax-prep-a-${suffix}@integration.test`, full_name: 'Preparer A', role: 'finance' },
        { id: checkerA, tenant_id: tenantA, email: `tax-check-a-${suffix}@integration.test`, full_name: 'Checker A', role: 'finance' },
        { id: pmA, tenant_id: tenantA, email: `tax-pm-a-${suffix}@integration.test`, full_name: 'PM A', role: 'pm' },
        { id: financeB, tenant_id: tenantB, email: `tax-fin-b-${suffix}@integration.test`, full_name: 'Finance B', role: 'finance' },
      ])
      // Drafts start in the future so the no-backdating guard never trips.
      await transaction.insert(taxProfiles).values([
        { ...activeProfile(tenantA, preparerA, `B-${suffix}`), id: draftA, valid_from: '2099-01-01', status: 'draft', approved_by: null, approved_at: null },
        { ...activeProfile(tenantB, financeB, `B-${suffix}`), id: draftB, valid_from: '2099-01-01', status: 'draft', approved_by: null, approved_at: null },
      ])

      const app = await buildApp(
        transaction,
        [RoadmapController],
        [RoadmapService],
        new Map([
          ['tax-prep-a', preparerA],
          ['tax-check-a', checkerA],
          ['tax-pm-a', pmA],
        ]),
        {},
      )
      const server = app.getHttpServer()
      const activate = (id: string, token: string, key: string) =>
        request(server)
          .post(`/v1/roadmap/tax/profiles/${id}/workflow`)
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', key)
          .send({ action: 'activate' })
      const profileState = async () => {
        const [row] = await transaction
          .select({ status: taxProfiles.status, approvedBy: taxProfiles.approved_by })
          .from(taxProfiles)
          .where(and(eq(taxProfiles.tenant_id, tenantA), eq(taxProfiles.id, draftA)))
        return row
      }
      const writesFor = async (entityId: string) => {
        const [events] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(roadmapWorkflowEvents)
          .where(and(eq(roadmapWorkflowEvents.tenant_id, tenantA), eq(roadmapWorkflowEvents.entity_id, entityId)))
        const [audits] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(and(eq(auditLog.tenant_id, tenantA), eq(auditLog.entity_type, 'tax_profile'), eq(auditLog.entity_id, entityId)))
        return { events: events?.count, audits: audits?.count }
      }
      const profileCount = async () => {
        const [row] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(taxProfiles)
          .where(eq(taxProfiles.tenant_id, tenantA))
        return row?.count
      }

      try {
        await request(server).post(`/v1/roadmap/tax/profiles/${draftA}/workflow`).send({ action: 'activate' }).expect(401)
        await activate(draftA, 'tax-pm-a', 'pm-denied').expect(403)

        // AC-TEN-05: env unset and no tenant flag row.
        await activate(draftA, 'tax-check-a', 'gate-off-activate').expect(503)
        await request(server)
          .post('/v1/roadmap/tax/profiles')
          .set('Authorization', 'Bearer tax-check-a')
          .set('Idempotency-Key', 'gate-off-create')
          .send({
            code: `C-${suffix}`,
            name: 'Gated profile',
            validFrom: '2099-01-01',
            vatRateBps: 1200,
            withholdingRateBps: 200,
            retentionRateBps: 1000,
            vatRegistered: true,
            statutoryConfiguration: {},
          })
          .expect(503)
        expect(await profileCount()).toBe(1)
        expect(await profileState()).toEqual({ status: 'draft', approvedBy: null })

        await transaction.insert(tenantFeatureFlags).values({
          tenant_id: tenantA,
          feature_key: 'tax_statutory_outputs',
          enabled: true,
          enabled_by: checkerA,
          enabled_at: new Date(),
        })

        await activate(draftB, 'tax-check-a', 'cross-tenant').expect(404)

        // G-1 / AC-TEN-16: the preparer is refused and nothing is written.
        const refused = await activate(draftA, 'tax-prep-a', 'preparer-activates').expect(403)
        expect(refused.body.message).toBe('The tax profile preparer cannot activate it')
        expect(await profileState()).toEqual({ status: 'draft', approvedBy: null })
        expect(await writesFor(draftA)).toEqual({ events: 0, audits: 0 })

        // G-2: a different finance user activates and is recorded as approver.
        const approved = await activate(draftA, 'tax-check-a', 'checker-activates').expect(200)
        expect(approved.body).toMatchObject({ taxProfileId: draftA, status: 'active' })
        expect(await profileState()).toEqual({ status: 'active', approvedBy: checkerA })
        expect(await writesFor(draftA)).toEqual({ events: 1, audits: 1 })
      } finally {
        await app.close()
      }
    })

    await expectNoLeak(tenantA)
  }, 45_000)

  it('drafts invoices at each tenant\'s effective rates and fails closed on overlap (AC-TEN-06, 07, 18, 19)', async () => {
    const tenantT = randomUUID() // no profile
    const tenantU = randomUUID() // active profile
    const tenantV = randomUUID() // two overlapping active profiles (direct SQL)
    const suffix = randomUUID().slice(0, 12)
    const ids = {
      [tenantT]: { user: randomUUID(), account: randomUUID(), project: randomUUID(), bom: randomUUID() },
      [tenantU]: { user: randomUUID(), account: randomUUID(), project: randomUUID(), bom: randomUUID() },
      [tenantV]: { user: randomUUID(), account: randomUUID(), project: randomUUID(), bom: randomUUID() },
    }
    const profileU = randomUUID()

    await alwaysRollback(async (transaction) => {
      const tenantIds = [tenantT, tenantU, tenantV]
      await transaction.insert(tenants).values(
        tenantIds.map((id, index) => ({ id, name: `Tax invoice tenant ${index}`, slug: `tax-invoice-${index}-${suffix}` })),
      )
      await transaction.insert(users).values(
        tenantIds.map((id, index) => ({
          id: ids[id]!.user,
          tenant_id: id,
          email: `tax-invoice-${index}-${suffix}@integration.test`,
          full_name: `Tax invoice finance ${index}`,
          role: 'finance' as const,
        })),
      )
      await transaction.insert(accounts).values(
        tenantIds.map((id, index) => ({ id: ids[id]!.account, tenant_id: id, name: `Tax invoice account ${index} ${suffix}`, created_by: ids[id]!.user })),
      )
      await transaction.insert(projects).values(
        tenantIds.map((id, index) => ({
          id: ids[id]!.project,
          tenant_id: id,
          account_id: ids[id]!.account,
          name: `Tax invoice project ${index}`,
          client: 'Client',
          created_by: ids[id]!.user,
        })),
      )
      await transaction.insert(boms).values(
        tenantIds.map((id) => ({
          id: ids[id]!.bom,
          tenant_id: id,
          project_id: ids[id]!.project,
          created_by: ids[id]!.user,
          approved_by: ids[id]!.user,
          version: 1,
          label: 'Approved billing BOM',
          status: 'approved' as const,
          total_cost_cents: 800_000,
          tcv_cents: 1_000_000,
          gp_cents: 200_000,
          gp_margin_bps: 2_000,
          approved_at: new Date('2026-08-01T00:00:00.000Z'),
        })),
      )
      await transaction.insert(taxProfiles).values([
        { ...activeProfile(tenantU, ids[tenantU]!.user, `U-${suffix}`, { withholding_rate_bps: 100, retention_rate_bps: 500 }), id: profileU },
        activeProfile(tenantV, ids[tenantV]!.user, `B-${suffix}`),
        activeProfile(tenantV, ids[tenantV]!.user, `A-${suffix}`),
      ])

      const app = await buildApp(
        transaction,
        [CustomerInvoiceDraftCreateController],
        [CustomerInvoiceDraftCreateService],
        new Map(tenantIds.map((id) => [`token-${id}`, ids[id]!.user])),
        {
          ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED: true,
          ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS: tenantIds,
        },
      )
      const draft = (tenantId: string) =>
        request(app.getHttpServer())
          .post(`/v1/projects/${ids[tenantId]!.project}/customer-invoices`)
          .set('Authorization', `Bearer token-${tenantId}`)
          .set('Idempotency-Key', `tax-invoice-${tenantId}`)
          .send({ billingPercentBps: 2500, bomId: ids[tenantId]!.bom })

      try {
        // AC-TEN-06 / AC-TEN-18: no profile here (U's profile is never read).
        const defaults = await draft(tenantT).expect(201)
        expect(defaults.body).toMatchObject({
          retentionBps: 1000,
          subtotalCents: 250000,
          retentionCents: 25000,
          vatCents: 27000,
          withholdingTaxCents: 4500,
          netAmountCents: 247500,
        })
        expect(await auditTax(transaction, tenantT, 'invoice', defaults.body.invoiceId)).toMatchObject({
          vatBps: 1200,
          ewtBps: 200,
          retentionBps: 1000,
          vatRegistered: true,
          source: 'default',
          profileId: null,
        })

        // AC-TEN-07: EWT 1%, retention 5%.
        const profiled = await draft(tenantU).expect(201)
        expect(profiled.body).toMatchObject({
          retentionBps: 500,
          subtotalCents: 250000,
          retentionCents: 12500,
          vatCents: 28500,
          withholdingTaxCents: 2375,
          netAmountCents: 263625,
        })
        expect(await auditTax(transaction, tenantU, 'invoice', profiled.body.invoiceId)).toMatchObject({
          ewtBps: 100,
          retentionBps: 500,
          source: 'profile',
          profileId: profileU,
          profileCode: `U-${suffix}`,
        })

        // AC-TEN-19: overlap fails closed and writes no invoice.
        const conflict = await draft(tenantV).expect(409)
        expect(conflict.body.message).toMatch(
          new RegExp(`^TAX_PROFILE_OVERLAP: active tax profiles A-${suffix}, B-${suffix} all cover \\d{4}-\\d{2}-\\d{2}$`),
        )
        const [invoiceCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(eq(invoices.tenant_id, tenantV))
        expect(invoiceCount?.count).toBe(0)
      } finally {
        await app.close()
      }
    })

    await expectNoLeak(tenantT)
  }, 45_000)

  it('prices manual Core API POs at each tenant\'s effective rates (AC-TEN-09)', async () => {
    const tenantT = randomUUID() // no profile
    const tenantU = randomUUID() // active profile with EWT 1%
    const suffix = randomUUID().slice(0, 12)
    const ids = {
      [tenantT]: { user: randomUUID(), project: randomUUID(), costCode: randomUUID() },
      [tenantU]: { user: randomUUID(), project: randomUUID(), costCode: randomUUID() },
    }

    await alwaysRollback(async (transaction) => {
      const tenantIds = [tenantT, tenantU]
      await transaction.insert(tenants).values(
        tenantIds.map((id, index) => ({ id, name: `Tax PO tenant ${index}`, slug: `tax-po-${index}-${suffix}` })),
      )
      await transaction.insert(users).values(
        tenantIds.map((id, index) => ({
          id: ids[id]!.user,
          tenant_id: id,
          email: `tax-po-${index}-${suffix}@integration.test`,
          full_name: `Tax PO procurement ${index}`,
          role: 'procurement' as const,
        })),
      )
      await transaction.insert(projects).values(
        tenantIds.map((id, index) => ({ id: ids[id]!.project, tenant_id: id, name: `Tax PO project ${index}`, client: 'Client', created_by: ids[id]!.user })),
      )
      await transaction.insert(costCodes).values(
        tenantIds.map((id) => ({ id: ids[id]!.costCode, tenant_id: id, code: `MAT-${suffix}`, name: 'Materials', category: 'material' as const, created_by: ids[id]!.user })),
      )
      await transaction
        .insert(taxProfiles)
        .values(activeProfile(tenantU, ids[tenantU]!.user, `U-${suffix}`, { withholding_rate_bps: 100 }))

      const app = await buildApp(
        transaction,
        [PurchaseOrderController],
        [PurchaseOrderCreationService, { provide: PurchaseOrderWorkflowService, useValue: {} }],
        new Map(tenantIds.map((id) => [`token-${id}`, ids[id]!.user])),
        { ERP_PO_CREATE_WRITES_ENABLED: true, ERP_PO_CREATE_WRITES_TENANT_IDS: tenantIds },
      )
      const createPo = async (tenantId: string) => {
        const response = await request(app.getHttpServer())
          .post('/v1/procurement/purchase-orders')
          .set('Authorization', `Bearer token-${tenantId}`)
          .set('Idempotency-Key', `tax-po-${tenantId}`)
          .send({
            projectId: ids[tenantId]!.project,
            lines: [{ description: 'Messy line', quantity: 1, unitCostCents: 899_883, costCodeId: ids[tenantId]!.costCode }],
          })
          .expect(201)
        const [row] = await transaction
          .select({
            subtotal: purchaseOrders.subtotal_cents,
            vat: purchaseOrders.vat_cents,
            ewt: purchaseOrders.withholding_tax_cents,
            total: purchaseOrders.total_cents,
          })
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.tenant_id, tenantId), eq(purchaseOrders.id, response.body.purchaseOrderId)))
        return { row, tax: await auditTax(transaction, tenantId, 'purchase_order', response.body.purchaseOrderId) }
      }

      try {
        // PO-1: defaults keep 989,871.
        const defaults = await createPo(tenantT)
        expect(defaults.row).toEqual({ subtotal: 899_883, vat: 107_986, ewt: 17_998, total: 989_871 })
        expect(defaults.tax).toMatchObject({ vatBps: 1200, ewtBps: 200, source: 'default' })

        // PO-7: profile EWT 1% gives 998,870.
        const profiled = await createPo(tenantU)
        expect(profiled.row).toEqual({ subtotal: 899_883, vat: 107_986, ewt: 8_999, total: 998_870 })
        expect(profiled.tax).toMatchObject({ ewtBps: 100, source: 'profile', profileCode: `U-${suffix}` })
      } finally {
        await app.close()
      }
    })

    await expectNoLeak(tenantT)
  }, 45_000)
})
