import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { auditLog, awardHandoffs, boms, db, invoices, masterSchedules, processSteps, projectBudgets, projects, slaClocks, taskInstances, tenants, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ profile: vi.fn(), revalidate: vi.fn() }))
vi.mock('@third-code-erp/auth', async original => ({ ...await original<typeof import('@third-code-erp/auth')>(), requireUserProfile: boundary.profile }))
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidate }))
vi.mock('../../web/node_modules/next/cache.js', () => ({ revalidatePath: boundary.revalidate }))
import { awardLockedBom, reverseAwardHandoff } from '../../web/src/app/(dashboard)/projects/[id]/bom/award-actions'
import * as audit from '../../web/src/lib/audit'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) throw new Error('Award reversal proof requires synthetic loopback PostgreSQL')
})
beforeEach(() => { vi.restoreAllMocks(); boundary.profile.mockReset(); boundary.revalidate.mockReset() })

async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID(), bomId = randomUUID(), budgetId = randomUUID(), invoiceId = randomUUID(), trackerId = randomUUID(), handoffId = randomUUID(), stepId = randomUUID(), taskId = randomUUID(), clockId = randomUUID()
  const taskIds = { arProjectCode: taskId, downPaymentInvoice: randomUUID(), cari: randomUUID(), projectTracker: randomUUID(), cxOnboarding: randomUUID() }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic reversal tenant', slug: `reversal-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic admin', email: `${userId}@integration.test`, role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic award project', client: 'Synthetic', created_by: userId })
    await tx.insert(boms).values({ id: bomId, tenant_id: tenantId, project_id: projectId, created_by: userId, approved_by: userId, status: 'locked', total_cost_cents: 800000, tcv_cents: 1000000, gp_cents: 200000, gp_margin_bps: 2000, approved_at: new Date() })
    await tx.insert(projectBudgets).values({ id: budgetId, tenant_id: tenantId, project_id: projectId, source_bom_id: bomId, revision: 1, status: 'draft', effective_from: '2026-09-13', revision_reason: 'Synthetic reversal proof', created_by: userId })
    await tx.insert(invoices).values({ id: invoiceId, tenant_id: tenantId, project_id: projectId, created_by: userId, invoice_number: `DP-${invoiceId}`, status: 'draft' })
    await tx.insert(masterSchedules).values({ id: trackerId, tenant_id: tenantId, project_id: projectId, name: 'Synthetic tracker', tasks: {}, imported_by: userId })
    await tx.insert(processSteps).values({ id: stepId, tenant_id: tenantId, code: 'SYNTHETIC', stage: 'award', name: 'Synthetic award task', responsible_bu: 'Commercial', input: 'Signed BOM', input_from: 'Commercial', output: 'Handoff', output_by: 'Commercial', sla_days: 1 })
    await tx.insert(taskInstances).values(Object.entries(taskIds).map(([key, id]) => ({ id, tenant_id: tenantId, process_step_id: stepId, subject_type: 'project', subject_id: projectId, instance_key: `award:${bomId}:${key}`, created_by: userId })))
    await tx.insert(slaClocks).values({ id: clockId, tenant_id: tenantId, task_instance_id: taskId, clock_type: 'business_days', clock_scope: 'internal', target_value: 1, started_at: new Date('2026-09-13'), at_risk_at: new Date('2026-09-14'), due_at: new Date('2026-09-15'), escalation_at: new Date('2026-09-16'), created_by: userId })
    await tx.insert(awardHandoffs).values({ id: handoffId, tenant_id: tenantId, source_bom_id: bomId, project_id: projectId, project_code: projectId, budget_id: budgetId, dp_invoice_id: invoiceId, project_tracker_id: trackerId, task_ids: taskIds, created_by: userId })
  })
  const profile = { user: { id: userId }, tenantId, role: 'admin', email: `${userId}@integration.test` }
  boundary.profile.mockResolvedValue(profile)
  const form = (reason = 'Synthetic correction'): FormData => {
    const data = new FormData(); data.set('projectId', projectId); data.set('handoffId', handoffId); data.set('reason', reason); return data
  }
  const snapshot = async () => ({
    budgets: await db.select().from(projectBudgets).where(eq(projectBudgets.tenant_id, tenantId)).orderBy(asc(projectBudgets.id)),
    trackers: await db.select().from(masterSchedules).where(eq(masterSchedules.tenant_id, tenantId)).orderBy(asc(masterSchedules.id)),
    handoffs: await db.select().from(awardHandoffs).where(eq(awardHandoffs.tenant_id, tenantId)).orderBy(asc(awardHandoffs.id)),
    invoices: await db.select().from(invoices).where(eq(invoices.tenant_id, tenantId)).orderBy(asc(invoices.id)),
    tasks: await db.select().from(taskInstances).where(eq(taskInstances.tenant_id, tenantId)).orderBy(asc(taskInstances.id)),
    clocks: await db.select().from(slaClocks).where(eq(slaClocks.tenant_id, tenantId)).orderBy(asc(slaClocks.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, tenantId)).orderBy(asc(auditLog.id)),
  })
  return { tenantId, userId, projectId, bomId, handoffId, budgetId, invoiceId, trackerId, taskIds, clockId, profile, form, snapshot }
}

(enabled ? describe : describe.skip)('Mounted award reversal real PostgreSQL authority', () => {
  it('replays an existing locked-BOM award without duplicate artifacts or audit, including refresh failure', async () => {
    const f = await fixture(), before = await f.snapshot(), form = new FormData()
    form.set('projectId', f.projectId); form.set('bomId', f.bomId); form.set('downPaymentPercent', '20')
    const receipt = { ok: true, reused: true, handoffId: f.handoffId, projectId: f.projectId, projectCode: f.projectId, budgetId: f.budgetId, dpInvoiceId: f.invoiceId, projectTrackerId: f.trackerId, taskIds: f.taskIds }
    expect(await awardLockedBom(form)).toEqual(receipt)
    expect(await f.snapshot()).toEqual(before)
    boundary.revalidate.mockImplementationOnce(() => { throw new Error('Synthetic award refresh failure') })
    expect(await awardLockedBom(form)).toEqual({ ...receipt, refreshWarning: expect.any(String) })
    expect(await f.snapshot()).toEqual(before)
  })
  it.each(['suspended', 'disabled', 'invited', 'demoted', 'tenant-suspended', 'tenant-disabled'] as const)('rejects stale privileged profile when current authority is %s', async state => {
    const f = await fixture()
    const changed = { status_reason: 'Synthetic lifecycle race', status_changed_at: new Date(), status_changed_by: f.userId }
    if (state === 'demoted') await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    else if (state === 'tenant-suspended' || state === 'tenant-disabled') await db.update(tenants).set({ status: state === 'tenant-suspended' ? 'suspended' : 'disabled', ...changed }).where(eq(tenants.id, f.tenantId))
    else await db.update(users).set({ account_status: state, ...changed }).where(eq(users.id, f.userId))
    const before = await f.snapshot()
    expect(await reverseAwardHandoff(f.form())).toMatchObject({ ok: false })
    expect(await f.snapshot()).toEqual(before)
    expect(boundary.revalidate).not.toHaveBeenCalled()
  })
  it('commits existing active reversal with exactly one semantic audit', async () => {
    const f = await fixture()
    const logs = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    expect(await reverseAwardHandoff(f.form())).toEqual({ ok: true })
    const state = await f.snapshot()
    expect(state.handoffs[0]).toMatchObject({ status: 'reversed', reversal_reason: 'Synthetic correction', reversed_by: f.userId })
    expect(state.invoices[0]?.status).toBe('cancelled')
    expect(state.tasks[0]?.status).toBe('cancelled')
    expect(state.clocks[0]?.status).toBe('cancelled')
    expect(state.audit.filter(row => row.entity_type === 'award_handoff' && row.action === 'status_change')).toHaveLength(1)
    expect(logs).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(logs.mock.calls[0]?.[0]))).toEqual({ trace_id: expect.any(String), tenant_id: f.tenantId, actor_id: f.userId, action: 'project.award_reversal', outcome: 'succeeded' })
  })
  it('denies foreign project/handoff without changes', async () => {
    const f = await fixture(), foreign = await fixture(), before = await foreign.snapshot()
    boundary.profile.mockResolvedValue(f.profile)
    expect(await reverseAwardHandoff(foreign.form())).toMatchObject({ ok: false })
    expect(await foreign.snapshot()).toEqual(before)
  })
  it('rolls back actual audit insert and all downstream changes after an audit failure', async () => {
    const f = await fixture(), before = await f.snapshot(), write = audit.writeAuditLogInTransaction
    vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementationOnce(async (tx, params) => { await write(tx, params); throw new Error('Synthetic audit failure') })
    expect(await reverseAwardHandoff(f.form())).toMatchObject({ ok: false })
    expect(await f.snapshot()).toEqual(before)
  })
  it('keeps a committed reversal successful when cache refresh fails', async () => {
    const f = await fixture()
    boundary.revalidate.mockImplementationOnce(() => { throw new Error('Synthetic refresh failure') })
    expect(await reverseAwardHandoff(f.form())).toMatchObject({ ok: true, refreshWarning: expect.any(String) })
    expect((await f.snapshot()).handoffs[0]?.status).toBe('reversed')
  })
  it.each(['actor', 'tenant'] as const)('denies authenticated award creation with stale %s authority', async kind => {
    const f = await fixture()
    if (kind === 'actor') await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    else await db.update(tenants).set({ status: 'suspended', status_reason: 'Synthetic', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    const before = await f.snapshot(), form = new FormData()
    form.set('projectId', f.projectId); form.set('bomId', f.bomId); form.set('downPaymentPercent', '20')
    expect(await awardLockedBom(form)).toMatchObject({ ok: false })
    expect(await f.snapshot()).toEqual(before)
    expect(boundary.revalidate).not.toHaveBeenCalled()
  })
  it('retains actor and tenant authority locks while an admitted reversal is blocked downstream', async () => {
    const f = await fixture()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    let holderPid = 0
    const holder = db.transaction(async tx => {
      await tx.select({ id: slaClocks.id }).from(slaClocks).where(eq(slaClocks.id, f.clockId)).for('update')
      holderPid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))[0]!.pid
      await gate
    })
    let action: ReturnType<typeof reverseAwardHandoff> | undefined
    try {
      await vi.waitFor(() => expect(holderPid).toBeGreaterThan(0))
      action = reverseAwardHandoff(f.form())
      await vi.waitFor(async () => expect(await db.execute(sql`select pid from pg_stat_activity where ${holderPid} = any(pg_blocking_pids(pid))`)).toHaveLength(1))
      for (const kind of ['actor', 'tenant'] as const) {
        let failure: unknown
        try {
          await db.transaction(async tx => {
            await tx.execute(sql`set local lock_timeout = '100ms'`)
            const changed = { status_reason: 'Synthetic concurrent lifecycle change', status_changed_at: new Date(), status_changed_by: f.userId }
            if (kind === 'actor') await tx.update(users).set({ account_status: 'suspended', ...changed }).where(eq(users.id, f.userId))
            else await tx.update(tenants).set({ status: 'suspended', ...changed }).where(eq(tenants.id, f.tenantId))
          })
        } catch (error) { failure = error }
        while (failure instanceof Object && !('code' in failure)) failure = 'cause' in failure ? failure.cause : undefined
        expect(failure).toMatchObject({ code: '55P03' })
      }
    } finally { release?.(); await holder }
    expect(await action).toMatchObject({ ok: true })
    expect((await db.select().from(users).where(eq(users.id, f.userId)))[0]?.account_status).toBe('active')
    expect((await db.select().from(tenants).where(eq(tenants.id, f.tenantId)))[0]?.status).toBe('active')
  })
  it('maps a real wrapped NOWAIT admission conflict to a safe retry outcome without changes', async () => {
    const f = await fixture(), before = await f.snapshot()
    await db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, f.userId)).for('update')
      expect(await reverseAwardHandoff(f.form())).toEqual({ ok: false, error: 'Award authority is changing or busy. Refresh and retry.' })
    })
    expect(await f.snapshot()).toEqual(before)
    expect(boundary.revalidate).not.toHaveBeenCalled()
  })
  it('serializes two actual connections so one reversal wins without overwritten reason or duplicate semantic audit', async () => {
    const f = await fixture()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    let holderPid = 0
    let ready: (() => void) | undefined
    const held = new Promise<void>(resolve => { ready = resolve })
    const holder = db.transaction(async tx => {
      await tx.select({ id: slaClocks.id }).from(slaClocks).where(eq(slaClocks.id, f.clockId)).for('update')
      holderPid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))[0]!.pid
      ready?.()
      await gate
    })
    await held
    const first = reverseAwardHandoff(f.form('First explicit reversal'))
    let firstPid = 0
    let second: ReturnType<typeof reverseAwardHandoff> | undefined
    try {
      await vi.waitFor(async () => {
        const rows = await db.execute<{ pid: number }>(sql`select pid from pg_stat_activity where datname = current_database() and ${holderPid} = any(pg_blocking_pids(pid))`)
        expect(rows).toHaveLength(1)
        firstPid = rows[0]!.pid
      }, { timeout: 2000 })
      second = reverseAwardHandoff(f.form('Second explicit reversal'))
      await vi.waitFor(async () => {
        const rows = await db.execute<{ pid: number }>(sql`select pid from pg_stat_activity where datname = current_database() and pid <> ${firstPid} and (${holderPid} = any(pg_blocking_pids(pid)) or ${firstPid} = any(pg_blocking_pids(pid)))`)
        expect(rows).toHaveLength(1)
        expect(rows[0]!.pid).not.toBe(firstPid)
        expect(rows[0]!.pid).not.toBe(holderPid)
      }, { timeout: 2000 })
    } finally { release?.(); await holder }
    if (!second) throw new Error('Second transaction was not started')
    const results = await Promise.all([first, second])
    expect.soft(results.map(result => result.ok)).toEqual([true, false])
    const state = await f.snapshot()
    expect.soft(state.handoffs[0]).toMatchObject({ status: 'reversed', reversal_reason: 'First explicit reversal' })
    const semantic = state.audit.filter(row => row.entity_type === 'award_handoff' && row.action === 'status_change')
    expect.soft(semantic).toHaveLength(1)
    expect(semantic[0]?.diff).toMatchObject({ reason: 'First explicit reversal' })
  })
})
