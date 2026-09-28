import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { auditLog, awardHandoffs, boms, db, invoices, masterSchedules, mobilizationReadiness, processSteps, projectBudgets, projects, slaClocks, taskInstances, tenants, users } from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { lockAwardNtpHandoff, lockAwardNtpReconciliationRows, releaseAwardTasksForRecordedNtp } from '@third-code-erp/operations/signed-bom-award'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import type { DatabaseService, DatabaseTransaction } from '../src/database/database.service'
import { ProcessService } from '../src/process/process.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const rollback = Symbol('rollback')
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) {
    throw new Error('Award task proof requires disposable loopback PostgreSQL')
  }
})

async function fixture(tx: DatabaseTransaction) {
  const tenantId = randomUUID(), userId = randomUUID(), cxId = randomUUID(), managerId = randomUUID(), projectId = randomUUID(), bomId = randomUUID(), budgetId = randomUUID(), invoiceId = randomUUID(), trackerId = randomUUID(), handoffId = randomUUID()
  await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic award task tenant', slug: `award-task-${tenantId}` })
  await tx.insert(users).values([
    { id: userId, tenant_id: tenantId, full_name: 'Synthetic Finance', email: `${userId}@integration.test`, role: 'finance' },
    { id: cxId, tenant_id: tenantId, full_name: 'Synthetic CX', email: `${cxId}@integration.test`, role: 'cx' },
    { id: managerId, tenant_id: tenantId, full_name: 'Synthetic Manager', email: `${managerId}@integration.test`, role: 'admin' },
  ])
  await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic award task project', client: 'Synthetic', created_by: userId })
  await tx.insert(boms).values({ id: bomId, tenant_id: tenantId, project_id: projectId, created_by: userId, status: 'locked' })
  await tx.insert(projectBudgets).values({ id: budgetId, tenant_id: tenantId, project_id: projectId, source_bom_id: bomId, revision: 1, status: 'draft', effective_from: '2026-09-28', revision_reason: 'Synthetic proof', created_by: userId })
  await tx.insert(invoices).values({ id: invoiceId, tenant_id: tenantId, project_id: projectId, created_by: userId, invoice_number: `DP-${invoiceId}`, status: 'draft' })
  await tx.insert(masterSchedules).values({ id: trackerId, tenant_id: tenantId, project_id: projectId, name: 'Synthetic tracker', tasks: {}, imported_by: userId })
  const taskIds: Record<string, string> = {}
  const stepIds: Record<string, string> = {}
  for (const [key, code, bu] of [
    ['arProjectCode', 'AWARD.AR_PROJECT_CODE', 'Finance'],
    ['downPaymentInvoice', 'AWARD.DP_INVOICE', 'Finance'],
    ['cari', 'AWARD.CARI', 'Finance'],
    ['projectTracker', 'AWARD.PROJECT_TRACKER', 'SD/PM/PE'],
    ['cxOnboarding', 'AWARD.CX_ONBOARDING', 'CX'],
  ] as const) {
    const taskId = randomUUID(), stepId = randomUUID()
    taskIds[key] = taskId
    stepIds[key] = stepId
    await tx.insert(processSteps).values({ id: stepId, tenant_id: tenantId, code, stage: 'award', name: code, responsible_bu: bu, input: 'Signed BOM', input_from: 'Commercial', output: 'Handoff', output_by: bu, sla_days: 2 })
    const blocked = bu !== 'Finance'
    await tx.insert(taskInstances).values({ id: taskId, tenant_id: tenantId, process_step_id: stepId, subject_type: 'award_handoff', subject_id: handoffId, instance_key: `award:${handoffId}:${key}`, status: blocked ? 'blocked' : 'in_progress', blocked_reason: blocked ? 'Awaiting NTP date' : null, started_at: blocked ? null : new Date(), created_by: userId })
  }
  await tx.insert(awardHandoffs).values({ id: handoffId, tenant_id: tenantId, source_bom_id: bomId, project_id: projectId, project_code: projectId, budget_id: budgetId, dp_invoice_id: invoiceId, project_tracker_id: trackerId, task_ids: taskIds, created_by: userId })
  const clockId = randomUUID()
  await tx.insert(slaClocks).values({ id: clockId, tenant_id: tenantId, task_instance_id: taskIds.arProjectCode!, clock_type: 'business_days', clock_scope: 'internal', target_value: 2, started_at: new Date('2026-09-28'), at_risk_at: new Date('2026-09-29'), due_at: new Date('2026-09-30'), escalation_at: new Date('2026-10-01'), created_by: userId })
  const principal: ErpPrincipal = { userId, tenantId, role: 'finance', email: `${userId}@integration.test` }
  return { tenantId, userId, cxId, managerId, projectId, handoffId, taskIds, stepIds, clockId, principal, cx: { ...principal, userId: cxId, role: 'cx' as const }, manager: { ...principal, userId: managerId, role: 'admin' as const } }
}

async function proof(run: (tx: DatabaseTransaction, service: ProcessService, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  try {
    await db.transaction(async tx => {
      // Drizzle transaction exposes the same query builders; nested transactions
      // use savepoints so a denied command does not abort the rollback fixture.
      const database = { client: tx } as unknown as DatabaseService
      await run(tx, new ProcessService(database, new AuditService()), await fixture(tx))
      throw rollback
    })
  } catch (error) { if (error !== rollback) throw error }
}

const query = { page: 1, limit: 25 }
;(enabled ? describe : describe.skip)('Award task authority in PostgreSQL', () => {
  it('serializes concurrent NTP and award work on the same project', async () => {
    const tenantId = randomUUID(), projectId = randomUUID()
    let releaseFirst = () => undefined
    let signalFirst = () => undefined
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })
    const firstLocked = new Promise<void>((resolve) => { signalFirst = resolve })
    const first = db.transaction(async (tx) => {
      await lockAwardNtpHandoff(tx, tenantId, projectId)
      signalFirst()
      await firstHeld
    })
    await firstLocked
    try {
      await expect(db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '100ms'`)
        await lockAwardNtpHandoff(tx, tenantId, projectId)
      })).rejects.toMatchObject({ cause: { code: '55P03' } })
    } finally {
      releaseFirst()
      await first
    }
  })

  it('scopes Finance/CX reads and completion to exact role-owned ledger tasks with audit and clock updates', async () => proof(async (tx, service, f) => {
    const foreign = await fixture(tx)
    expect((await service.listAwardTasks(query, f.principal)).rows.map(row => row.id).sort()).toEqual([f.taskIds.arProjectCode, f.taskIds.downPaymentInvoice, f.taskIds.cari].sort())
    expect((await service.listAwardTasks(query, f.cx)).rows.map(row => row.id)).toEqual([f.taskIds.cxOnboarding])
    expect((await service.listAwardTasks({ ...query, responsibleBu: 'CX' }, f.principal)).total).toBe(0)
    await expect(service.completeAwardTask(foreign.taskIds.arProjectCode!, f.principal)).rejects.toThrow('Award task not found')
    await expect(service.completeAwardTask(f.taskIds.cxOnboarding!, f.principal)).rejects.toThrow('Award task not found')
    await expect(service.completeAwardTask(f.taskIds.arProjectCode!, f.cx)).rejects.toThrow('Award task not found')
    await expect(service.completeAwardTask(f.taskIds.cxOnboarding!, f.cx)).rejects.toThrow('Only an in-progress')
    expect(await service.completeAwardTask(f.taskIds.arProjectCode!, f.principal)).toMatchObject({ id: f.taskIds.arProjectCode, status: 'completed', tenantId: f.tenantId })
    expect((await tx.select().from(slaClocks).where(eq(slaClocks.id, f.clockId)))[0]?.status).toBe('completed')
    const audit = await tx.select().from(auditLog).where(and(eq(auditLog.tenant_id, f.tenantId), eq(auditLog.entity_id, f.taskIds.arProjectCode!)))
    expect(audit.some(row => row.actor_id === f.userId && row.action === 'update')).toBe(true)
    await expect(service.completeAwardTask(f.taskIds.arProjectCode!, f.principal)).rejects.toThrow('Only an in-progress')
  }))

  it.each(['instance', 'subject', 'ledger', 'step', 'bu', 'inactive', 'reversed', 'retired-project'] as const)('rejects %s mismatches in read and completion', async kind => proof(async (tx, service, f) => {
    const id = f.taskIds.arProjectCode!
    if (kind === 'instance') await tx.update(taskInstances).set({ instance_key: 'forged' }).where(eq(taskInstances.id, id))
    if (kind === 'subject') await tx.update(taskInstances).set({ subject_type: 'project' }).where(eq(taskInstances.id, id))
    if (kind === 'ledger') await tx.update(awardHandoffs).set({ task_ids: { ...f.taskIds, arProjectCode: randomUUID() } }).where(eq(awardHandoffs.id, f.handoffId))
    if (kind === 'step') await tx.update(processSteps).set({ code: 'FORGED' }).where(eq(processSteps.id, f.stepIds.arProjectCode!))
    if (kind === 'bu') await tx.update(processSteps).set({ responsible_bu: 'CX' }).where(eq(processSteps.id, f.stepIds.arProjectCode!))
    if (kind === 'inactive') await tx.update(processSteps).set({ is_active: false }).where(eq(processSteps.id, f.stepIds.arProjectCode!))
    if (kind === 'reversed') await tx.update(awardHandoffs).set({ status: 'reversed', reversed_at: new Date(), reversed_by: f.userId, reversal_reason: 'Synthetic proof' }).where(eq(awardHandoffs.id, f.handoffId))
    if (kind === 'retired-project') await tx.update(projects).set({ deleted_at: new Date(), deleted_by: f.userId, deletion_reason: 'Synthetic proof' }).where(eq(projects.id, f.projectId))
    expect((await service.listAwardTasks(query, f.principal)).rows.some(row => row.id === id)).toBe(false)
    await expect(service.completeAwardTask(id, f.principal)).rejects.toThrow('Award task not found')
    expect((await tx.select().from(taskInstances).where(eq(taskInstances.id, id)))[0]?.status).toBe('in_progress')
  }))

  it.each(['demoted', 'suspended', 'tenant-disabled'] as const)('rejects stale principal after %s', async kind => proof(async (tx, service, f) => {
    if (kind === 'demoted') await tx.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    if (kind === 'suspended') await tx.update(users).set({ account_status: 'suspended', status_reason: 'Synthetic', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(users.id, f.userId))
    if (kind === 'tenant-disabled') await tx.update(tenants).set({ status: 'disabled', status_reason: 'Synthetic', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    await expect(service.completeAwardTask(f.taskIds.arProjectCode!, f.principal)).rejects.toThrow('Current award task authority')
  }))

  it('keeps NTP-gated award tasks blocked until project NTP receipt exists', async () => proof(async (tx, service, f) => {
    const cxTaskId = f.taskIds.cxOnboarding!
    await expect(service.updateTaskStatus(cxTaskId, { status: 'in_progress' }, f.manager)).rejects.toThrow('Record the NTP receipt')
    await tx.update(taskInstances).set({ assigned_to: f.managerId }).where(eq(taskInstances.id, cxTaskId))
    await expect(service.startClock(cxTaskId, { observeMode: true, timeZone: 'Asia/Manila' }, f.manager)).rejects.toThrow('cannot start a clock while blocked')
    expect((await tx.select().from(taskInstances).where(eq(taskInstances.id, cxTaskId)))[0]?.status).toBe('blocked')

    await new AuditService().stampActor(tx, f.manager)
    await tx.insert(mobilizationReadiness).values({
      tenant_id: f.tenantId,
      project_id: f.projectId,
      ntp_received_at: new Date('2026-09-28T00:00:00.000Z'),
      created_by: f.managerId,
      updated_by: f.managerId,
    })
    await expect(service.updateTaskStatus(cxTaskId, { status: 'in_progress' }, f.manager)).rejects.toThrow('Record the NTP receipt')
    expect(await releaseAwardTasksForRecordedNtp(tx, { tenantId: f.tenantId, projectId: f.projectId, actorId: f.managerId })).toContain(cxTaskId)
    expect((await tx.select().from(taskInstances).where(eq(taskInstances.id, cxTaskId)))[0]).toMatchObject({
      id: cxTaskId,
      status: 'in_progress',
    })
  }))

  it('releases the Project Tracker and CX handoffs once with business-day clocks after NTP receipt', async () => proof(async (tx, _service, f) => {
    const args = { tenantId: f.tenantId, projectId: f.projectId, actorId: f.managerId }
    expect(await releaseAwardTasksForRecordedNtp(tx, args)).toEqual([])
    const foreign = await fixture(tx)
    const receiptAt = new Date('2026-09-28T09:00:00.000Z')
    await new AuditService().stampActor(tx, foreign.manager)
    await tx.insert(mobilizationReadiness).values({
      tenant_id: foreign.tenantId,
      project_id: foreign.projectId,
      ntp_received_at: receiptAt,
      created_by: foreign.managerId,
      updated_by: foreign.managerId,
    })
    await new AuditService().stampActor(tx, f.manager)
    const staleAt = new Date('2026-09-20T00:00:00.000Z')
    await tx.insert(slaClocks).values({
      tenant_id: f.tenantId,
      task_instance_id: f.taskIds.cxOnboarding!,
      clock_type: 'business_days',
      clock_scope: 'internal',
      target_value: 2,
      started_at: staleAt,
      due_at: new Date('2026-09-22T00:00:00.000Z'),
      at_risk_at: new Date('2026-09-21T00:00:00.000Z'),
      escalation_at: new Date('2026-09-23T00:00:00.000Z'),
      breached_at: new Date('2026-09-22T01:00:00.000Z'),
      escalated_at: new Date('2026-09-23T01:00:00.000Z'),
      status: 'escalated',
      created_by: f.managerId,
    })
    await lockAwardNtpReconciliationRows(tx, f.tenantId, f.projectId)
    await tx.insert(mobilizationReadiness).values({
      tenant_id: f.tenantId,
      project_id: f.projectId,
      ntp_received_at: receiptAt,
      created_by: f.managerId,
      updated_by: f.managerId,
    })
    const gatedIds = [f.taskIds.projectTracker!, f.taskIds.cxOnboarding!]
    expect((await releaseAwardTasksForRecordedNtp(tx, args)).sort()).toEqual(gatedIds.sort())
    expect(await releaseAwardTasksForRecordedNtp(tx, args)).toEqual([])
    expect((await tx.select().from(taskInstances).where(eq(taskInstances.id, foreign.taskIds.cxOnboarding!)))[0]?.status).toBe('blocked')
    for (const taskId of gatedIds) {
      const [task] = await tx.select().from(taskInstances).where(eq(taskInstances.id, taskId))
      expect(task).toMatchObject({ status: 'in_progress', blocked_reason: null, started_at: receiptAt })
      const clocks = await tx.select().from(slaClocks).where(eq(slaClocks.task_instance_id, taskId))
      expect(clocks).toHaveLength(1)
      expect(clocks[0]).toMatchObject({ status: 'running', clock_type: 'business_days', target_value: 2, started_at: receiptAt, breached_at: null, escalated_at: null, paused_reason: null })
      expect(clocks[0]?.due_at.getTime()).toBeGreaterThan(receiptAt.getTime())
      const audit = await tx.select().from(auditLog).where(and(eq(auditLog.tenant_id, f.tenantId), eq(auditLog.entity_id, taskId)))
      expect(audit.some(row => row.actor_id === f.managerId && row.action === 'update')).toBe(true)
    }
  }))
})
