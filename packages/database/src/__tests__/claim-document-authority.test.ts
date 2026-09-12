import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inRollback, seedTwoTenants } from './_db-harness'

const expected = process.env.DATABASE_HARDENING_EXPECTED === '1'
const suite = expected ? describe : describe.skip

async function seedClaim(tx: postgres.TransactionSql, tenantId: string, userId: string) {
  const [project] = await tx<{ id: string }[]>`insert into public.projects(tenant_id,name,client,project_type) values(${tenantId},'Claim authority proof','Synthetic','mep') returning id`
  const [document] = await tx<{ id: string }[]>`insert into public.documents(tenant_id,project_id,document_type,file_name,storage_path,mime_type,size_bytes) values(${tenantId},${project!.id},'pdf','Evidence.pdf',${randomUUID()},'application/pdf',1) returning id`
  const [claim] = await tx<{ id: string }[]>`insert into public.progress_claims(tenant_id,project_id,claim_number,milestone_pct) values(${tenantId},${project!.id},${randomUUID().slice(0, 20)},10) returning id`
  const [attachment] = await tx<{ id: string }[]>`insert into public.progress_claim_documents(tenant_id,claim_id,document_id,uploaded_by) values(${tenantId},${claim!.id},${document!.id},${userId}) returning id`
  return { projectId: project!.id, claimId: claim!.id, documentId: document!.id, attachmentId: attachment!.id }
}

suite('Claim attachment direct database authority', () => {
  let sql: postgres.Sql
  beforeAll(() => {
    const connection = process.env.DATABASE_URL
    if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
      throw new Error('Claim authority proofs require an explicitly configured loopback disposable database')
    }
    sql = postgres(connection, { max: 1, prepare: false, onnotice: () => {} })
  })
  afterAll(async () => { await sql?.end() })

  it('candidate migrations preserve representative baseline access without relying on post-migration CI grants', async () => {
    await inRollback(sql, async (tx) => {
      const tables = ['documents', 'progress_claims', 'tenants', 'projects', 'progress_claim_documents']
      // Exact representative pre-migration grants, confined to this rollback.
      // This catches revocation bugs that the post-schema CI fixture could mask.
      await tx.unsafe('grant select on public.documents, public.progress_claims, public.tenants, public.projects, public.progress_claim_documents to authenticated')
      await tx.unsafe('grant select, insert, update, delete, truncate on public.documents, public.progress_claims, public.tenants, public.projects, public.progress_claim_documents to service_role')
      await tx.unsafe('grant insert, update, delete, truncate, references, trigger on public.progress_claim_documents to authenticated')
      await tx.unsafe('grant update(caption) on public.progress_claim_documents to authenticated')
      await tx.unsafe('grant delete, truncate on public.documents, public.progress_claims, public.tenants to authenticated')
      await tx.unsafe('grant truncate on public.projects to authenticated')
      for (const file of ['20260912130031_claim_document_core_authority.sql', '20260912131004_claim_document_parent_delete_authority.sql']) {
        const source = readFileSync(new URL(`../../../../supabase/migrations/${file}`, import.meta.url), 'utf8')
        // Remove only the outer transaction statements so real candidate SQL
        // executes inside the harness rollback; never commit fixture privileges.
        expect(source.match(/^begin;\s*$/gim)).toHaveLength(1)
        expect(source.match(/^commit;\s*$/gim)).toHaveLength(1)
        await tx.unsafe(source.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, ''))
      }
      for (const table of tables) {
        const [reader] = await tx<{ allowed: boolean }[]>`select has_table_privilege('authenticated',${'public.' + table},'SELECT') as allowed`
        expect(reader!.allowed, `preserved authenticated ${table} SELECT`).toBe(true)
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const [server] = await tx<{ allowed: boolean }[]>`select has_table_privilege('service_role',${'public.' + table},${privilege}) as allowed`
          expect(server!.allowed, `preserved service_role ${table} ${privilege}`).toBe(true)
        }
        for (const role of ['anon', 'authenticated']) {
          for (const privilege of ['DELETE', 'TRUNCATE']) {
            const [client] = await tx<{ allowed: boolean }[]>`select has_table_privilege(${role},${'public.' + table},${privilege}) as allowed`
            expect(client!.allowed, `denied ${role} ${table} ${privilege}`).toBe(false)
          }
        }
      }
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const [client] = await tx<{ allowed: boolean }[]>`select has_table_privilege(${role},'public.progress_claim_documents',${privilege}) as allowed`
          expect(client!.allowed, `denied ${role} attachment ${privilege}`).toBe(false)
        }
        for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) {
          const [client] = await tx<{ allowed: boolean }[]>`select has_any_column_privilege(${role},'public.progress_claim_documents',${privilege}) as allowed`
          expect(client!.allowed, `denied ${role} attachment column ${privilege}`).toBe(false)
        }
      }
    })
  })

  it('denies direct mutation grants while preserving authenticated reads and service writes', async () => {
    const roles = ['anon', 'authenticated']
    for (const role of roles) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const [row] = await sql<{ allowed: boolean }[]>`select has_table_privilege(${role},'public.progress_claim_documents',${privilege}) as allowed`
        expect(row!.allowed, `${role} ${privilege}`).toBe(false)
      }
      for (const privilege of ['INSERT', 'UPDATE', 'REFERENCES']) {
        const [row] = await sql<{ allowed: boolean }[]>`select has_any_column_privilege(${role},'public.progress_claim_documents',${privilege}) as allowed`
        expect(row!.allowed, `${role} column ${privilege}`).toBe(false)
      }
    }
    const [row] = await sql<{ read: boolean }[]>`select has_table_privilege('authenticated','public.progress_claim_documents','SELECT') as read`
    expect(row).toEqual({ read: true })
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const [service] = await sql<{ allowed: boolean }[]>`select has_table_privilege('service_role','public.progress_claim_documents',${privilege}) as allowed`
      expect(service!.allowed, `service_role ${privilege}`).toBe(true)
    }
  })

  it.each(['anon', 'authenticated'] as const)('rejects actual %s insert/update/delete with no persisted effects', async (role) => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const data = await seedClaim(tx, tenants.tenantA, tenants.userA)
      const before = await tx`select * from public.progress_claim_documents where id=${data.attachmentId}`
      const auditsBefore = await tx`select * from public.audit_log where tenant_id=${tenants.tenantA} order by id`
      for (const action of ['insert', 'update', 'delete']) {
        await expect(tx.savepoint(async (probe) => {
          await probe`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role })},true)`
          await probe.unsafe(role === 'anon' ? 'set local role anon' : 'set local role authenticated')
          if (action === 'insert') await probe`insert into public.progress_claim_documents(tenant_id,claim_id,document_id) values(${tenants.tenantA},${data.claimId},${data.documentId})`
          else if (action === 'update') await probe`update public.progress_claim_documents set caption='forbidden' where id=${data.attachmentId}`
          else await probe`delete from public.progress_claim_documents where id=${data.attachmentId}`
        })).rejects.toMatchObject({ code: '42501' })
      }
      expect(await tx`select * from public.progress_claim_documents where id=${data.attachmentId}`).toEqual(before)
      expect(await tx`select * from public.audit_log where tenant_id=${tenants.tenantA} order by id`).toEqual(auditsBefore)
    })
  })

  it('retains tenant-scoped authenticated SELECT without exposing another tenant', async () => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const own = await seedClaim(tx, tenants.tenantA, tenants.userA)
      const foreign = await seedClaim(tx, tenants.tenantB, tenants.userB)
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role: 'authenticated' })},true)`
      await tx.unsafe('set local role authenticated')
      expect(await tx`select id from public.progress_claim_documents where id in (${own.attachmentId},${foreign.attachmentId})`).toEqual([{ id: own.attachmentId }])
    })
  })

  it('keeps the trusted service role capable of inserting and auditing attachments', async () => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const data = await seedClaim(tx, tenants.tenantA, tenants.userA)
      const attachmentId = randomUUID()
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role: 'authenticated' })},true)`
      await tx.unsafe('set local role service_role')
      expect(await tx`insert into public.progress_claim_documents(id,tenant_id,claim_id,document_id,uploaded_by) values(${attachmentId},${tenants.tenantA},${data.claimId},${data.documentId},${tenants.userA}) returning id`).toEqual([{ id: attachmentId }])
      expect(await tx`select entity_id from public.audit_log where entity_type='progress_claim_documents' and entity_id=${attachmentId}`).toEqual([{ entity_id: attachmentId }])
    })
  })

  it('has a valid non-unique tenant/document index for the retention lookup', async () => {
    const [index] = await sql<{ valid: boolean; unique: boolean; definition: string }[]>`
      select i.indisvalid as valid, i.indisunique as unique, pg_get_indexdef(i.indexrelid) as definition
      from pg_index i where i.indexrelid=to_regclass('public.idx_progress_claim_docs_tenant_document')
    `
    expect(index).toMatchObject({ valid: true, unique: false })
    expect(index!.definition).toContain('(tenant_id, document_id)')
  })

  it('restrictive policies still deny writes after accidental table and column regrants', async () => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const data = await seedClaim(tx, tenants.tenantA, tenants.userA)
      await tx.unsafe('grant insert, update, delete on public.progress_claim_documents to authenticated')
      await tx.unsafe('grant update(caption) on public.progress_claim_documents to authenticated')
      await tx.unsafe('create policy synthetic_claim_write_grant on public.progress_claim_documents for all to authenticated using (true) with check (true)')
      await expect(tx.savepoint(async (probe) => {
        await probe`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role: 'authenticated' })},true)`
        await probe.unsafe('set local role authenticated')
        await probe`insert into public.progress_claim_documents(tenant_id,claim_id,document_id) values(${tenants.tenantA},${data.claimId},${data.documentId})`
      })).rejects.toMatchObject({ code: '42501' })
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role: 'authenticated' })},true)`
      await tx.unsafe('set local role authenticated')
      expect(await tx`update public.progress_claim_documents set caption='forbidden' where id=${data.attachmentId} returning id`).toHaveLength(0)
      expect(await tx`delete from public.progress_claim_documents where id=${data.attachmentId} returning id`).toHaveLength(0)
      expect(await tx`select caption from public.progress_claim_documents where id=${data.attachmentId}`).toEqual([{ caption: null }])
    })
  })

  it('denies parent DELETE/TRUNCATE without changing trusted server grants', async () => {
    for (const table of ['documents', 'progress_claims', 'projects', 'tenants']) {
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['DELETE', 'TRUNCATE']) {
          const [row] = await sql<{ allowed: boolean }[]>`select has_table_privilege(${role},${'public.' + table},${privilege}) as allowed`
          expect(row!.allowed, `${role} ${table} ${privilege}`).toBe(false)
        }
      }
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const [row] = await sql<{ allowed: boolean }[]>`select has_table_privilege('service_role',${'public.' + table},${privilege}) as allowed`
        expect(row!.allowed, `service_role ${table} ${privilege}`).toBe(true)
      }
    }
  })

  it.each(['anon', 'authenticated'] as const)('blocks actual %s parent deletion without cascading evidence or modifying audit', async (role) => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const data = await seedClaim(tx, tenants.tenantA, tenants.userA)
      const before = await tx`select * from public.progress_claim_documents where id=${data.attachmentId}`
      const auditBefore = await tx`select * from public.audit_log where tenant_id=${tenants.tenantA} order by id`
      for (const parent of ['documents', 'progress_claims', 'tenants']) {
        await expect(tx.savepoint(async (probe) => {
          await probe`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role })},true)`
          await probe.unsafe(role === 'anon' ? 'set local role anon' : 'set local role authenticated')
          if (parent === 'documents') await probe`delete from public.documents where id=${data.documentId}`
          else if (parent === 'progress_claims') await probe`delete from public.progress_claims where id=${data.claimId}`
          else await probe`delete from public.tenants where id=${tenants.tenantA}`
        })).rejects.toMatchObject({ code: '42501' })
      }
      expect(await tx`select * from public.progress_claim_documents where id=${data.attachmentId}`).toEqual(before)
      expect(await tx`select * from public.audit_log where tenant_id=${tenants.tenantA} order by id`).toEqual(auditBefore)
    })
  })

  it('rejects actual client TRUNCATE before any relation can be cleared', async () => {
    await inRollback(sql, async (tx) => {
      for (const role of ['anon', 'authenticated']) {
        for (const table of ['documents', 'progress_claims', 'projects', 'tenants']) {
          await expect(tx.savepoint(async (probe) => {
            await probe.unsafe(role === 'anon' ? 'set local role anon' : 'set local role authenticated')
            // Static allowlist; never CASCADE, and every probe is rollback-only.
            await probe.unsafe(`truncate table public.${table}`)
          })).rejects.toMatchObject({ code: '42501' })
        }
      }
    })
  })

  it('keeps unreferenced trusted-server document deletion usable and existing evidence untouched', async () => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const data = await seedClaim(tx, tenants.tenantA, tenants.userA)
      const [unreferenced] = await tx<{ id: string }[]>`insert into public.documents(tenant_id,project_id,document_type,file_name,storage_path,mime_type,size_bytes) values(${tenants.tenantA},${data.projectId},'pdf','Unreferenced.pdf',${randomUUID()},'application/pdf',1) returning id`
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role: 'authenticated' })},true)`
      await tx.unsafe('set local role service_role')
      expect(await tx`delete from public.documents where id=${unreferenced!.id} returning id`).toEqual([{ id: unreferenced!.id }])
      expect(await tx`select id from public.progress_claim_documents where id=${data.attachmentId}`).toEqual([{ id: data.attachmentId }])
    })
  })

  it.each(['documents', 'progress_claims', 'tenants'] as const)('keeps restrictive %s DELETE protection after accidental regrant', async (table) => {
    await inRollback(sql, async (tx) => {
      const tenants = await seedTwoTenants(tx)
      const data = await seedClaim(tx, tenants.tenantA, tenants.userA)
      // Identifiers come only from the static test-case allowlist.
      await tx.unsafe(`grant delete on public.${table} to authenticated`)
      await tx.unsafe(`create policy synthetic_parent_delete_grant on public.${table} for delete to authenticated using (true)`)
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: tenants.userA, role: 'authenticated' })},true)`
      await tx.unsafe('set local role authenticated')
      if (table === 'documents') expect(await tx`delete from public.documents where id=${data.documentId} returning id`).toHaveLength(0)
      else if (table === 'progress_claims') expect(await tx`delete from public.progress_claims where id=${data.claimId} returning id`).toHaveLength(0)
      else expect(await tx`delete from public.tenants where id=${tenants.tenantA} returning id`).toHaveLength(0)
      expect(await tx`select id from public.progress_claim_documents where id=${data.attachmentId}`).toEqual([{ id: data.attachmentId }])
    })
  })
})
