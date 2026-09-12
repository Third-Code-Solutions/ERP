import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inRollback, seedTwoTenants } from './_db-harness'

const expected = process.env.DATABASE_HARDENING_EXPECTED === '1'
const suite = expected ? describe : describe.skip
const artifactPrivileges = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

function migrationBody(): string {
  const directory = new URL('../../../../supabase/migrations/', import.meta.url)
  const files = readdirSync(directory).filter((file) => file.endsWith('_kyc_artifact_core_authority.sql'))
  expect(files).toHaveLength(1)
  const migration = readFileSync(new URL(files[0]!, directory), 'utf8')
  expect(migration.match(/^begin;\s*$/gim)).toHaveLength(1)
  expect(migration.match(/^commit;\s*$/gim)).toHaveLength(1)
  return migration.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, '')
}

async function seedArtifact(tx: postgres.TransactionSql, tenantId: string, userId: string) {
  const [account] = await tx<{ id: string }[]>`insert into accounts(tenant_id,name) values(${tenantId},'KYC authority account') returning id`
  const [opportunity] = await tx<{ id: string }[]>`insert into opportunities(tenant_id,account_id) values(${tenantId},${account!.id}) returning id`
  const [document] = await tx<{ id: string }[]>`insert into documents(tenant_id,opportunity_id,document_type,file_name,storage_path,mime_type,size_bytes) values(${tenantId},${opportunity!.id},'pdf','KYC evidence.pdf',${randomUUID()},'application/pdf',1) returning id`
  const [artifact] = await tx<{ id: string }[]>`insert into account_kyc_artifacts(tenant_id,account_id,document_id,artifact_type,uploaded_by) values(${tenantId},${account!.id},${document!.id},'other',${userId}) returning id`
  return { accountId: account!.id, opportunityId: opportunity!.id, documentId: document!.id, artifactId: artifact!.id }
}
async function assume(tx: postgres.TransactionSql, userId: string, role: 'anon' | 'authenticated') {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role })},true)`
  await tx.unsafe(role === 'anon' ? 'set local role anon' : 'set local role authenticated')
}
async function evidence(tx: postgres.TransactionSql, tenantId: string) {
  return {
    artifacts: await tx`select * from account_kyc_artifacts where tenant_id=${tenantId} order by id`,
    documents: await tx`select * from documents where tenant_id=${tenantId} order by id`,
    accounts: await tx`select * from accounts where tenant_id=${tenantId} order by id`,
    opportunities: await tx`select * from opportunities where tenant_id=${tenantId} order by id`,
    audit: await tx`select * from audit_log where tenant_id=${tenantId} order by id`,
  }
}

suite('KYC artifact direct database authority', () => {
  let sql: postgres.Sql
  beforeAll(() => {
    const connection = process.env.DATABASE_URL
    if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) throw new Error('KYC authority proof requires a loopback disposable PostgreSQL database')
    sql = postgres(connection, { max: 1, prepare: false, onnotice: () => {} })
  })
  afterAll(async () => { await sql?.end() })

  it('denies client artifact mutations and cascading parent maintenance grants', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of artifactPrivileges) {
        const [row] = await sql<{ allowed: boolean }[]>`select has_table_privilege(${role},'public.account_kyc_artifacts',${privilege}) as allowed`
        expect(row!.allowed, `${role} artifact ${privilege}`).toBe(false)
      }
      for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) {
        const [row] = await sql<{ allowed: boolean }[]>`select has_any_column_privilege(${role},'public.account_kyc_artifacts',${privilege}) as allowed`
        expect(row!.allowed, `${role} column ${privilege}`).toBe(false)
      }
      for (const table of ['accounts', 'opportunities']) {
        for (const privilege of ['DELETE', 'TRUNCATE']) {
          const [row] = await sql<{ allowed: boolean }[]>`select has_table_privilege(${role},${'public.' + table},${privilege}) as allowed`
          expect(row!.allowed, `${role} ${table} ${privilege}`).toBe(false)
        }
      }
      const [user] = await sql<{ allowed: boolean }[]>`select has_table_privilege(${role},'public.users','TRUNCATE') as allowed`
      expect(user!.allowed).toBe(false)
    }
  })

  it.each(['anon', 'authenticated'] as const)('rejects actual %s artifact writes and parent deletion without evidence loss', async (role) => {
    await inRollback(sql, async (tx) => {
      const f = await seedTwoTenants(tx), data = await seedArtifact(tx, f.tenantA, f.userA)
      const before = await evidence(tx, f.tenantA)
      for (const action of ['insert', 'update', 'delete', 'account-delete', 'opportunity-delete']) {
        await expect(tx.savepoint(async (probe) => {
          await assume(probe, f.userA, role)
          if (action === 'insert') await probe`insert into account_kyc_artifacts(tenant_id,account_id,artifact_type) values(${f.tenantA},${data.accountId},'other')`
          else if (action === 'update') await probe`update account_kyc_artifacts set notes='forbidden' where id=${data.artifactId}`
          else if (action === 'delete') await probe`delete from account_kyc_artifacts where id=${data.artifactId}`
          else if (action === 'account-delete') await probe`delete from accounts where id=${data.accountId}`
          else await probe`delete from opportunities where id=${data.opportunityId}`
        })).rejects.toMatchObject({ code: '42501' })
      }
      expect(await evidence(tx, f.tenantA)).toEqual(before)
    })
  })

  it('rejects client TRUNCATE without CASCADE and retains tenant-scoped reads', async () => {
    await inRollback(sql, async (tx) => {
      const f = await seedTwoTenants(tx), own = await seedArtifact(tx, f.tenantA, f.userA), other = await seedArtifact(tx, f.tenantB, f.userB)
      const before = await evidence(tx, f.tenantA)
      for (const role of ['anon', 'authenticated'] as const) {
        for (const table of ['account_kyc_artifacts', 'accounts', 'opportunities', 'users']) {
          await expect(tx.savepoint(async (probe) => {
            await assume(probe, f.userA, role)
            // Static allowlist, rollback-only, never CASCADE.
            await probe.unsafe(`truncate table public.${table}`)
          })).rejects.toMatchObject({ code: '42501' })
        }
      }
      expect(await evidence(tx, f.tenantA)).toEqual(before)
      await assume(tx, f.userA, 'authenticated')
      expect(await tx`select id from account_kyc_artifacts where id in (${own.artifactId},${other.artifactId})`).toEqual([{ id: own.artifactId }])
    })
  })

  it('has a valid nonunique tenant/document retention lookup index', async () => {
    const [row] = await sql<{ valid: boolean; unique: boolean; definition: string }[]>`select indisvalid as valid, indisunique as unique, pg_get_indexdef(indexrelid) as definition from pg_index where indexrelid=to_regclass('public.idx_account_kyc_tenant_document')`
    expect(row).toMatchObject({ valid: true, unique: false })
    expect(row!.definition).toContain('(tenant_id, document_id)')
  })

  it('retains restrictive artifact and parent denial after accidental regrants', async () => {
    await inRollback(sql, async (tx) => {
      const f = await seedTwoTenants(tx), data = await seedArtifact(tx, f.tenantA, f.userA)
      const before = await evidence(tx, f.tenantA)
      await tx.unsafe('grant insert, update, delete on account_kyc_artifacts to authenticated')
      await tx.unsafe('grant update(notes) on account_kyc_artifacts to authenticated')
      await tx.unsafe('create policy synthetic_kyc_write on account_kyc_artifacts for all to authenticated using(true) with check(true)')
      for (const table of ['accounts', 'opportunities']) {
        await tx.unsafe(`grant delete on public.${table} to authenticated`)
        await tx.unsafe(`create policy synthetic_kyc_parent on public.${table} for delete to authenticated using(true)`)
      }
      await expect(tx.savepoint(async (probe) => {
        await assume(probe, f.userA, 'authenticated')
        await probe`insert into account_kyc_artifacts(tenant_id,account_id,artifact_type) values(${f.tenantA},${data.accountId},'other')`
      })).rejects.toMatchObject({ code: '42501' })
      await tx.savepoint(async (probe) => {
        await assume(probe, f.userA, 'authenticated')
        expect(await probe`update account_kyc_artifacts set notes='forbidden' where id=${data.artifactId} returning id`).toHaveLength(0)
        expect(await probe`delete from account_kyc_artifacts where id=${data.artifactId} returning id`).toHaveLength(0)
        expect(await probe`delete from accounts where id=${data.accountId} returning id`).toHaveLength(0)
        expect(await probe`delete from opportunities where id=${data.opportunityId} returning id`).toHaveLength(0)
        await probe.unsafe('reset role')
      })
      expect(await evidence(tx, f.tenantA)).toEqual(before)
    })
  })

  it('preserves representative legacy read/server and unrelated account/opportunity grants when real migration reapplies', async () => {
    await inRollback(sql, async (tx) => {
      const f = await seedTwoTenants(tx)
      await seedArtifact(tx, f.tenantA, f.userA)
      await tx.unsafe('grant select, insert, update, delete, truncate, references, trigger on account_kyc_artifacts, accounts, opportunities to authenticated, service_role')
      await tx.unsafe('grant insert(notes), update(notes), references(id) on account_kyc_artifacts to authenticated')
      // Independent grants on a future column must also be removed dynamically.
      await tx.unsafe('alter table account_kyc_artifacts add column synthetic_grant_probe text')
      await tx.unsafe('grant insert(synthetic_grant_probe), update(synthetic_grant_probe), references(synthetic_grant_probe) on account_kyc_artifacts to public, anon, authenticated')
      await tx.unsafe('grant select, truncate on users to authenticated')
      await tx.unsafe('grant select, insert, update, delete, truncate on users to service_role')
      const before = await evidence(tx, f.tenantA)
      await tx.unsafe(migrationBody())
      for (const table of ['account_kyc_artifacts', 'accounts', 'opportunities', 'users']) {
        const [reader] = await tx<{ allowed: boolean }[]>`select has_table_privilege('authenticated',${'public.' + table},'SELECT') as allowed`
        expect(reader!.allowed, `${table} SELECT`).toBe(true)
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const [server] = await tx<{ allowed: boolean }[]>`select has_table_privilege('service_role',${'public.' + table},${privilege}) as allowed`
          expect(server!.allowed, `service_role ${table} ${privilege}`).toBe(true)
        }
      }
      for (const table of ['accounts', 'opportunities']) for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES', 'TRIGGER']) {
        const [row] = await tx<{ allowed: boolean }[]>`select has_table_privilege('authenticated',${'public.' + table},${privilege}) as allowed`
        expect(row!.allowed, `preserved ${table} ${privilege}`).toBe(true)
      }
      for (const privilege of artifactPrivileges) {
        const [row] = await tx<{ allowed: boolean }[]>`select has_table_privilege('authenticated','public.account_kyc_artifacts',${privilege}) as allowed`
        expect(row!.allowed, privilege).toBe(false)
      }
      for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) {
        const [row] = await tx<{ allowed: boolean }[]>`select has_any_column_privilege('authenticated','public.account_kyc_artifacts',${privilege}) as allowed`
        expect(row!.allowed, `column ${privilege}`).toBe(false)
      }
      for (const role of ['anon', 'authenticated']) {
        for (const table of ['accounts', 'opportunities', 'users']) {
          const [maintenance] = await tx<{ allowed: boolean }[]>`select has_table_privilege(${role},${'public.' + table},'TRUNCATE') as allowed`
          expect(maintenance!.allowed, `${role} ${table} TRUNCATE`).toBe(false)
          if (table !== 'users') {
            const [deletion] = await tx<{ allowed: boolean }[]>`select has_table_privilege(${role},${'public.' + table},'DELETE') as allowed`
            expect(deletion!.allowed, `${role} ${table} DELETE`).toBe(false)
          }
        }
        for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) {
          const [column] = await tx<{ allowed: boolean }[]>`select has_any_column_privilege(${role},'public.account_kyc_artifacts',${privilege}) as allowed`
          expect(column!.allowed, `${role} future column ${privilege}`).toBe(false)
        }
      }
      expect(await evidence(tx, f.tenantA)).toEqual(before)
    })
  })

  it('preserves service-role audited artifact insertion and unrelated authenticated account updates', async () => {
    await inRollback(sql, async (tx) => {
      const f = await seedTwoTenants(tx), data = await seedArtifact(tx, f.tenantA, f.userA)
      const id = randomUUID()
      await tx.unsafe('set local role service_role')
      expect(await tx`insert into account_kyc_artifacts(id,tenant_id,account_id,artifact_type) values(${id},${f.tenantA},${data.accountId},'other') returning id`).toEqual([{ id }])
      expect(await tx`select entity_id from audit_log where entity_type='account_kyc_artifacts' and entity_id=${id}`).toEqual([{ entity_id: id }])
      await tx.unsafe('reset role')
      await assume(tx, f.userA, 'authenticated')
      expect(await tx`update accounts set name='Still editable' where id=${data.accountId} returning name`).toEqual([{ name: 'Still editable' }])
      expect(await tx`update opportunities set remarks='Still editable' where id=${data.opportunityId} returning remarks`).toEqual([{ remarks: 'Still editable' }])
    })
  })

  it('fails boundedly on a busy artifact relation without persisting migration effects', async () => {
    const holder = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })
    let entered = () => {}, release = () => {}
    const ready = new Promise<void>((resolve) => { entered = resolve })
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const held = holder.begin(async (tx) => {
      await tx.unsafe('lock table public.account_kyc_artifacts in access share mode')
      entered(); await barrier
    })
    try {
      await ready
      const before = await sql`select relacl from pg_class where oid='public.account_kyc_artifacts'::regclass`
      await expect(inRollback(sql, async (tx) => { await tx.unsafe(migrationBody()) })).rejects.toMatchObject({ code: '55P03' })
      expect(await sql`select relacl from pg_class where oid='public.account_kyc_artifacts'::regclass`).toEqual(before)
    } finally { release(); await held; await holder.end() }
  }, 15000)
})
