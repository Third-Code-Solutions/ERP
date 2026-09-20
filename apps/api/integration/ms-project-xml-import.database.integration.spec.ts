import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { db, tenants, users, projects, projectScheduleTasks, auditLog } from '@third-code-erp/database'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { MsProjectXmlImportService } from '../src/projects/ms-project-xml-import.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) throw new Error('XML import proof requires synthetic loopback PostgreSQL')
})

const XML = `<Project xmlns="http://schemas.microsoft.com/project"><Name>Synthetic schedule</Name><Tasks>
<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber><Summary>1</Summary><Start>2026-09-01T08:00:00</Start><Finish>2026-09-30T17:00:00</Finish></Task>
<Task><UID>2</UID><ID>2</ID><Name>Finish</Name><OutlineLevel>2</OutlineLevel><OutlineNumber>1.1</OutlineNumber><Summary>0</Summary><Start>2026-09-10T08:00:00</Start><Finish>2026-09-12T17:00:00</Finish><PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag></PredecessorLink></Task>
<Task><UID>3</UID><ID>3</ID><Name>Prepare</Name><OutlineLevel>2</OutlineLevel><OutlineNumber>1.2</OutlineNumber><Summary>0</Summary><Start>2026-09-01T08:00:00</Start><Finish>2026-09-09T17:00:00</Finish></Task>
</Tasks></Project>`

async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic XML tenant', slug: `xml-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic planner', email: `${userId}@integration.test`, role: 'pm' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic XML project', client: 'Synthetic', created_by: userId })
  })
  const principal = { tenantId, userId, role: 'pm' as const, email: `${userId}@integration.test` }
  const audit = new AuditService()
  const service = new MsProjectXmlImportService(new DatabaseService(), audit)
  const previewCommand = { projectId, sourceBase64: Buffer.from(XML).toString('base64'), fileName: 'synthetic.xml' }
  const command = async () => {
    const { preview } = await service.preview(projectId, previewCommand, principal)
    return {
      projectId, sourceBase64: previewCommand.sourceBase64, requestId: randomUUID(), sourceHash: preview.sourceHash, parserVersion: preview.parserVersion,
      mappings: [
        { sourceUid: 1, sourceOutlineLevel: 1, level: 'l1' as const, ownerId: null },
        { sourceUid: 2, sourceOutlineLevel: 2, level: 'l2' as const, ownerId: null },
        { sourceUid: 3, sourceOutlineLevel: 2, level: 'l2' as const, ownerId: null },
      ],
    }
  }
  const snapshot = async () => ({
    tasks: await db.select().from(projectScheduleTasks).where(eq(projectScheduleTasks.tenant_id, tenantId)).orderBy(asc(projectScheduleTasks.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, tenantId)).orderBy(asc(auditLog.id)),
  })
  return { tenantId, userId, projectId, principal, audit, service, previewCommand, command, snapshot }
}

describe.skipIf(!enabled)('reviewed XML import database authority', () => {
  it('commits the supported 500-task boundary within the request budget', async () => {
    const f = await fixture()
    const tasks = Array.from({ length: 500 }, (_, index) => `<Task><UID>${index + 1}</UID><ID>${index + 1}</ID><Name>Task ${index + 1}</Name><OutlineLevel>1</OutlineLevel><OutlineNumber>${index + 1}</OutlineNumber><Summary>0</Summary><Start>2026-09-01T08:00:00</Start><Finish>2026-09-02T17:00:00</Finish></Task>`).join('')
    const sourceBase64 = Buffer.from(`<Project xmlns="http://schemas.microsoft.com/project"><Tasks>${tasks}</Tasks></Project>`).toString('base64')
    const { preview } = await f.service.preview(f.projectId, { projectId: f.projectId, sourceBase64 }, f.principal)
    expect(preview.canImport).toBe(true)
    const start = Date.now()
    const result = await f.service.import(f.projectId, {
      projectId: f.projectId, sourceBase64, sourceHash: preview.sourceHash, parserVersion: preview.parserVersion, requestId: randomUUID(),
      mappings: preview.tasks.map(task => ({ sourceUid: task.sourceUid, sourceOutlineLevel: task.outlineLevel, level: 'l1', ownerId: null })),
    }, f.principal)
    expect(Date.now() - start).toBeLessThan(25_000)
    expect(result.receipt.tasks).toHaveLength(500)
    const state = await f.snapshot()
    expect(state.tasks).toHaveLength(500)
    expect(state.audit.filter(row => row.entity_type === 'project_schedule_import')).toHaveLength(1)
  }, 35_000)

  it('preview is pure; import preserves hierarchy and predecessor with planned-only defaults', async () => {
    const f = await fixture(), before = await f.snapshot()
    const command = await f.command()
    expect(await f.snapshot()).toEqual(before)
    await f.service.import(f.projectId, command, f.principal)
    const state = await f.snapshot()
    expect(state.tasks).toHaveLength(3)
    const parent = state.tasks.find(row => row.name === 'Phase')!
    const child = state.tasks.find(row => row.name === 'Finish')!
    const predecessor = state.tasks.find(row => row.name === 'Prepare')!
    expect(child.parent_task_id).toBe(parent.id)
    expect(child.predecessor_task_id).toBe(predecessor.id)
    for (const row of state.tasks) expect(row).toMatchObject({ source: 'ms_project', status: 'planned', owner_id: null, planned_labor_minutes: 0, actual_labor_minutes: 0, percent_complete: 0, commitment_status: 'not_set', actual_start: null, actual_finish: null })
    expect(state.audit.filter(row => row.entity_type === 'project_schedule_import')).toHaveLength(1)
    expect(JSON.stringify(state.audit)).not.toContain('<Project')
    expect(JSON.stringify(state.audit)).not.toContain(command.sourceBase64)
  })

  it('replays the original receipt after task edits without changing data or appending audit', async () => {
    const f = await fixture(), command = await f.command()
    const receipt = await f.service.import(f.projectId, command, f.principal)
    await db.update(projectScheduleTasks).set({ name: 'Edited after import', version: 2 }).where(and(eq(projectScheduleTasks.tenant_id, f.tenantId), eq(projectScheduleTasks.name, 'Finish')))
    const before = await f.snapshot()
    expect((await f.service.import(f.projectId, command, f.principal)).receipt).toEqual(receipt.receipt)
    expect(await f.snapshot()).toEqual(before)
  })

  it('rolls every task and row audit back if semantic receipt persistence fails', async () => {
    const f = await fixture(), command = await f.command(), before = await f.snapshot()
    vi.spyOn(f.audit, 'writeSemantic').mockRejectedValueOnce(new Error('Synthetic receipt failure'))
    await expect(f.service.import(f.projectId, command, f.principal)).rejects.toThrow('Synthetic receipt failure')
    expect(await f.snapshot()).toEqual(before)
  })

  it.each(['account', 'tenant', 'role'] as const)('rechecks current %s authority after preview', async target => {
    const f = await fixture(), command = await f.command()
    const suspension = { status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: f.userId }
    if (target === 'account') await db.update(users).set({ account_status: 'suspended', ...suspension }).where(eq(users.id, f.userId))
    if (target === 'tenant') await db.update(tenants).set({ status: 'suspended', ...suspension }).where(eq(tenants.id, f.tenantId))
    if (target === 'role') await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    const before = await f.snapshot()
    await expect(f.service.import(f.projectId, command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await f.snapshot()).toEqual(before)
  })

  it('rejects changed mapping and new-key duplicate source without writes', async () => {
    const f = await fixture(), command = await f.command()
    await f.service.import(f.projectId, command, f.principal)
    const before = await f.snapshot()
    await expect(f.service.import(f.projectId, { ...command, mappings: command.mappings.map(row => ({ ...row, ownerId: f.userId })) }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    await expect(f.service.import(f.projectId, { ...command, requestId: randomUUID() }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await f.snapshot()).toEqual(before)
  })

  it('does not duplicate a source under a new request after every task code was edited', async () => {
    const f = await fixture(), command = await f.command()
    await f.service.import(f.projectId, command, f.principal)
    await db.update(projectScheduleTasks).set({ task_code: sql`'edited-' || id::text`, version: 2 }).where(eq(projectScheduleTasks.tenant_id, f.tenantId))
    const before = await f.snapshot()
    await expect(f.service.import(f.projectId, { ...command, requestId: randomUUID() }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await f.snapshot()).toEqual(before)
  })

  it('denies foreign project preview and import without changing either tenant', async () => {
    const f = await fixture(), other = await fixture(), command = await f.command()
    const before = [await f.snapshot(), await other.snapshot()]
    await expect(f.service.preview(other.projectId, { ...f.previewCommand, projectId: other.projectId }, f.principal)).rejects.toThrow()
    await expect(f.service.import(other.projectId, { ...command, projectId: other.projectId }, f.principal)).rejects.toThrow()
    expect([await f.snapshot(), await other.snapshot()]).toEqual(before)
  })

  it('binds a durable request to its original actor and project', async () => {
    const f = await fixture(), command = await f.command()
    await f.service.import(f.projectId, command, f.principal)
    const actorId = randomUUID(), projectId = randomUUID()
    await db.insert(users).values({ id: actorId, tenant_id: f.tenantId, full_name: 'Other planner', email: `${actorId}@integration.test`, role: 'pm' })
    await db.insert(projects).values({ id: projectId, tenant_id: f.tenantId, name: 'Other project', client: 'Synthetic', created_by: f.userId })
    const before = await f.snapshot()
    await expect(f.service.import(f.projectId, command, { ...f.principal, userId: actorId })).rejects.toBeInstanceOf(ConflictException)
    await expect(f.service.import(projectId, { ...command, projectId }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await f.snapshot()).toEqual(before)
  })

  it('rejects foreign owners; original replay remains available after a selected owner is suspended', async () => {
    const f = await fixture(), other = await fixture(), command = await f.command()
    const before = await f.snapshot()
    await expect(f.service.import(f.projectId, { ...command, mappings: command.mappings.map(row => ({ ...row, ownerId: other.userId })) }, f.principal)).rejects.toThrow()
    expect(await f.snapshot()).toEqual(before)
    const ownerId = randomUUID()
    await db.insert(users).values({ id: ownerId, tenant_id: f.tenantId, full_name: 'Selected owner', email: `${ownerId}@integration.test`, role: 'viewer' })
    const owned = { ...command, mappings: command.mappings.map(row => ({ ...row, ownerId })) }
    const result = await f.service.import(f.projectId, owned, f.principal)
    await db.update(users).set({ account_status: 'suspended', status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(users.id, ownerId))
    const committed = await f.snapshot()
    expect((await f.service.import(f.projectId, owned, f.principal)).receipt).toEqual(result.receipt)
    expect(await f.snapshot()).toEqual(committed)
  })

  it('rejects source or mapping tampering before any task is stored', async () => {
    const f = await fixture(), command = await f.command(), before = await f.snapshot()
    const changed = { ...command, sourceBase64: Buffer.from(XML.replace('Prepare', 'Altered')).toString('base64') }
    await expect(f.service.import(f.projectId, changed, f.principal)).rejects.toThrow()
    await expect(f.service.import(f.projectId, { ...command, mappings: command.mappings.slice(1) }, f.principal)).rejects.toThrow()
    await expect(f.service.import(f.projectId, { ...command, mappings: command.mappings.map(row => ({ ...row, level: 'l1' })) }, f.principal)).rejects.toThrow()
    expect(await f.snapshot()).toEqual(before)
  })

  it.each(['actor', 'tenant', 'audit', 'project'] as const)('fails fast under %s contention without writes', async target => {
    const f = await fixture(), command = await f.command(), before = await f.snapshot()
    let ready = () => {}, release = () => {}
    const held = new Promise<void>(resolve => { ready = resolve })
    const released = new Promise<void>(resolve => { release = resolve })
    const holder = db.transaction(async tx => {
      if (target === 'actor') await tx.execute(sql`select id from public.users where id = ${f.userId}::uuid for update`)
      if (target === 'tenant') await tx.execute(sql`select id from public.tenants where id = ${f.tenantId}::uuid for update`)
      if (target === 'project') await tx.execute(sql`select id from public.projects where id = ${f.projectId}::uuid for update`)
      if (target === 'audit') await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'audit_log:' + f.tenantId}, 0))`)
      ready()
      await released
    })
    try {
      await Promise.race([held, holder])
      const start = Date.now()
      await expect(f.service.import(f.projectId, command, f.principal)).rejects.toThrow()
      expect(Date.now() - start).toBeLessThan(2_500)
    } finally {
      release()
      await holder
    }
    expect(await f.snapshot()).toEqual(before)
  })

  it('concurrent same-key commands leave one receipt and support exact retry', async () => {
    const f = await fixture(), command = await f.command()
    const outcomes = await Promise.allSettled([f.service.import(f.projectId, command, f.principal), f.service.import(f.projectId, command, f.principal)])
    expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true)
    const result = await f.service.import(f.projectId, command, f.principal)
    const state = await f.snapshot()
    expect(state.tasks).toHaveLength(3)
    expect(state.audit.filter(row => row.entity_type === 'project_schedule_import')).toHaveLength(1)
    expect(result.receipt.tasks).toHaveLength(3)
  })
})
