import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { db, tenants, users, projects, costCodes, costEntries, auditLog, costEntryCreateRequests, costEntryDeleteRequests, costEntryRestoreRequests } from '@third-code-erp/database'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { CostEntryCreationService } from '../src/projects/cost-entry-creation.service'
import { CostEntryDeletionService } from '../src/projects/cost-entry-deletion.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) {
    throw new Error('Manual cost proof requires synthetic loopback PostgreSQL')
  }
})

async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID(), costCodeId = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic manual cost', slug: `cost-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic writer', email: `${userId}@integration.test`, role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic project', client: 'Synthetic', created_by: userId })
    await tx.insert(costCodes).values({ id: costCodeId, tenant_id: tenantId, code: 'MAT', name: 'Material', category: 'material' })
  })
  const principal = { tenantId, userId, role: 'admin' as const, email: `${userId}@integration.test` }
  const config = new ConfigService({
    ERP_COST_ENTRY_CREATE_WRITES_ENABLED: true, ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS: [tenantId],
    ERP_COST_ENTRY_DELETE_WRITES_ENABLED: true, ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS: [tenantId],
    ERP_COST_ENTRY_RESTORE_WRITES_ENABLED: true, ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS: [tenantId],
  })
  const audit = new AuditService()
  const creation = new CostEntryCreationService(config, new DatabaseService(), audit)
  const deletion = new CostEntryDeletionService(config, new DatabaseService(), audit)
  const command = { costCodeId, costCategory: 'material' as const, description: 'Exact material', amountCents: 125, quantity: 1, unit: null, incurredAt: null, referenceNumber: null, notes: null }
  const snapshot = async () => ({
    entries: await db.select().from(costEntries).where(eq(costEntries.tenant_id, tenantId)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, tenantId)),
    createRequests: await db.select().from(costEntryCreateRequests).where(eq(costEntryCreateRequests.tenant_id, tenantId)),
    voidRequests: await db.select().from(costEntryDeleteRequests).where(eq(costEntryDeleteRequests.tenant_id, tenantId)),
    restoreRequests: await db.select().from(costEntryRestoreRequests).where(eq(costEntryRestoreRequests.tenant_id, tenantId)),
  })
  return { tenantId, userId, projectId, principal, creation, deletion, command, snapshot }
}

describe.skipIf(!enabled)('manual cost current authority and receipts', () => {
  it('replays create, void and restore for the original actor without new audit or changed financial data', async () => {
    const f = await fixture()
    const key = randomUUID()
    const created = await f.creation.create(f.projectId, f.command, f.principal, key)
    let before = await f.snapshot()
    expect(await f.creation.create(f.projectId, f.command, f.principal, key)).toEqual(created)
    expect(await f.snapshot()).toEqual(before)
    expect(created.amountCents).toBe(125)
    const voidKey = randomUUID()
    const voided = await f.deletion.delete(f.projectId, created.id, 'Correction', f.principal, voidKey)
    before = await f.snapshot()
    expect(await f.deletion.delete(f.projectId, created.id, 'Correction', f.principal, voidKey)).toEqual(voided)
    expect(await f.snapshot()).toEqual(before)
    const restoreKey = randomUUID()
    const restored = await f.deletion.restore(f.projectId, created.id, 'Restore', f.principal, restoreKey)
    before = await f.snapshot()
    expect(await f.deletion.restore(f.projectId, created.id, 'Restore', f.principal, restoreKey)).toEqual(restored)
    expect(await f.snapshot()).toEqual(before)
  })

  it.each(['actor', 'tenant'] as const)('rejects a contended %s admission without waiting for the holder', async target => {
    const f = await fixture()
    const before = await f.snapshot()
    let release = () => {}
    let ready = () => {}
    const held = new Promise<void>(resolve => { ready = resolve })
    const released = new Promise<void>(resolve => { release = resolve })
    const holder = db.transaction(async tx => {
      if (target === 'actor') await tx.execute(sql`select id from public.users where id = ${f.userId}::uuid for update`)
      else await tx.execute(sql`select id from public.tenants where id = ${f.tenantId}::uuid for update`)
      ready()
      await released
    })
    try {
      await Promise.race([held, holder])
      const start = Date.now()
      await expect(f.creation.create(f.projectId, f.command, f.principal, randomUUID())).rejects.toThrow()
      expect(Date.now() - start).toBeLessThan(2_500)
    } finally {
      release()
      await holder
    }
    expect(await f.snapshot()).toEqual(before)
  })

  it.each(['project', 'cost-code'] as const)('rejects a foreign tenant %s on create without changing either tenant', async target => {
    const f = await fixture(), other = await fixture()
    const before = [await f.snapshot(), await other.snapshot()]
    await expect(f.creation.create(
      target === 'project' ? other.projectId : f.projectId,
      target === 'cost-code' ? { ...f.command, costCodeId: other.command.costCodeId } : f.command,
      f.principal,
      randomUUID(),
    )).rejects.toThrow()
    expect([await f.snapshot(), await other.snapshot()]).toEqual(before)
  })

  it.each(['void', 'restore'] as const)('rejects foreign tenant entry %s without changing either tenant', async operation => {
    const f = await fixture(), other = await fixture()
    const created = await other.creation.create(other.projectId, other.command, other.principal, randomUUID())
    if (operation === 'restore') await other.deletion.delete(other.projectId, created.id, 'Correction', other.principal, randomUUID())
    const before = [await f.snapshot(), await other.snapshot()]
    const result = operation === 'void'
      ? f.deletion.delete(other.projectId, created.id, 'Correction', f.principal, randomUUID())
      : f.deletion.restore(other.projectId, created.id, 'Restore', f.principal, randomUUID())
    await expect(result).rejects.toThrow()
    expect([await f.snapshot(), await other.snapshot()]).toEqual(before)
  })

  it.each(['import', 'po_derived'] as const)('does not void system-managed %s costs', async source => {
    const f = await fixture()
    const created = await f.creation.create(f.projectId, f.command, f.principal, randomUUID())
    await db.update(costEntries).set({ cost_source: source }).where(eq(costEntries.id, created.id))
    const before = await f.snapshot()
    await expect(f.deletion.delete(f.projectId, created.id, 'Correction', f.principal, randomUUID())).rejects.toBeInstanceOf(ConflictException)
    expect(await f.snapshot()).toEqual(before)
  })

  for (const operation of ['create', 'void', 'restore'] as const) {
    it(`${operation} completes its receipt when the application clock trails PostgreSQL`, async () => {
      const f = await fixture()
      const created = operation === 'create' ? null : await f.creation.create(f.projectId, f.command, f.principal, randomUUID())
      if (operation === 'restore' && created) await f.deletion.delete(f.projectId, created.id, 'Correction', f.principal, randomUUID())
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2000-01-01T00:00:00.000Z'))
      try {
        if (operation === 'create') await f.creation.create(f.projectId, f.command, f.principal, randomUUID())
        else if (operation === 'void') await f.deletion.delete(f.projectId, created!.id, 'Correction', f.principal, randomUUID())
        else await f.deletion.restore(f.projectId, created!.id, 'Restore', f.principal, randomUUID())
      } finally {
        vi.useRealTimers()
      }
      const state = await f.snapshot()
      const requests = operation === 'create' ? state.createRequests : operation === 'void' ? state.voidRequests : state.restoreRequests
      expect(requests).toHaveLength(1)
      expect(requests[0]!.state).toBe('succeeded')
      expect(requests[0]!.completed_at!.getTime()).toBeGreaterThanOrEqual(requests[0]!.created_at.getTime())
    })
    it.each(['account', 'tenant', 'role'] as const)(`${operation} denies a fresh command after current %s authority changes`, async scenario => {
      const f = await fixture()
      const created = operation === 'create' ? null : await f.creation.create(f.projectId, f.command, f.principal, randomUUID())
      if (operation === 'restore' && created) await f.deletion.delete(f.projectId, created.id, 'Correction', f.principal, randomUUID())
      const suspension = { status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: f.userId }
      if (scenario === 'account') await db.update(users).set({ account_status: 'suspended', ...suspension }).where(eq(users.id, f.userId))
      if (scenario === 'tenant') await db.update(tenants).set({ status: 'suspended', ...suspension }).where(eq(tenants.id, f.tenantId))
      if (scenario === 'role') await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
      const before = await f.snapshot()
      const result = operation === 'create' ? f.creation.create(f.projectId, f.command, f.principal, randomUUID())
        : operation === 'void' ? f.deletion.delete(f.projectId, created!.id, 'Correction', f.principal, randomUUID())
          : f.deletion.restore(f.projectId, created!.id, 'Restore', f.principal, randomUUID())
      await expect(result).rejects.toBeInstanceOf(ForbiddenException)
      expect(await f.snapshot()).toEqual(before)
    })
    it.each(['account', 'tenant', 'other-actor'] as const)(`${operation} rejects %s after the initial command`, async scenario => {
      const f = await fixture()
      const key = randomUUID()
      const created = await f.creation.create(f.projectId, f.command, f.principal, operation === 'create' ? key : randomUUID())
      if (operation !== 'create') await f.deletion.delete(f.projectId, created.id, 'Correction', f.principal, operation === 'void' ? key : randomUUID())
      if (operation === 'restore') await f.deletion.restore(f.projectId, created.id, 'Restore correction', f.principal, key)
      let principal = f.principal
      const suspension = { status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: f.userId }
      if (scenario === 'account') await db.update(users).set({ account_status: 'suspended', ...suspension }).where(eq(users.id, f.userId))
      if (scenario === 'tenant') await db.update(tenants).set({ status: 'suspended', ...suspension }).where(eq(tenants.id, f.tenantId))
      if (scenario === 'other-actor') {
        const userId = randomUUID()
        await db.insert(users).values({ id: userId, tenant_id: f.tenantId, full_name: 'Other synthetic writer', email: `${userId}@integration.test`, role: 'admin' })
        principal = { ...principal, userId }
      }
      const before = await f.snapshot()
      const result = operation === 'create' ? f.creation.create(f.projectId, f.command, principal, key)
        : operation === 'void' ? f.deletion.delete(f.projectId, created.id, 'Correction', principal, key)
          : f.deletion.restore(f.projectId, created.id, 'Restore correction', principal, key)
      await expect(result).rejects.toBeInstanceOf(scenario === 'other-actor' ? ConflictException : ForbiddenException)
      expect(await f.snapshot()).toEqual(before)
    })
  }
})
