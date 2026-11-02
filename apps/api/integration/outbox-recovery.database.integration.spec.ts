import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { db } from '@third-code-erp/database'
import { providerDeliveryAttempts, providerDeliveryOutbox, sapPostingAttempts, sapPostingOutbox, tenantFeatureFlags, tenants, users } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../src/database/database.service'
import { ResendAndSemaphoreAdapter, RoadmapIntegrationService, SapHttpAdapter, type ProviderSendResult } from '../src/roadmap/roadmap-integration.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
if (enabled) {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !(/^\/(?:erp_(?:turnover_audit|self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/.test(target.pathname) ||
      (process.env.GITHUB_ACTIONS === 'true' && target.port === '54322' && target.pathname === '/postgres'))) {
    throw new Error('Outbox tests require an explicitly enabled loopback disposable database')
  }
}

describe.skipIf(!enabled)('outbox crash recovery against PostgreSQL', () => {
  let tenantId: string
  let actorId: string
  const config = new ConfigService({ RESEND_API_KEY: 'synthetic', EMAIL_FROM: 'fixture@example.invalid', SAP_API_URL: 'https://sap.example.invalid', SAP_API_TOKEN: 'synthetic' })
  const providers = new ResendAndSemaphoreAdapter(config)
  const sap = new SapHttpAdapter(config)
  const service = new RoadmapIntegrationService(new DatabaseService(), providers, sap)

  beforeEach(async () => {
    tenantId = randomUUID()
    actorId = randomUUID()
    await db.insert(tenants).values({ id: tenantId, name: 'Outbox recovery fixture', slug: `outbox-${tenantId}` })
    await db.insert(users).values({ id: actorId, tenant_id: tenantId, full_name: 'Fixture Admin', email: `${actorId}@example.invalid`, role: 'admin' })
    await db.insert(tenantFeatureFlags).values(['provider_delivery', 'sap_posting'].map((feature_key) => ({ tenant_id: tenantId, feature_key, enabled: true, enabled_by: actorId, enabled_at: new Date() })))
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await db.update(tenantFeatureFlags).set({ enabled: false, enabled_by: null, enabled_at: null }).where(eq(tenantFeatureFlags.tenant_id, tenantId))
  })
  afterAll(async () => { await db.$client.end({ timeout: 5 }) })

  async function delivery(overrides: Partial<typeof providerDeliveryOutbox.$inferInsert> = {}) {
    const [row] = await db.insert(providerDeliveryOutbox).values({ tenant_id: tenantId, channel: 'email', provider: 'resend', event_type: 'fixture', aggregate_type: 'fixture', aggregate_id: randomUUID(), recipient: 'fixture@example.invalid', body: 'Synthetic delivery', template_version: '1', idempotency_key: randomUUID(), created_by: actorId, ...overrides }).returning()
    return row!
  }
  async function posting(overrides: Partial<typeof sapPostingOutbox.$inferInsert> = {}) {
    const [row] = await db.insert(sapPostingOutbox).values({ tenant_id: tenantId, aggregate_type: 'fixture', aggregate_id: randomUUID(), posting_type: 'cost_posting', payload: {}, idempotency_key: randomUUID(), created_by: actorId, ...overrides }).returning()
    return row!
  }

  it('recovers expired claims once without resending and leaves live claims alone', async () => {
    const stale = { status: 'processing', attempt_count: 1, updated_at: new Date(Date.now() - 6 * 60_000) }
    const oldDelivery = await delivery(stale)
    const oldPosting = await posting(stale)
    const liveDelivery = await delivery({ status: 'processing', attempt_count: 1 })
    const livePosting = await posting({ status: 'processing', attempt_count: 1 })
    const send = vi.spyOn(providers, 'send')
    const post = vi.spyOn(sap, 'post')
    await Promise.all([service.sweepProviderDeliveries(0), service.sweepSapPostings(0)])
    await Promise.all([service.sweepProviderDeliveries(0), service.sweepSapPostings(0)])
    expect(send).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect((await db.select().from(providerDeliveryOutbox).where(eq(providerDeliveryOutbox.id, oldDelivery.id)))[0]).toMatchObject({ status: 'dead_letter', last_error: expect.stringContaining('OUTCOME_UNKNOWN'), attempt_count: 1 })
    expect((await db.select().from(sapPostingOutbox).where(eq(sapPostingOutbox.id, oldPosting.id)))[0]).toMatchObject({ status: 'dead_letter', last_error: expect.stringContaining('OUTCOME_UNKNOWN'), attempt_count: 1 })
    expect(await db.select().from(providerDeliveryAttempts).where(eq(providerDeliveryAttempts.delivery_id, oldDelivery.id))).toHaveLength(1)
    expect(await db.select().from(sapPostingAttempts).where(eq(sapPostingAttempts.sap_posting_id, oldPosting.id))).toHaveLength(1)
    expect((await db.select().from(providerDeliveryOutbox).where(eq(providerDeliveryOutbox.id, liveDelivery.id)))[0]?.status).toBe('processing')
    expect((await db.select().from(sapPostingOutbox).where(eq(sapPostingOutbox.id, livePosting.id)))[0]?.status).toBe('processing')
  })

  it('fences a late provider response after another worker recovers its lease', async () => {
    const row = await delivery()
    let complete!: (result: ProviderSendResult) => void
    let claimed!: () => void
    const started = new Promise<void>((resolve) => { claimed = resolve })
    vi.spyOn(providers, 'send').mockImplementation(() => {
      claimed()
      return new Promise((resolve) => { complete = resolve })
    })
    const running = service.sweepProviderDeliveries(1)
    await started
    await db.update(providerDeliveryOutbox).set({ updated_at: new Date(Date.now() - 6 * 60_000) }).where(eq(providerDeliveryOutbox.id, row.id))
    await service.sweepProviderDeliveries(0)
    complete({ messageId: 'late-response', statusCode: 200 })
    await running
    expect((await db.select().from(providerDeliveryOutbox).where(eq(providerDeliveryOutbox.id, row.id)))[0]).toMatchObject({ status: 'dead_letter', provider_message_id: null })
    expect(await db.select().from(providerDeliveryAttempts).where(eq(providerDeliveryAttempts.delivery_id, row.id))).toHaveLength(1)
  })

  it('preserves uncertain timeouts for reconciliation instead of issuing duplicate side effects', async () => {
    const email = await delivery()
    const ledger = await posting()
    const send = vi.spyOn(providers, 'send').mockRejectedValue(new Error('Request timed out after send'))
    const post = vi.spyOn(sap, 'post').mockRejectedValue(new Error('Request timed out after posting'))
    await service.sweepProviderDeliveries(1)
    await service.sweepSapPostings(1)
    expect(await service.sweepProviderDeliveries(1)).toBe(0)
    expect(await service.sweepSapPostings(1)).toBe(0)
    expect(send).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect((await db.select().from(providerDeliveryOutbox).where(eq(providerDeliveryOutbox.id, email.id)))[0]?.status).toBe('dead_letter')
    expect((await db.select().from(sapPostingOutbox).where(eq(sapPostingOutbox.id, ledger.id)))[0]?.status).toBe('dead_letter')
  })

  it('retries explicit rate-limit rejection with the same idempotency key', async () => {
    const email = await delivery()
    const ledger = await posting()
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }))
    vi.stubGlobal('fetch', fetcher)
    await service.sweepProviderDeliveries(1)
    await service.sweepSapPostings(1)
    expect((await db.select().from(providerDeliveryOutbox).where(eq(providerDeliveryOutbox.id, email.id)))[0]).toMatchObject({ status: 'pending', attempt_count: 1, idempotency_key: email.idempotency_key })
    expect((await db.select().from(sapPostingOutbox).where(eq(sapPostingOutbox.id, ledger.id)))[0]).toMatchObject({ status: 'pending', attempt_count: 1, idempotency_key: ledger.idempotency_key })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
