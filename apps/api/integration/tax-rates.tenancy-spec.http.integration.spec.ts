// Spec-derived integration tests for the `tenancy` module against a real DB
// (docs/erp/specs/tenancy.md AC-TEN-05/06/07/08/14/15/16/17/18/19, R-6/R-8/R-9,
// G-1..G-7). DB-gated like the other HTTP integration specs; every test runs
// inside a transaction that is always rolled back.
import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  boms,
  db,
  invoices,
  projects,
  resolveTaxRates,
  roadmapWorkflowEvents,
  taxProfiles,
  tenantFeatureFlags,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { manilaCalendarDate } from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
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
import { CustomerInvoiceDraftCreateController } from '../src/finance/customer-invoice-draft-create.controller'
import { CustomerInvoiceDraftCreateService } from '../src/finance/customer-invoice-draft-create.service'
import { RoadmapController } from '../src/roadmap/roadmap.controller'
import { RoadmapService } from '../src/roadmap/roadmap.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(transaction: DatabaseTransaction): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (callback: (scoped: DatabaseTransaction) => unknown) =>
          transaction.transaction(callback)
      }
      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function' ? value.bind(transaction) : value
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

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}

type SeededTenant = {
  tenantId: string
  financeId: string
  projectId: string
  bomId: string
}

async function seedBillingTenant(
  transaction: DatabaseTransaction,
  label: string,
  suffix: string
): Promise<SeededTenant> {
  const seeded = {
    tenantId: randomUUID(),
    financeId: randomUUID(),
    projectId: randomUUID(),
    bomId: randomUUID(),
  }
  const accountId = randomUUID()
  await transaction.insert(tenants).values({
    id: seeded.tenantId,
    name: `Tenancy spec ${label}`,
    slug: `tenancy-spec-${label}-${suffix}`,
  })
  await transaction.insert(users).values({
    id: seeded.financeId,
    tenant_id: seeded.tenantId,
    email: `tenancy-spec-${label}-finance-${suffix}@integration.test`,
    full_name: `Tenancy spec finance ${label}`,
    role: 'finance',
  })
  await transaction.insert(accounts).values({
    id: accountId,
    tenant_id: seeded.tenantId,
    name: `Tenancy spec account ${label} ${suffix}`,
    created_by: seeded.financeId,
  })
  await transaction.insert(projects).values({
    id: seeded.projectId,
    tenant_id: seeded.tenantId,
    account_id: accountId,
    name: `Tenancy spec project ${label}`,
    client: `Tenancy spec client ${label}`,
    created_by: seeded.financeId,
  })
  await transaction.insert(boms).values({
    id: seeded.bomId,
    tenant_id: seeded.tenantId,
    project_id: seeded.projectId,
    created_by: seeded.financeId,
    approved_by: seeded.financeId,
    version: 1,
    label: 'Approved billing BOM',
    status: 'approved',
    total_cost_cents: 80_000_000,
    tcv_cents: 100_000_000,
    gp_cents: 20_000_000,
    gp_margin_bps: 2_000,
    approved_at: new Date('2026-08-01T00:00:00.000Z'),
  })
  return seeded
}

type ProfileSeed = {
  tenantId: string
  createdBy: string
  code: string
  status: 'draft' | 'active' | 'retired'
  validFrom: string
  validTo: string | null
  vatBps?: number
  ewtBps?: number
  retentionBps?: number
  vatRegistered?: boolean
  approvedBy?: string | null
}

async function insertProfile(
  transaction: DatabaseTransaction,
  seed: ProfileSeed
): Promise<string> {
  const id = randomUUID()
  await transaction.insert(taxProfiles).values({
    id,
    tenant_id: seed.tenantId,
    code: seed.code,
    name: `Profile ${seed.code}`,
    valid_from: seed.validFrom,
    valid_to: seed.validTo,
    vat_rate_bps: seed.vatBps ?? 1200,
    withholding_rate_bps: seed.ewtBps ?? 200,
    // The table default is 0; fixtures always set retention explicitly (spec §5).
    retention_rate_bps: seed.retentionBps ?? 1000,
    vat_registered: seed.vatRegistered ?? true,
    statutory_configuration: {},
    status: seed.status,
    created_by: seed.createdBy,
    approved_by: seed.status === 'active' ? (seed.approvedBy ?? seed.createdBy) : null,
    approved_at: seed.status === 'active' ? new Date('2025-12-20T02:00:00.000Z') : null,
  })
  return id
}

function identityFor(tokens: Map<string, string>) {
  return {
    verifyAccessToken: vi.fn(async (token: string) => {
      const userId = tokens.get(token)
      return userId ? { userId } : null
    }),
  }
}

async function createApp(
  transaction: DatabaseTransaction,
  tokens: Map<string, string>,
  config: ConfigService,
  controllers: unknown[],
  providers: unknown[]
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: controllers as never[],
    providers: [
      ...(providers as never[]),
      AuditService,
      { provide: ConfigService, useValue: config },
      { provide: DatabaseService, useValue: transactionBoundDatabase(transaction) },
      { provide: SupabaseIdentityService, useValue: identityFor(tokens) },
      { provide: APP_GUARD, useClass: SupabaseJwtGuard },
      { provide: APP_GUARD, useClass: CapabilityGuard },
    ],
  }).compile()
  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
  )
  await app.init()
  return app
}

suite('tenancy: tax-rate resolver against a real database', () => {
  it('R-9 / AC-TEN-18 reads only the caller tenant; R-6 / AC-TEN-17 ignores draft, retired, expired and future profiles; R-8 Manila date; R-7 overlap', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const t = await seedBillingTenant(transaction, 't', suffix)
      const u = await seedBillingTenant(transaction, 'u', suffix)
      const o = await seedBillingTenant(transaction, 'o', suffix)
      observedTenantId = t.tenantId

      const uProfile = await insertProfile(transaction, {
        tenantId: u.tenantId, createdBy: u.financeId, code: 'U-ACTIVE', status: 'active',
        validFrom: '2026-01-01', validTo: null, vatBps: 1200, ewtBps: 100, retentionBps: 500,
      })
      // T: only ignorable profiles around 2026-11-04 (AC-TEN-17).
      await insertProfile(transaction, {
        tenantId: t.tenantId, createdBy: t.financeId, code: 'T-DRAFT', status: 'draft',
        validFrom: '2026-01-01', validTo: null, retentionBps: 0,
      })
      await insertProfile(transaction, {
        tenantId: t.tenantId, createdBy: t.financeId, code: 'T-RETIRED', status: 'retired',
        validFrom: '2026-01-01', validTo: null, retentionBps: 0,
      })
      await insertProfile(transaction, {
        tenantId: t.tenantId, createdBy: t.financeId, code: 'T-EXPIRED', status: 'active',
        validFrom: '2026-01-01', validTo: '2026-10-31', retentionBps: 0,
      })
      const tFuture = await insertProfile(transaction, {
        tenantId: t.tenantId, createdBy: t.financeId, code: 'T-2027', status: 'active',
        validFrom: '2027-01-01', validTo: null, ewtBps: 100, retentionBps: 500,
      })

      const at = new Date('2026-11-04T04:00:00.000Z')
      await expect(resolveTaxRates(transaction, t.tenantId, at)).resolves.toEqual({
        vatBps: 1200,
        ewtBps: 200,
        retentionBps: 1000,
        vatRegistered: true,
        source: 'default',
        profileId: null,
        profileCode: null,
        asOf: '2026-11-04',
      })
      await expect(resolveTaxRates(transaction, u.tenantId, at)).resolves.toEqual({
        vatBps: 1200,
        ewtBps: 100,
        retentionBps: 500,
        vatRegistered: true,
        source: 'profile',
        profileId: uProfile,
        profileCode: 'U-ACTIVE',
        asOf: '2026-11-04',
      })

      // R-8: 2026-12-31T16:30Z is 2027-01-01 in Manila, the future profile's first day.
      await expect(
        resolveTaxRates(transaction, t.tenantId, new Date('2026-12-31T16:30:00.000Z'))
      ).resolves.toMatchObject({ source: 'profile', profileId: tFuture, profileCode: 'T-2027', asOf: '2027-01-01' })
      await expect(
        resolveTaxRates(transaction, t.tenantId, new Date('2026-12-31T15:59:59.000Z'))
      ).resolves.toMatchObject({ source: 'default', asOf: '2026-12-31' })

      // R-7: two active profiles covering the date (direct SQL only) fail closed.
      await insertProfile(transaction, {
        tenantId: o.tenantId, createdBy: o.financeId, code: 'O-C', status: 'active',
        validFrom: '2026-06-01', validTo: null,
      })
      await insertProfile(transaction, {
        tenantId: o.tenantId, createdBy: o.financeId, code: 'O-A', status: 'active',
        validFrom: '2026-01-01', validTo: '2026-12-31',
      })
      await expect(resolveTaxRates(transaction, o.tenantId, at)).rejects.toMatchObject({
        profileCodes: ['O-A', 'O-C'],
      })
      // The overlap in tenant O never leaks into tenant T or U.
      await expect(resolveTaxRates(transaction, t.tenantId, at)).resolves.toMatchObject({ source: 'default' })
    })

    const leaked = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, observedTenantId)).limit(1)
    expect(leaked).toHaveLength(0)
  }, 45_000)
})

suite('tenancy: invoice drafts use the effective rates of the caller tenant', () => {
  it('AC-TEN-06/07/08/18/19 defaults for T, profile for U, non-VAT for N, overlap refused for O', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const t = await seedBillingTenant(transaction, 't', suffix)
      const u = await seedBillingTenant(transaction, 'u', suffix)
      const n = await seedBillingTenant(transaction, 'n', suffix)
      const o = await seedBillingTenant(transaction, 'o', suffix)
      observedTenantId = t.tenantId

      const uProfile = await insertProfile(transaction, {
        tenantId: u.tenantId, createdBy: u.financeId, code: 'U-P1', status: 'active',
        validFrom: '2026-01-01', validTo: null, vatBps: 1200, ewtBps: 100, retentionBps: 500,
      })
      await insertProfile(transaction, {
        tenantId: n.tenantId, createdBy: n.financeId, code: 'N-P2', status: 'active',
        validFrom: '2026-01-01', validTo: null, vatBps: 1200, ewtBps: 200, retentionBps: 1000,
        vatRegistered: false,
      })
      await insertProfile(transaction, {
        tenantId: o.tenantId, createdBy: o.financeId, code: 'O-A', status: 'active',
        validFrom: '2026-01-01', validTo: null,
      })
      await insertProfile(transaction, {
        tenantId: o.tenantId, createdBy: o.financeId, code: 'O-C', status: 'active',
        validFrom: '2026-06-01', validTo: null,
      })

      const tokens = new Map([
        ['tenancy-t', t.financeId],
        ['tenancy-u', u.financeId],
        ['tenancy-n', n.financeId],
        ['tenancy-o', o.financeId],
      ])
      const tenantIds = [t.tenantId, u.tenantId, n.tenantId, o.tenantId]
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED') return true
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS') return tenantIds
          return fallback
        }),
      } as unknown as ConfigService
      const app = await createApp(
        transaction,
        tokens,
        config,
        [CustomerInvoiceDraftCreateController],
        [CustomerInvoiceDraftCreateService]
      )

      const draft = (tenant: SeededTenant, token: string, key: string) =>
        request(app.getHttpServer())
          .post(`/v1/projects/${tenant.projectId}/customer-invoices`)
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', key)
          .send({ billingPercentBps: 2500, bomId: tenant.bomId, dueDate: '2027-01-15', notes: 'Tenancy spec' })

      const auditTax = async (tenantId: string, invoiceId: string) => {
        const [entry] = await transaction
          .select({ diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantId),
              eq(auditLog.entity_type, 'invoice'),
              eq(auditLog.entity_id, invoiceId),
              eq(auditLog.action, 'create')
            )
          )
          .limit(1)
        return (entry?.diff as { tax?: Record<string, unknown> } | null)?.tax
      }

      try {
        const before = new Date()
        // AC-TEN-06 / AC-TEN-18: T has no profile; U's profile is never read.
        const tDraft = await draft(t, 'tenancy-t', 'tenancy-t-1').expect(201)
        const asOf = manilaCalendarDate(before)
        expect(tDraft.body).toMatchObject({
          tenantId: t.tenantId,
          retentionBps: 1000,
          subtotalCents: 25_000_000,
          retentionCents: 2_500_000,
          vatCents: 2_700_000,
          withholdingTaxCents: 450_000,
          netAmountCents: 24_750_000,
        })
        const tTax = await auditTax(t.tenantId, tDraft.body.invoiceId)
        expect(tTax).toMatchObject({
          vatBps: 1200,
          ewtBps: 200,
          retentionBps: 1000,
          vatRegistered: true,
          source: 'default',
          profileId: null,
        })
        expect([asOf, manilaCalendarDate(new Date())]).toContain(tTax?.asOf)

        // AC-TEN-07 (P-1): U's active profile drives retention, VAT and EWT.
        const uDraft = await draft(u, 'tenancy-u', 'tenancy-u-1').expect(201)
        expect(uDraft.body).toMatchObject({
          tenantId: u.tenantId,
          retentionBps: 500,
          subtotalCents: 25_000_000,
          retentionCents: 1_250_000,
          vatCents: 2_850_000,
          withholdingTaxCents: 237_500,
          netAmountCents: 26_362_500,
        })
        const [uRow] = await transaction
          .select({ retentionBps: invoices.retention_bps })
          .from(invoices)
          .where(and(eq(invoices.tenant_id, u.tenantId), eq(invoices.id, uDraft.body.invoiceId)))
          .limit(1)
        expect(uRow?.retentionBps).toBe(500)
        expect(await auditTax(u.tenantId, uDraft.body.invoiceId)).toMatchObject({
          vatBps: 1200,
          ewtBps: 100,
          retentionBps: 500,
          source: 'profile',
          profileId: uProfile,
          profileCode: 'U-P1',
        })

        // AC-TEN-08 (P-2): non-VAT tenant gets VAT 0; EWT and retention still apply.
        const nDraft = await draft(n, 'tenancy-n', 'tenancy-n-1').expect(201)
        expect(nDraft.body).toMatchObject({
          retentionCents: 2_500_000,
          vatCents: 0,
          withholdingTaxCents: 450_000,
          netAmountCents: 22_050_000,
        })
        expect(await auditTax(n.tenantId, nDraft.body.invoiceId)).toMatchObject({
          vatBps: 0,
          vatRegistered: false,
          source: 'profile',
        })

        // AC-TEN-19: two active profiles on the date → 409 naming both codes, no row.
        const conflict = await draft(o, 'tenancy-o', 'tenancy-o-1').expect(409)
        expect(conflict.body.message).toContain('TAX_PROFILE_OVERLAP')
        expect(conflict.body.message).toContain('O-A')
        expect(conflict.body.message).toContain('O-C')
        const [oCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(eq(invoices.tenant_id, o.tenantId))
        expect(oCount?.count).toBe(0)
      } finally {
        await app.close()
      }
    })

    const leaked = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, observedTenantId)).limit(1)
    expect(leaked).toHaveLength(0)
  }, 60_000)
})

suite('tenancy: gated tax-profile write API and activation guards', () => {
  it('AC-TEN-05 401/403/503 gate; G-7 replay; AC-TEN-16 G-1/G-2; AC-TEN-15 G-3/G-4; G-6; AC-TEN-14 G-5; cross-tenant 404 and isolation', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const t = await seedBillingTenant(transaction, 't', suffix)
      const u = await seedBillingTenant(transaction, 'u', suffix)
      observedTenantId = t.tenantId
      const approverX = t.financeId
      const preparerY = randomUUID()
      const pmT = randomUUID()
      await transaction.insert(users).values([
        {
          id: preparerY,
          tenant_id: t.tenantId,
          email: `tenancy-spec-preparer-${suffix}@integration.test`,
          full_name: 'Tenancy spec preparer Y',
          role: 'finance',
        },
        {
          id: pmT,
          tenant_id: t.tenantId,
          email: `tenancy-spec-pm-${suffix}@integration.test`,
          full_name: 'Tenancy spec pm',
          role: 'pm',
        },
      ])

      const today = manilaCalendarDate(new Date())
      const tokens = new Map([
        ['tenancy-x', approverX],
        ['tenancy-y', preparerY],
        ['tenancy-pm', pmT],
        ['tenancy-u', u.financeId],
      ])
      const config = {
        // Env gate unset: only a tenant flag row can open tax_statutory_outputs.
        get: vi.fn((_key: string, fallback?: unknown) => fallback),
      } as unknown as ConfigService
      const app = await createApp(transaction, tokens, config, [RoadmapController], [RoadmapService])

      const server = () => app.getHttpServer()
      let keySequence = 0
      const createProfile = (token: string | null, body: Record<string, unknown>) => {
        const call = request(server()).post('/v1/roadmap/tax/profiles').set('Idempotency-Key', `tenancy-create-${++keySequence}`)
        return (token ? call.set('Authorization', `Bearer ${token}`) : call).send(body)
      }
      const transition = (token: string | null, profileId: string, action: 'activate' | 'retire') => {
        const call = request(server())
          .post(`/v1/roadmap/tax/profiles/${profileId}/workflow`)
          .set('Idempotency-Key', `tenancy-transition-${++keySequence}`)
        return (token ? call.set('Authorization', `Bearer ${token}`) : call).send({ action })
      }
      const countProfiles = async (tenantId: string) => {
        const [row] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(taxProfiles)
          .where(eq(taxProfiles.tenant_id, tenantId))
        return row?.count ?? -1
      }
      const profileRow = async (tenantId: string, id: string) => {
        const [row] = await transaction
          .select({
            status: taxProfiles.status,
            approvedBy: taxProfiles.approved_by,
            approvedAt: taxProfiles.approved_at,
            vatRegistered: taxProfiles.vat_registered,
          })
          .from(taxProfiles)
          .where(and(eq(taxProfiles.tenant_id, tenantId), eq(taxProfiles.id, id)))
          .limit(1)
        return row
      }
      const trailCounts = async (tenantId: string, id: string) => {
        const [audit] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(and(eq(auditLog.tenant_id, tenantId), eq(auditLog.entity_id, id)))
        const [events] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(roadmapWorkflowEvents)
          .where(and(eq(roadmapWorkflowEvents.tenant_id, tenantId), eq(roadmapWorkflowEvents.entity_id, id)))
        return { audit: audit?.count ?? -1, events: events?.count ?? -1 }
      }
      const definition = (code: string, overrides: Record<string, unknown> = {}) => ({
        code,
        name: `Profile ${code}`,
        validFrom: today,
        validTo: addDays(today, 10),
        vatRateBps: 1200,
        withholdingRateBps: 200,
        retentionRateBps: 1000,
        vatRegistered: true,
        statutoryConfiguration: {},
        ...overrides,
      })

      try {
        // --- AC-TEN-05: 401, 403 and the closed feature gate change nothing.
        const gatedDraft = await insertProfile(transaction, {
          tenantId: t.tenantId, createdBy: preparerY, code: 'GATED', status: 'draft',
          validFrom: today, validTo: today,
        })
        const startCount = await countProfiles(t.tenantId)

        await createProfile(null, definition('NOAUTH')).expect(401)
        await transition(null, gatedDraft, 'activate').expect(401)
        await request(server())
          .post('/v1/roadmap/tax/profiles')
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'tenancy-unknown')
          .send(definition('UNKNOWN'))
          .expect(401)
        await createProfile('tenancy-pm', definition('PMDENIED')).expect(403)
        await transition('tenancy-pm', gatedDraft, 'activate').expect(403)
        await createProfile('tenancy-y', definition('GATEOFF')).expect(503)
        await transition('tenancy-x', gatedDraft, 'activate').expect(503)
        expect(await countProfiles(t.tenantId)).toBe(startCount)
        expect((await profileRow(t.tenantId, gatedDraft))?.status).toBe('draft')

        // Open the gate for tenant T only, through a tenant flag row.
        await transaction.insert(tenantFeatureFlags).values({
          tenant_id: t.tenantId,
          feature_key: 'tax_statutory_outputs',
          enabled: true,
          // tenant_feature_flags_enabled_evidence: an enabled row names who enabled it and when.
          enabled_by: approverX,
          enabled_at: new Date(),
        })

        // --- Create B1 (prepared by Y): today .. today+10.
        const created = await createProfile('tenancy-y', definition('B1')).expect(201)
        expect(created.body).toMatchObject({ tenantId: t.tenantId, code: 'B1', status: 'draft', created: true })
        const b1 = created.body.taxProfileId as string

        // --- G-7: replay of code B1 with the VAT flag flipped → conflict, no change.
        await createProfile('tenancy-y', definition('B1', { vatRegistered: false })).expect(409)
        // Dates differ → conflict as well (full-definition replay check, spec §6).
        await createProfile('tenancy-y', definition('B1', { validTo: addDays(today, 11) })).expect(409)
        expect((await profileRow(t.tenantId, b1))?.vatRegistered).toBe(true)

        // --- AC-TEN-16 / G-1: the preparer cannot activate; nothing is written.
        const trailBefore = await trailCounts(t.tenantId, b1)
        const selfApproval = await transition('tenancy-y', b1, 'activate').expect(403)
        expect(selfApproval.body.message).toMatch(/preparer cannot activate/i)
        expect((await profileRow(t.tenantId, b1))?.status).toBe('draft')
        expect(await trailCounts(t.tenantId, b1)).toEqual(trailBefore)

        // --- G-2 / G-4: a different finance.manage user activates; starts today is allowed.
        const approved = await transition('tenancy-x', b1, 'activate').expect(200)
        expect(approved.body).toMatchObject({ taxProfileId: b1, status: 'active' })
        const b1Row = await profileRow(t.tenantId, b1)
        expect(b1Row?.status).toBe('active')
        expect(b1Row?.approvedBy).toBe(approverX)
        expect(b1Row?.approvedAt).toBeInstanceOf(Date)

        // --- AC-TEN-15 / G-3: valid-from yesterday is refused (range touches nothing else).
        const yesterday = addDays(today, -1)
        const b2 = await insertProfile(transaction, {
          tenantId: t.tenantId, createdBy: preparerY, code: 'B2', status: 'draft',
          validFrom: yesterday, validTo: yesterday,
        })
        const trailB2 = await trailCounts(t.tenantId, b2)
        const backdated = await transition('tenancy-x', b2, 'activate').expect(409)
        expect(backdated.body.message).toMatch(/valid-from must be today or later/i)
        expect((await profileRow(t.tenantId, b2))?.status).toBe('draft')
        expect(await trailCounts(t.tenantId, b2)).toEqual(trailB2)

        // Cross-tenant isolation of the overlap check: U's active profile covers
        // B6's whole range, yet T's activation of B6 is not blocked by it.
        await insertProfile(transaction, {
          tenantId: u.tenantId, createdBy: u.financeId, code: 'U-WIDE', status: 'active',
          validFrom: today, validTo: null,
        })

        // --- G-6: adjacent ranges (B1 ends today+10, B6 starts today+11) do not overlap.
        const b6 = await insertProfile(transaction, {
          tenantId: t.tenantId, createdBy: preparerY, code: 'B6', status: 'draft',
          validFrom: addDays(today, 11), validTo: addDays(today, 99),
        })
        await transition('tenancy-x', b6, 'activate').expect(200)
        expect((await profileRow(t.tenantId, b6))?.status).toBe('active')

        // --- AC-TEN-14 / G-5: A active today+100..open; B5 inside it is refused, naming A.
        await insertProfile(transaction, {
          tenantId: t.tenantId, createdBy: preparerY, code: 'A-OPEN', status: 'active',
          validFrom: addDays(today, 100), validTo: null, approvedBy: approverX,
        })
        const b5 = await insertProfile(transaction, {
          tenantId: t.tenantId, createdBy: preparerY, code: 'B5', status: 'draft',
          validFrom: addDays(today, 200), validTo: addDays(today, 300),
        })
        const trailB5 = await trailCounts(t.tenantId, b5)
        const overlap = await transition('tenancy-x', b5, 'activate').expect(409)
        expect(overlap.body.message).toContain('A-OPEN')
        expect((await profileRow(t.tenantId, b5))?.status).toBe('draft')
        expect(await trailCounts(t.tenantId, b5)).toEqual(trailB5)

        // --- Cross-tenant: T's approver cannot see or activate U's draft (404, no change).
        const uDraft = await insertProfile(transaction, {
          tenantId: u.tenantId, createdBy: u.financeId, code: 'U-DRAFT', status: 'draft',
          validFrom: addDays(today, 500), validTo: addDays(today, 501),
        })
        await transition('tenancy-x', uDraft, 'activate').expect(404)
        expect((await profileRow(u.tenantId, uDraft))?.status).toBe('draft')
        // ...and U's own finance user is still gated (no flag row for U).
        await transition('tenancy-u', uDraft, 'activate').expect(503)

        // T's resolver now picks B1 (in force today), never U-WIDE.
        await expect(resolveTaxRates(transaction, t.tenantId, new Date())).resolves.toMatchObject({
          source: 'profile',
          profileId: b1,
          profileCode: 'B1',
        })
      } finally {
        await app.close()
      }
    })

    const leaked = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, observedTenantId)).limit(1)
    expect(leaked).toHaveLength(0)
  }, 60_000)
})
