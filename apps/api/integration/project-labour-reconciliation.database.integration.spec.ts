import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { auditLog, db, projectScheduleTasks, projects, tenants, users } from '@third-code-erp/database'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { ProjectLabourReconciliationService } from '../src/projects/project-labour-reconciliation.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
const now = new Date('2026-09-12T12:00:00.000Z')
const service = new ProjectLabourReconciliationService(new DatabaseService())

beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('Labour database proof requires an explicit loopback disposable DATABASE_URL')
  }
})

// Service reads use the actual pool. UUID-isolated committed fixtures preserve
// trigger-generated immutable audit evidence; no audit cleanup or DB reset.
async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `labour-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic labour tenant', slug: `labour-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic labour admin', role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic labour project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: userId })
  })
  return { tenantId, userId, projectId, principal }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
type TaskInput = Pick<typeof projectScheduleTasks.$inferInsert, 'task_code' | 'status' | 'planned_labor_minutes' | 'actual_labor_minutes'>

async function task(context: Fixture, input: TaskInput) {
  const id = randomUUID()
  await db.insert(projectScheduleTasks).values({
    id, tenant_id: context.tenantId, project_id: context.projectId,
    level: 'l1', name: input.task_code, planned_start: '2026-09-10', planned_finish: '2026-09-12',
    client_request_id: randomUUID(), request_hash: '0'.repeat(64), created_by: context.userId,
    ...(input.status === 'completed' ? { percent_complete: 100, actual_finish: '2026-09-12' } : {}),
    ...input,
  })
  return id
}

suite('Project labour reconciliation PostgreSQL evidence', () => {
  it('filters tenant/project and cancelled tasks, preserving exact captured totals without writes', async () => {
    const context = await fixture()
    const foreign = await fixture()
    const secondId = randomUUID()
    await db.insert(projects).values({ id: secondId, tenant_id: context.tenantId, name: 'Other project', client: 'Synthetic', project_type: 'mep', created_by: context.userId })
    const reported = await task(context, { task_code: 'A', status: 'completed', planned_labor_minutes: 61, actual_labor_minutes: 93 })
    const planned = await task(context, { task_code: 'B', status: 'planned', planned_labor_minutes: 29, actual_labor_minutes: 0 })
    await task(context, { task_code: 'CANCELLED', status: 'cancelled', planned_labor_minutes: 999, actual_labor_minutes: 888 })
    await task({ ...context, projectId: secondId }, { task_code: 'OTHER', planned_labor_minutes: 700, actual_labor_minutes: 600 })
    await task(foreign, { task_code: 'FOREIGN', planned_labor_minutes: 500, actual_labor_minutes: 400 })
    const audits = await db.select().from(auditLog).where(eq(auditLog.tenant_id, context.tenantId)).orderBy(asc(auditLog.id))
    const result = await service.read(context.projectId, {}, context.principal, now)
    expect(result).toMatchObject({ projectId: context.projectId, asOf: now.toISOString(), status: 'ready', totals: {
      taskCount: 2, plannedLaborMinutes: 90, actualLaborMinutes: 93, varianceMinutes: 3, reportedTaskCount: 1, missingEvidenceTaskCount: 0,
    } })
    expect(result.rows.map(row => row.taskId)).toEqual([reported, planned])
    expect(result.rows[0]).toMatchObject({ evidence: 'reported', varianceMinutes: 32, utilizationBps: 15246 })
    expect(result.rows[1]).toMatchObject({ evidence: 'not_due', varianceMinutes: -29, utilizationBps: 0 })
    expect(await db.select().from(auditLog).where(eq(auditLog.tenant_id, context.tenantId)).orderBy(asc(auditLog.id))).toEqual(audits)
  })

  it('reports partial evidence for active, blocked and completed zero-minute tasks, without inventing actuals', async () => {
    const context = await fixture()
    for (const status of ['in_progress', 'blocked', 'completed'] as const) {
      await task(context, { task_code: status, status, planned_labor_minutes: 17, actual_labor_minutes: 0 })
    }
    await task(context, { task_code: 'UNPLANNED-ACTUAL', status: 'in_progress', planned_labor_minutes: 0, actual_labor_minutes: 7 })
    const result = await service.read(context.projectId, {}, context.principal, now)
    expect(result).toMatchObject({ status: 'partial', totals: {
      taskCount: 4, plannedLaborMinutes: 51, actualLaborMinutes: 7, varianceMinutes: -44, reportedTaskCount: 1, missingEvidenceTaskCount: 3,
    } })
    expect(result.rows.filter(row => row.evidence === 'missing')).toHaveLength(3)
    expect(result.rows[0]).toMatchObject({ actualLaborMinutes: 7, utilizationBps: null, evidence: 'reported' })
  })

  it('reports unavailable for an empty or cancelled-only project', async () => {
    const context = await fixture()
    for (const cancelledOnly of [false, true]) {
      if (cancelledOnly) await task(context, { task_code: 'CANCELLED', status: 'cancelled', planned_labor_minutes: 70, actual_labor_minutes: 80 })
      expect(await service.read(context.projectId, {}, context.principal, now)).toMatchObject({ status: 'unavailable', rows: [], totals: {
        taskCount: 0, plannedLaborMinutes: 0, actualLaborMinutes: 0, varianceMinutes: 0, reportedTaskCount: 0, missingEvidenceTaskCount: 0,
      } })
    }
  })

  it('rejects foreign and retired projects and missing/current wrong-tenant membership', async () => {
    const context = await fixture()
    const foreign = await fixture()
    await expect(service.read(foreign.projectId, {}, context.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.read(context.projectId, {}, { ...context.principal, userId: randomUUID() })).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.read(context.projectId, {}, { ...foreign.principal, tenantId: context.tenantId })).rejects.toBeInstanceOf(ForbiddenException)
    await db.update(projects).set({ deleted_at: now, deleted_by: context.userId, deletion_reason: 'Synthetic retirement proof' }).where(and(eq(projects.id, context.projectId), eq(projects.tenant_id, context.tenantId)))
    await expect(service.read(context.projectId, {}, context.principal)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retains FORCE RLS and denies direct client grants while allowing service-role reads', async () => {
    const context = await fixture()
    const id = await task(context, { task_code: 'ACL', planned_labor_minutes: 13, actual_labor_minutes: 0 })
    const [catalog] = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(sql`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.project_schedule_tasks'::regclass`)
    expect(catalog).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const [grant] = await db.execute<{ allowed: boolean }>(sql`select has_table_privilege(${role}, 'public.project_schedule_tasks', ${privilege}) as allowed`)
        expect(grant?.allowed, `${role} ${privilege}`).toBe(false)
      }
    }
    const rows = await db.transaction(async tx => {
      await tx.execute(sql`set local role service_role`)
      return tx.select({ id: projectScheduleTasks.id, tenantId: projectScheduleTasks.tenant_id, projectId: projectScheduleTasks.project_id }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.id, id), eq(projectScheduleTasks.tenant_id, context.tenantId), eq(projectScheduleTasks.project_id, context.projectId)))
    })
    expect(rows).toEqual([{ id, tenantId: context.tenantId, projectId: context.projectId }])
  })

  for (const role of ['anon', 'authenticated'] as const) {
    it(`${role} cannot actually read, insert, update or delete schedule rows`, async () => {
      const context = await fixture()
      const id = await task(context, { task_code: 'DENIED', planned_labor_minutes: 13, actual_labor_minutes: 0 })
      for (const operation of ['select', 'insert', 'update', 'delete'] as const) {
        await expect(db.transaction(async tx => {
          await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: context.userId, role })}, true)`)
          await tx.execute(sql.raw(`set local role ${role}`))
          if (operation === 'select') await tx.select().from(projectScheduleTasks).where(eq(projectScheduleTasks.id, id))
          if (operation === 'insert') await tx.insert(projectScheduleTasks).values({ tenant_id: context.tenantId, project_id: context.projectId, level: 'l1', task_code: 'DENIED-INSERT', name: 'Denied insert', planned_start: '2026-09-10', planned_finish: '2026-09-12', client_request_id: randomUUID(), request_hash: '0'.repeat(64), created_by: context.userId })
          if (operation === 'update') await tx.update(projectScheduleTasks).set({ actual_labor_minutes: 999 }).where(eq(projectScheduleTasks.id, id))
          if (operation === 'delete') await tx.delete(projectScheduleTasks).where(eq(projectScheduleTasks.id, id))
        })).rejects.toMatchObject({ cause: { code: '42501' } })
      }
      const [unchanged] = await db.select().from(projectScheduleTasks).where(eq(projectScheduleTasks.id, id))
      expect(unchanged?.actual_labor_minutes).toBe(0)
    })
  }
})
