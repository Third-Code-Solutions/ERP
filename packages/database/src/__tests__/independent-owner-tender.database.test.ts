import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { becomeAuthenticated, inRollback, seedTwoTenants } from './_db-harness'

const suite = process.env.DATABASE_HARDENING_EXPECTED === '1' ? describe : describe.skip
const tenderTables = [
  'tender_packages', 'tender_deviations', 'tender_evaluation_criteria',
  'tender_vendor_profiles', 'tender_evaluation_scores',
] as const

async function failureCode(tx: postgres.TransactionSql, statement: string, values: string[] = []) {
  await tx.unsafe('savepoint expected_denial')
  let code: string | undefined
  try {
    await tx.unsafe(statement, values)
  } catch (error) {
    if (error instanceof postgres.PostgresError) code = error.code
    else throw error
  } finally {
    await tx.unsafe('rollback to savepoint expected_denial')
    await tx.unsafe('release savepoint expected_denial')
  }
  return code
}

async function ownerFixture(tx: postgres.TransactionSql) {
  const seeded = await seedTwoTenants(tx)
  const email = `${seeded.userA}@independent.example.invalid`
  await tx`update public.users set email=${email} where id=${seeded.userA}`
  await tx`insert into auth.users(id,email,email_confirmed_at) values(${seeded.userA},${email},now())`
  return { ...seeded, email }
}

suite('Independent owner bootstrap and tender Core authority', () => {
  let sql: postgres.Sql
  beforeAll(() => {
    const connection = process.env.DATABASE_URL
    if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
      throw new Error('Authority proofs require an explicit loopback disposable database')
    }
    sql = postgres(connection, { max: 1, prepare: false, onnotice: () => {} })
  })
  afterAll(async () => { await sql?.end() })

  it('bootstraps a verified independent owner once, audits atomically, and preserves immutable identity', async () => {
    await inRollback(sql, async (tx) => {
      const { userA, userB, email } = await ownerFixture(tx)
      const [result] = await tx<{ trace: string }[]>`select erp_private.bootstrap_platform_owner(${userA},${email},'Independent install proof') as trace`
      expect(result?.trace).toBeTruthy()
      const events = await tx`select actor_id from public.platform_audit_events where trace_id=${result!.trace} and action='platform.owner.bootstrap'`
      expect(events).toEqual([{ actor_id: userA }])
      expect(await failureCode(tx, 'select erp_private.bootstrap_platform_owner($1,$2,$3)', [userA, email, 'Repeat attempt'])).toBe('55000')
      expect(await failureCode(tx, 'update public.platform_role_assignments set user_id=$1 where user_id=$2', [userB, userA])).toBe('42501')
      expect(await failureCode(tx, 'delete from public.platform_role_assignments where user_id=$1', [userA])).toBe('42501')

      await becomeAuthenticated(tx, userA)
      expect(await tx`select public.is_platform_owner() as allowed`).toEqual([{ allowed: true }])
      await tx.unsafe('reset role')
      await becomeAuthenticated(tx, userB)
      expect(await tx`select public.is_platform_owner() as allowed`).toEqual([{ allowed: false }])
      await tx.unsafe('reset role')
      await tx`update auth.users set email='changed@example.invalid' where id=${userA}`
      await becomeAuthenticated(tx, userA)
      expect(await tx`select public.is_platform_owner() as allowed`).toEqual([{ allowed: false }])
    })
  })

  it.each(['anon', 'authenticated', 'service_role'])('does not expose bootstrap to %s', async (role) => {
    await inRollback(sql, async (tx) => {
      const { userA, email } = await ownerFixture(tx)
      await tx.unsafe(`set local role ${role}`)
      expect(await failureCode(tx, 'select erp_private.bootstrap_platform_owner($1,$2,$3)', [userA, email, 'Denied caller'])).toBe('42501')
    })
  })

  it.each(['unverified', 'wrong-email', 'inactive-user', 'inactive-tenant'] as const)('denies %s bootstrap', async (condition) => {
    await inRollback(sql, async (tx) => {
      const { userA, userB, tenantA, email } = await ownerFixture(tx)
      if (condition === 'unverified') await tx`update auth.users set email_confirmed_at=null where id=${userA}`
      if (condition === 'inactive-user') {
        await tx`update public.users set account_status='suspended',status_reason='Proof',status_changed_at=now(),status_changed_by=${userB} where id=${userA}`
      }
      if (condition === 'inactive-tenant') {
        await tx`update public.tenants set status='suspended',status_reason='Proof',status_changed_at=now(),status_changed_by=${userB} where id=${tenantA}`
      }
      expect(await failureCode(tx, 'select erp_private.bootstrap_platform_owner($1,$2,$3)', [userA, condition === 'wrong-email' ? 'wrong@example.invalid' : email, 'Denied bootstrap'])).toBe('42501')
      expect(await tx`select user_id from public.platform_role_assignments`).toHaveLength(0)
    })
  })

  it('rolls back ownership when its audit insert fails', async () => {
    await inRollback(sql, async (tx) => {
      const { userA, email } = await ownerFixture(tx)
      await tx.unsafe(`create function pg_temp.reject_bootstrap_audit() returns trigger language plpgsql as
        $$ begin raise exception 'injected failure'; end $$;
        create trigger reject_bootstrap_audit before insert on public.platform_audit_events
        for each row execute function pg_temp.reject_bootstrap_audit()`)
      expect(await failureCode(tx, 'select erp_private.bootstrap_platform_owner($1,$2,$3)', [userA, email, 'Rollback proof'])).toBe('P0001')
      expect(await tx`select user_id from public.platform_role_assignments`).toHaveLength(0)
    })
  })

  it('retains tenant reads and trusted writes while denying every direct tender mutation', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA, userB } = await seedTwoTenants(tx)
      await tx`update public.users set role='viewer' where id=${userA}`
      const [project] = await tx<{ id: string }[]>`insert into public.projects(tenant_id,name,client,project_type) values(${tenantA},'Tender proof','Synthetic','mep') returning id`
      const [opportunity] = await tx<{ id: string }[]>`insert into public.opportunities(tenant_id,project_id) values(${tenantA},${project!.id}) returning id`
      const [tender] = await tx<{ id: string }[]>`insert into public.tender_packages(tenant_id,opportunity_id,title,reference,source_mode) values(${tenantA},${opportunity!.id},'Proof','PROOF','client_issued_boq') returning id`
      for (const table of tenderTables) {
        for (const role of ['anon', 'authenticated']) {
          for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) {
            const [result] = await tx<{ allowed: boolean }[]>`select has_table_privilege(${role},${'public.' + table},${privilege}) as allowed`
            expect(result?.allowed, `${role} ${table} ${privilege}`).toBe(false)
          }
        }
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const [result] = await tx<{ allowed: boolean }[]>`select has_table_privilege('service_role',${'public.' + table},${privilege}) as allowed`
          expect(result?.allowed, `service_role ${table} ${privilege}`).toBe(true)
        }
      }
      await becomeAuthenticated(tx, userA)
      expect(await tx`select id from public.tender_packages where id=${tender!.id}`).toHaveLength(1)
      expect(await failureCode(tx, "update public.tender_packages set status='submitted' where id=$1", [tender!.id])).toBe('42501')
      expect(await failureCode(tx, 'delete from public.tender_packages where id=$1', [tender!.id])).toBe('42501')
      expect(await failureCode(tx, "insert into public.tender_packages(tenant_id,opportunity_id,title,reference,source_mode) values($1,$2,'Denied','DENIED','client_issued_boq')", [tenantA, opportunity!.id])).toBe('42501')
      await tx.unsafe('reset role')
      await becomeAuthenticated(tx, userB)
      expect(await tx`select id from public.tender_packages where id=${tender!.id}`).toHaveLength(0)
      await tx.unsafe('reset role')
      await tx.unsafe('set local role service_role')
      expect(await tx`update public.tender_packages set title='Trusted update' where id=${tender!.id} returning id`).toHaveLength(1)
    })
  })

  it('denies tender writes even if broad grants and permissive policies are accidentally restored', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      await tx.unsafe('grant insert, update, delete on public.tender_packages to authenticated')
      await tx.unsafe('create policy accidental_grant on public.tender_packages for all to authenticated using (true) with check (true)')
      await becomeAuthenticated(tx, userA)
      expect(await failureCode(tx, "insert into public.tender_packages(tenant_id,opportunity_id,title,reference,source_mode) values($1,gen_random_uuid(),'Denied','DENIED','client_issued_boq')", [tenantA])).toBe('42501')
      expect(await tx`update public.tender_packages set title='Denied' returning id`).toHaveLength(0)
      expect(await tx`delete from public.tender_packages returning id`).toHaveLength(0)
    })
  })
})
