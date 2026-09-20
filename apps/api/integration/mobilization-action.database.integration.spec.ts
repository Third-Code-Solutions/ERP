import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { auditLog, db, mobilizationReadiness, projects, tenants, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ profile: vi.fn(), refresh: vi.fn() }))
vi.mock('@third-code-erp/auth', async original => ({ ...await original<typeof import('@third-code-erp/auth')>(), requireUserProfile: boundary.profile }))
vi.mock('next/cache', () => ({ revalidatePath: boundary.refresh }))
vi.mock('../../web/node_modules/next/cache.js', () => ({ revalidatePath: boundary.refresh }))
import { recordMobilizationInput, startMobilization } from '../../web/src/app/(dashboard)/projects/[id]/permits/actions'
import * as audit from '../../web/src/lib/audit'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) throw new Error('Mobilization proof requires synthetic loopback PostgreSQL')
})
beforeEach(() => { vi.restoreAllMocks(); boundary.profile.mockReset(); boundary.refresh.mockReset() })
const inputs = ['commented_fcd_received_at', 'po_copies_received_at', 'cari_received_at', 'ntp_received_at'] as const
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic mobilization tenant', slug: `mobilization-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic admin', email: `${userId}@integration.test`, role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic mobilization project', client: 'Synthetic', created_by: userId })
  })
  const profile = { user: { id: userId }, tenantId, role: 'admin', email: `${userId}@integration.test` }
  boundary.profile.mockResolvedValue(profile)
  const snapshot = async () => ({
    readiness: await db.select().from(mobilizationReadiness).where(eq(mobilizationReadiness.tenant_id, tenantId)).orderBy(asc(mobilizationReadiness.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, tenantId)).orderBy(asc(auditLog.id)),
  })
  return { tenantId, userId, projectId, profile, snapshot }
}

function holdFirstAudit() {
  const write = audit.writeAuditLogInTransaction
  let release = () => {}, entered = () => {}, pid = 0, first = true
  const gate = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { entered = resolve })
  vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementation(async (tx, params) => {
    await write(tx, params)
    if (first) {
      first = false
      pid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))[0]!.pid
      entered()
      await gate
    }
  })
  return { ready, release, pid: () => pid }
}
async function expectBlockedBy(pid: number) {
  await vi.waitFor(async () => {
    const rows = await db.execute<{ pid: number }>(sql`select pid from pg_stat_activity where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))`)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.pid).not.toBe(pid)
  }, { timeout: 2000 })
}

(enabled ? describe : describe.skip)('Mounted mobilization actions with real PostgreSQL and audit', () => {
  it.each(['not-a-date', '2026-02-30', '2026-13-01', '2026-09-13T00:00:00+99:99', '2026-09-13T00:00:00+24:00'])('rejects supplied invalid date %s instead of inventing a return', async raw => {
    const f = await fixture(), before = await f.snapshot()
    const result = await recordMobilizationInput(f.projectId, inputs[0], raw)
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(result).not.toHaveProperty('unconfirmed')
    expect(await f.snapshot()).toEqual(before)
  })
  it.each(['suspended', 'demoted', 'inactive-tenant'] as const)('rejects stale profile when DB authority is %s for both actions', async state => {
    const f = await fixture()
    const changed = { status_reason: 'Synthetic lifecycle change', status_changed_at: new Date(), status_changed_by: f.userId }
    if (state === 'demoted') await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    else if (state === 'suspended') await db.update(users).set({ account_status: 'suspended', ...changed }).where(eq(users.id, f.userId))
    else await db.update(tenants).set({ status: 'suspended', ...changed }).where(eq(tenants.id, f.tenantId))
    const before = await f.snapshot()
    expect.soft(await recordMobilizationInput(f.projectId, inputs[0], '2026-09-13')).toMatchObject({ error: expect.any(String) })
    expect.soft(await startMobilization(f.projectId, 'Authorized synthetic override')).toMatchObject({ error: expect.any(String) })
    expect(await f.snapshot()).toEqual(before)
  })
  it('returns exact persisted receipts, deduplicates identical evidence, and requires all four returns before start', async () => {
    const f = await fixture()
    expect(await startMobilization(f.projectId)).toMatchObject({ error: expect.any(String) })
    for (const input of inputs) {
      const receipt = await recordMobilizationInput(f.projectId, input, '2026-09-13')
      expect(receipt).toMatchObject({ projectId: f.projectId, inputType: input, receivedAt: '2026-09-13T00:00:00.000Z' })
      const saved = await f.snapshot()
      expect(await recordMobilizationInput(f.projectId, input, '2026-09-13')).toEqual(receipt)
      expect(await f.snapshot()).toEqual(saved)
    }
    const started = await startMobilization(f.projectId)
    expect(started).toMatchObject({ projectId: f.projectId, startedAt: expect.any(String) })
    const saved = await f.snapshot()
    expect(await startMobilization(f.projectId)).toEqual(started)
    expect(await recordMobilizationInput(f.projectId, inputs[3], '2026-09-13')).toEqual({
      projectId: f.projectId, inputType: inputs[3], receivedAt: '2026-09-13T00:00:00.000Z',
    })
    expect(await recordMobilizationInput(f.projectId, inputs[0], '2026-09-14')).toMatchObject({ error: expect.any(String) })
    expect(await f.snapshot()).toEqual(saved)
  })
  it('preserves an authorized override and returns its original start receipt on retry', async () => {
    const f = await fixture()
    const result = await startMobilization(f.projectId, 'Synthetic approved early start')
    expect(result).toMatchObject({ projectId: f.projectId, startedAt: expect.any(String) })
    const saved = await f.snapshot()
    expect(saved.readiness[0]).toMatchObject({ override_reason: 'Synthetic approved early start', override_by: f.userId, started_by: f.userId })
    expect(await startMobilization(f.projectId, 'Different later explanation')).toEqual(result)
    expect(await f.snapshot()).toEqual(saved)
  })
  it('denies foreign scope and denies an override to a current non-override permit manager', async () => {
    const f = await fixture(), other = await fixture(), before = await other.snapshot()
    boundary.profile.mockResolvedValue(f.profile)
    expect(await recordMobilizationInput(other.projectId, inputs[0], '2026-09-13')).toMatchObject({ error: expect.any(String) })
    expect(await startMobilization(other.projectId, 'Synthetic override')).toMatchObject({ error: expect.any(String) })
    expect(await other.snapshot()).toEqual(before)
    await db.update(users).set({ role: 'sd_pm_pe' }).where(eq(users.id, f.userId))
    // Keep stale admin profile: the current DB role controls the override.
    expect(await startMobilization(f.projectId, 'Unauthorized override')).toMatchObject({ error: expect.any(String) })
    expect((await f.snapshot()).readiness).toHaveLength(0)
  })
  it.each(['record', 'start'] as const)('rolls back real %s audit and readiness on post-audit failure', async command => {
    const f = await fixture(), before = await f.snapshot(), write = audit.writeAuditLogInTransaction
    vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementationOnce(async (tx, params) => { await write(tx, params); throw new Error('Synthetic audit failure') })
    const result = command === 'record' ? await recordMobilizationInput(f.projectId, inputs[0], '2026-09-13') : await startMobilization(f.projectId, 'Synthetic override')
    expect(result).toMatchObject({ error: expect.any(String), unconfirmed: true })
    expect(await f.snapshot()).toEqual(before)
  })
  it.each(['record', 'start'] as const)('returns the committed %s receipt with warning when cache refresh fails', async command => {
    const f = await fixture()
    boundary.refresh.mockImplementationOnce(() => { throw new Error('Synthetic refresh failure') })
    const result = command === 'record' ? await recordMobilizationInput(f.projectId, inputs[0], '2026-09-13') : await startMobilization(f.projectId, 'Synthetic override')
    expect(result).toMatchObject({ projectId: f.projectId, refreshWarning: expect.any(String) })
    expect(result).not.toHaveProperty('error')
    expect((await f.snapshot()).readiness).toHaveLength(1)
  })
  it('serializes concurrent first receipts on separate connections without lost evidence or unique-key failure', async () => {
    const f = await fixture(), barrier = holdFirstAudit()
    const first = recordMobilizationInput(f.projectId, inputs[0], '2026-09-13')
    await barrier.ready
    const second = recordMobilizationInput(f.projectId, inputs[1], '2026-09-14')
    try { await expectBlockedBy(barrier.pid()) } finally { barrier.release() }
    const results = await Promise.all([first, second])
    expect.soft(results[0]).toMatchObject({ receivedAt: '2026-09-13T00:00:00.000Z' })
    expect.soft(results[1]).toMatchObject({ receivedAt: '2026-09-14T00:00:00.000Z' })
    const state = await f.snapshot()
    expect(state.readiness).toHaveLength(1)
    expect(state.readiness[0]).toMatchObject({ commented_fcd_received_at: new Date('2026-09-13'), po_copies_received_at: new Date('2026-09-14') })
    // Row-trigger audit is additional evidence; count the two command receipts.
    expect(state.audit.filter(row => row.entity_type === 'mobilization_readiness' && row.action === 'update'
      && row.diff !== null && typeof row.diff === 'object' && 'input_type' in row.diff)).toHaveLength(2)
  })
  it('serializes concurrent starts into one original receipt and one semantic start audit', async () => {
    const f = await fixture()
    for (const input of inputs) await recordMobilizationInput(f.projectId, input, '2026-09-13')
    const barrier = holdFirstAudit()
    const first = startMobilization(f.projectId)
    await barrier.ready
    const second = startMobilization(f.projectId)
    try { await expectBlockedBy(barrier.pid()) } finally { barrier.release() }
    const results = await Promise.all([first, second])
    expect(results[0]).toMatchObject({ startedAt: expect.any(String) })
    expect(results[1]).toEqual(results[0])
    const state = await f.snapshot()
    expect(state.audit.filter(row => row.entity_type === 'mobilization_readiness' && row.action === 'status_change')).toHaveLength(1)
  })
  it('waits for the final committed return before admitting a concurrent start', async () => {
    const f = await fixture()
    for (const input of inputs.slice(0, 3)) await recordMobilizationInput(f.projectId, input, '2026-09-13')
    const barrier = holdFirstAudit()
    const receipt = recordMobilizationInput(f.projectId, inputs[3], '2026-09-13')
    await barrier.ready
    const start = startMobilization(f.projectId)
    try { await expectBlockedBy(barrier.pid()) } finally { barrier.release() }
    expect(await receipt).toMatchObject({ receivedAt: '2026-09-13T00:00:00.000Z' })
    expect(await start).toMatchObject({ startedAt: expect.any(String) })
    const state = await f.snapshot()
    expect(state.readiness[0]).toMatchObject({ ntp_received_at: new Date('2026-09-13'), override_reason: null })
    expect(state.audit.filter(row => row.entity_type === 'mobilization_readiness' && row.action === 'status_change')).toHaveLength(1)
  })
})
