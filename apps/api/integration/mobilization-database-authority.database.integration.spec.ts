import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { db, projects, tenants, users } from '@third-code-erp/database'
import { sql, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { ERP_ROLES, roleHasCapability, type ErpRole } from '@third-code-erp/shared-types/authorization'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) throw new Error('Synthetic loopback database required')
})
async function fixture(role: ErpRole = 'owner') {
  const tenantId = randomUUID(), actorId = randomUUID(), otherId = randomUUID(), projectId = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic mobilization authority', slug: `mob-${tenantId}` })
    await tx.insert(users).values([
      { id: actorId, tenant_id: tenantId, role, email: `${actorId}@integration.test`, full_name: 'Synthetic actor' },
      { id: otherId, tenant_id: tenantId, role: 'owner', email: `${otherId}@integration.test`, full_name: 'Synthetic other' },
    ])
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic mobilization project', client: 'Synthetic client', created_by: actorId })
  })
  const stamp = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`)
  }
  const insert = async (override = false) => db.transaction(async tx => {
    await stamp(tx)
    await tx.execute(sql`insert into public.mobilization_readiness
      (tenant_id, project_id, commented_fcd_received_at, po_copies_received_at, cari_received_at, ntp_received_at, started_at, started_by, created_by, updated_by, override_reason, override_at, override_by)
      values (${tenantId}, ${projectId}, now(), now(), now(), now(), now(), ${actorId}, ${actorId}, ${actorId}, ${override ? 'Synthetic override' : null}, ${override ? new Date().toISOString() : null}, ${override ? actorId : null})`)
  })
  const snapshot = async () => [...await db.execute(sql`select * from public.mobilization_readiness where tenant_id=${tenantId}`)]
  return { tenantId, actorId, otherId, projectId, stamp, insert, snapshot }
}

function pgCode(error: unknown): string | undefined {
  let current = error
  const seen = new Set<unknown>()
  while (current instanceof Object && !seen.has(current)) {
    seen.add(current)
    if ('code' in current && typeof current.code === 'string') return current.code
    current = 'cause' in current ? current.cause : undefined
  }
}

(enabled ? describe : describe.skip)('Mobilization direct database authority', () => {
  it.each(ERP_ROLES)('matches canonical controlled manage/override policy for %s', async role => {
    const f = await fixture(role)
    if (roleHasCapability(role, 'precon.manage_permits')) await expect(f.insert(false)).resolves.toBeUndefined()
    else await expect(f.insert(false)).rejects.toSatisfy(error => pgCode(error) === '42501')
    const override = await fixture(role)
    if (roleHasCapability(role, 'precon.override_mobilization')) await expect(override.insert(true)).resolves.toBeUndefined()
    else await expect(override.insert(true)).rejects.toSatisfy(error => pgCode(error) === '42501')
  })
  it.each(['insert', 'update', 'delete'] as const)('denies direct authenticated %s but preserves tenant reads', async operation => {
    const f = await fixture(); await f.insert()
    const before = await f.snapshot()
    let error: unknown
    const rollback = new Error('Synthetic rollback')
    try { await db.transaction(async tx => {
      await f.stamp(tx)
      await tx.execute(sql`set local role authenticated`)
      const visible = await tx.execute(sql`select id from public.mobilization_readiness where tenant_id=${f.tenantId}`)
      expect(visible).toHaveLength(1)
      const foreign = await tx.execute(sql`select id from public.mobilization_readiness where tenant_id<>${f.tenantId}`)
      expect(foreign).toHaveLength(0)
      try {
        if (operation === 'insert') await tx.execute(sql`insert into public.mobilization_readiness (tenant_id,project_id) values (${f.tenantId},${f.projectId})`)
        if (operation === 'update') await tx.execute(sql`update public.mobilization_readiness set updated_at=now() where tenant_id=${f.tenantId}`)
        if (operation === 'delete') await tx.execute(sql`delete from public.mobilization_readiness where tenant_id=${f.tenantId}`)
      } catch (caught) { error = caught; throw caught }
      throw rollback
    }) } catch (caught) { if (caught !== rollback && !error) throw caught }
    expect(pgCode(error)).toBe('42501')
    expect(await f.snapshot()).toEqual(before)
  })
  it.each(['receipt', 'reason', 'overrideActor'] as const)('preserves started %s even through privileged SQL', async field => {
    const f = await fixture(); await f.insert(true)
    const before = await f.snapshot()
    let error: unknown
    // Denied mutations are rollback-isolated even when running this RED on the old guard.
    const rollback = new Error('Synthetic rollback')
    try { await db.transaction(async tx => {
      await f.stamp(tx)
      const change = field === 'receipt' ? sql`cari_received_at = now() + interval '1 day'` : field === 'reason' ? sql`override_reason = 'Replaced reason'` : sql`override_by = ${f.otherId}`
      try { await tx.execute(sql`update public.mobilization_readiness set ${change} where tenant_id=${f.tenantId}`) } catch (caught) { error = caught; throw caught }
      throw rollback
    }) } catch (caught) { if (caught !== rollback && !error) throw caught }
    expect(pgCode(error)).toBe('P0001')
    expect(await f.snapshot()).toEqual(before)
  })
  it.each(['actor', 'tenant', 'override'] as const)('rejects controlled SQL with invalid %s authority', async kind => {
    const f = await fixture(kind === 'override' ? 'sd_pm_pe' : 'owner')
    const changed = { status_reason: 'Synthetic lifecycle', status_changed_at: new Date(), status_changed_by: f.actorId }
    if (kind === 'actor') await db.update(users).set({ account_status: 'suspended', ...changed }).where(eq(users.id, f.actorId))
    if (kind === 'tenant') await db.update(tenants).set({ status: 'suspended', ...changed }).where(eq(tenants.id, f.tenantId))
    let error: unknown
    const rollback = new Error('Synthetic rollback')
    try { await db.transaction(async tx => {
      await f.stamp(tx)
      try { await tx.execute(sql`insert into public.mobilization_readiness (tenant_id,project_id,created_by,updated_by,started_at,started_by,override_reason,override_at,override_by)
        values (${f.tenantId},${f.projectId},${f.actorId},${f.actorId},now(),${f.actorId},'Synthetic override',now(),${f.actorId})`) } catch (caught) { error = caught; throw caught }
      throw rollback
    }) } catch (caught) { if (caught !== rollback && !error) throw caught }
    expect(pgCode(error)).toBe('42501')
    expect(await f.snapshot()).toEqual([])
  })
  it.each(['missingStamp', 'created_by', 'updated_by', 'started_by', 'override_by'] as const)('rejects forged %s attribution', async field => {
    const f = await fixture()
    await expect(db.transaction(async tx => {
      if (field !== 'missingStamp') await f.stamp(tx)
      await tx.execute(sql`insert into public.mobilization_readiness
        (tenant_id, project_id, created_by, updated_by, started_at, started_by, override_reason, override_at, override_by)
        values (${f.tenantId}, ${f.projectId}, ${field === 'created_by' ? f.otherId : f.actorId},
          ${field === 'updated_by' ? f.otherId : f.actorId}, now(), ${field === 'started_by' ? f.otherId : f.actorId},
          'Synthetic override', now(), ${field === 'override_by' ? f.otherId : f.actorId})`)
    })).rejects.toSatisfy(error => pgCode(error) === '42501')
    expect(await f.snapshot()).toEqual([])
  })
  it('revokes anonymous mutation and retains forced row security', async () => {
    const rows = await db.execute(sql`select
      has_table_privilege('anon', 'public.mobilization_readiness', 'INSERT') as insert_allowed,
      has_table_privilege('anon', 'public.mobilization_readiness', 'UPDATE') as update_allowed,
      has_table_privilege('anon', 'public.mobilization_readiness', 'DELETE') as delete_allowed,
      relrowsecurity, relforcerowsecurity
      from pg_class where oid = 'public.mobilization_readiness'::regclass`)
    expect(rows[0]).toMatchObject({ insert_allowed: false, update_allowed: false, delete_allowed: false, relrowsecurity: true, relforcerowsecurity: true })
  })
})
