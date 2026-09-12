import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { accounts, auditLog, db, opportunities, siteInspectionRfis, siteInspections, tenants, users } from '@third-code-erp/database'
import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as auditWriter from '@/lib/audit'
import { siteInspectionWorkflowService as service, type SiteInspectionRfiCommand } from '@/server/crm/site-inspection-workflow-service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip

beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('RFI workflow proof requires an explicit loopback disposable DATABASE_URL')
  }
})
afterEach(() => vi.restoreAllMocks())

// Actual Drizzle service/store and committed UUID-isolated synthetic fixtures.
// Preserve all fixtures and immutable audit history; no hosted calls or cleanup.
async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const otherUserId = randomUUID()
  const accountId = randomUUID()
  const opportunityId = randomUUID()
  const inspectionId = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic RFI tenant', slug: `rfi-${tenantId}` })
    await tx.insert(users).values([userId, otherUserId].map(id => ({ id, tenant_id: tenantId, email: `rfi-${id}@integration.test`, full_name: 'Synthetic RFI commercial', role: 'commercial' as const })))
    await tx.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: 'Synthetic RFI account', industry: 'office', kyc_status: 'approved', created_by: userId })
    await tx.insert(opportunities).values({ id: opportunityId, tenant_id: tenantId, account_id: accountId, rep_id: userId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
    await tx.insert(siteInspections).values({ id: inspectionId, tenant_id: tenantId, opportunity_id: opportunityId, payload: {}, status: 'submitted', submitted_by: userId, submitted_at: new Date() })
  })
  const command: SiteInspectionRfiCommand = { kind: 'rfi_creation', submissionId: randomUUID(), opportunityId, inspectionId, description: 'Confirm synthetic electrical clearance', priority: 'major' }
  return { tenantId, userId, otherUserId, opportunityId, inspectionId, principal: { tenantId, userId }, command }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function state(f: Fixture) {
  const rfis = await db.select().from(siteInspectionRfis).where(eq(siteInspectionRfis.tenant_id, f.tenantId)).orderBy(asc(siteInspectionRfis.id))
  const audits = await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id))
  return { rfis, audits }
}

function receiptRows(snapshot: Awaited<ReturnType<typeof state>>) {
  return snapshot.audits.filter(a => a.entity_type === 'site_inspection_rfi' && a.action === 'create' && typeof a.diff === 'object' && a.diff !== null && 'source' in a.diff && a.diff.source === 'site_inspection_rfi_workflow_service')
}

function databaseCode(error: unknown): unknown {
  if (!(error instanceof Error)) return undefined
  return 'code' in error ? error.code : databaseCode(error.cause)
}

suite('Inspection RFI durable workflow PostgreSQL', () => {
  it('commits one RFI/receipt and recovers exact replay after a lost response', async () => {
    const f = await fixture()
    const first = await service.createRfi(f.principal, f.command)
    expect(first).toMatchObject({ ok: true, replayed: false, actorId: f.userId, tenantId: f.tenantId, inspectionId: f.inspectionId })
    const committed = await state(f)
    expect(committed.rfis).toHaveLength(1)
    expect(committed.rfis[0]).toMatchObject({ description: f.command.description, priority: f.command.priority })
    expect(receiptRows(committed)).toHaveLength(1)
    expect(await service.createRfi(f.principal, f.command)).toEqual({ ...first, replayed: true })
    expect(await state(f)).toEqual(committed)
  })

  it('serializes concurrent exact commands into one committed RFI and receipt', async () => {
    const f = await fixture()
    const results = await Promise.all([service.createRfi(f.principal, f.command), service.createRfi(f.principal, f.command)])
    expect(results.every(result => result.ok && result.kind === 'rfi_creation')).toBe(true)
    expect(results.map(result => result.ok && result.replayed).sort()).toEqual([false, true])
    const committed = await state(f)
    expect(committed.rfis).toHaveLength(1)
    expect(receiptRows(committed)).toHaveLength(1)
  })

  it('rejects changed content or actor for an accepted key without any new effects', async () => {
    const f = await fixture()
    expect(await service.createRfi(f.principal, f.command)).toMatchObject({ ok: true })
    const committed = await state(f)
    for (const changed of [{ ...f.command, description: 'Different content' }, { ...f.command, priority: 'minor' as const }]) {
      expect(await service.createRfi(f.principal, changed)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    }
    expect(await service.createRfi({ ...f.principal, userId: f.otherUserId }, f.command)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(await state(f)).toEqual(committed)
  })

  it('conceals foreign tenant and mismatched inspection targets without writes', async () => {
    const f = await fixture()
    const foreign = await fixture()
    const before = await state(f)
    const foreignBefore = await state(foreign)
    expect(await service.createRfi(foreign.principal, f.command)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await service.createRfi(f.principal, { ...f.command, inspectionId: foreign.inspectionId })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await state(f)).toEqual(before)
    expect(await state(foreign)).toEqual(foreignBefore)
  })

  it('rolls back inserted RFI and trigger evidence if semantic receipt writing fails', async () => {
    const f = await fixture()
    const before = await state(f)
    const audit = vi.spyOn(auditWriter, 'writeAuditLogInTransaction').mockRejectedValueOnce(new Error('Synthetic audit failure'))
    expect(await service.createRfi(f.principal, f.command)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(audit).toHaveBeenCalledOnce()
    expect(await state(f)).toEqual(before)
    audit.mockRestore()
    expect(await service.createRfi(f.principal, f.command)).toMatchObject({ ok: true, replayed: false })
    expect(receiptRows(await state(f))).toHaveLength(1)
  })

  it('holds actor and tenant admissions through the semantic audit transaction', async () => {
    const f = await fixture()
    const originalAudit = auditWriter.writeAuditLogInTransaction
    const audit = vi.spyOn(auditWriter, 'writeAuditLogInTransaction').mockImplementationOnce(async (tx, params) => {
      // Separate connections attempt conflicting row locks, never mutations.
      const actorError = await db.transaction(other => other.select({ id: users.id }).from(users).where(and(eq(users.id, f.userId), eq(users.tenant_id, f.tenantId))).for('update', { noWait: true })).catch((error: unknown) => error)
      expect(databaseCode(actorError)).toBe('55P03')
      const tenantError = await db.transaction(other => other.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, f.tenantId)).for('update', { noWait: true })).catch((error: unknown) => error)
      expect(databaseCode(tenantError)).toBe('55P03')
      await originalAudit(tx, params)
    })
    expect(await service.createRfi(f.principal, f.command)).toMatchObject({ ok: true, replayed: false })
    expect(audit).toHaveBeenCalledOnce()
    expect(receiptRows(await state(f))).toHaveLength(1)
  })

  it.each(['invited', 'suspended', 'disabled'] as const)('rejects a freshly %s actor despite a stale principal', async accountStatus => {
    const f = await fixture()
    await db.update(users).set({ account_status: accountStatus, status_reason: 'Synthetic lifecycle test', status_changed_at: new Date(), status_changed_by: f.otherUserId }).where(and(eq(users.id, f.userId), eq(users.tenant_id, f.tenantId)))
    const before = await state(f)
    expect(await service.createRfi(f.principal, f.command)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await state(f)).toEqual(before)
  })

  it.each(['suspended', 'disabled'] as const)('rejects a freshly %s tenant despite a stale principal', async status => {
    const f = await fixture()
    await db.update(tenants).set({ status, status_reason: 'Synthetic lifecycle test', status_changed_at: new Date(), status_changed_by: f.otherUserId }).where(eq(tenants.id, f.tenantId))
    const before = await state(f)
    expect(await service.createRfi(f.principal, f.command)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await state(f)).toEqual(before)
  })
})
