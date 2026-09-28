import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { auditLog, awardHandoffs, boms, db, invoices, masterSchedules, processSteps, projectBudgets, projects, slaClocks, taskInstances, tenants, users } from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
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
  const tenantId = randomUUID(), userId = randomUUID(), cxId = randomUUID(), projectId = randomUUID(), bomId = randomUUID(), budgetId = randomUUID(), invoiceId = randomUUID(), trackerId = randomUUID(), handoffId = randomUUID()
  await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic award task tenant', slug: `award-task-${tenantId}` })
  await tx.insert(users).values([
    { id: userId, tenant_id: tenantId, full_name: 'Synthetic Finance', email: `${userId}@integration.test`, role: 'finance' },
    { id: cxId, tenant_id: tenantId, full_name: 'Synthetic CX', email: `${cxId}@integration.test`, role: 'cx' },
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
  return { tenantId, userId, cxId, projectId, handoffId, taskIds, stepIds, clockId, principal, cx: { ...principal, userId: cxId, role: 'cx' as const } }
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
})
