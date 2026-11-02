import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { becomeAuthenticated, inRollback, makeSql, seedTwoTenants } from './_db-harness'

const suite = process.env.DATABASE_HARDENING_EXPECTED === '1' ? describe : describe.skip

suite('ADR-044 server-owned application table writes', () => {
  const sql = makeSql()
  afterAll(async () => { await sql.end() })

  it('denies all effective client table and column mutation powers while retaining read contracts', async () => {
    const violations = await sql`
      select c.relname,r.rolname,permission.name from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
      cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) permission(name)
      where n.nspname='public' and c.relkind in ('r','p')
        and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
        and (has_table_privilege(r.rolname,c.oid,permission.name)
          or (permission.name in ('INSERT','UPDATE','REFERENCES')
            and has_any_column_privilege(r.rolname,c.oid,case when permission.name in ('INSERT','UPDATE','REFERENCES') then permission.name else 'SELECT' end)))`
    expect(violations).toEqual([])
    const [contracts] = await sql`select
      has_table_privilege('authenticated','public.users','SELECT') as users_read,
      has_table_privilege('authenticated','public.boms','SELECT') as boms_read,
      has_function_privilege('authenticated','public.activate_current_invited_user()','EXECUTE') as invitation,
      has_function_privilege('authenticated','public.is_platform_owner()','EXECUTE') as owner_check,
      has_table_privilege('service_role','public.notifications','INSERT') as service_notifications,
      has_table_privilege('service_role','public.cnps_surveys','INSERT') as service_surveys`
    expect(contracts).toEqual({ users_read: true, boms_read: true, invitation: true, owner_check: true, service_notifications: true, service_surveys: true })
  })

  it('does not give newly migrated tables client mutation privileges', async () => {
    await inRollback(sql, async tx => {
      await tx`create table public.abi_client_privilege_probe (id integer)`
      const grants = await tx`select r.rolname, p.name from pg_roles r
        cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(name)
        where r.rolname in ('anon','authenticated') and has_table_privilege(r.rolname,'public.abi_client_privilege_probe',p.name)`
      expect(grants).toEqual([])
    })
  })

  it('blocks Viewer token minting, feature activation and outbox writes before row constraints', async () => {
    await inRollback(sql, async tx => {
      const { userA } = await seedTwoTenants(tx)
      await tx`update users set role='viewer' where id=${userA}`
      await becomeAuthenticated(tx, userA)
      for (const table of ['bom_portal_tokens', 'warranty_portal_tokens', 'signature_sessions', 'tenant_feature_flags', 'provider_delivery_outbox']) {
        let code: string | undefined
        try { await tx.savepoint(async probe => { await probe.unsafe(`insert into public.${table} default values`) }) }
        catch (error) { if (error instanceof postgres.PostgresError) code = error.code; else throw error }
        expect(code, table).toBe('42501')
      }
    })
  })
})
