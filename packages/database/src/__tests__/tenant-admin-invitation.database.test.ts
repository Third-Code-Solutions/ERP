/**
 * B1: Admin -> Users -> New records a `platform_user_invitations` row for the
 * admin's own tenant, then calls Supabase Auth admin `createUser`. These probes
 * replay GoTrue's write order for that call (INSERT with provider-only
 * app_metadata, then a separate confirmation UPDATE) and prove the Auth insert
 * triggers bind the identity to the inviter's tenant.
 *
 * They need a migrated database (DATABASE_URL); they are skipped otherwise.
 * They do not go through GoTrue itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type postgres from 'postgres'

import {
  becomeAuthenticated,
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const runtimeDescribe = DATABASE_URL ? describe : describe.skip

async function count(tx: postgres.TransactionSql, statement: string, values: string[] = []): Promise<number> {
  const [row] = await tx.unsafe<Array<{ n: number }>>(statement, values)
  return Number(row?.n ?? 0)
}

async function inviteToTenant(
  tx: postgres.TransactionSql,
  tenantId: string,
  inviterId: string,
  email: string,
  role = 'viewer'
): Promise<string> {
  const [row] = await tx.unsafe<Array<{ id: string }>>(
    `insert into public.platform_user_invitations
       (tenant_id, normalized_email, full_name, role, invited_by)
     values ($1, $2, 'Invited Colleague', $3, $4)
     on conflict do nothing
     returning id`,
    [tenantId, email, role, inviterId]
  )
  if (!row) throw new Error('Invitation fixture was not created')
  return row.id
}

/** GoTrue admin createUser: Create (INSERT, provider-only app_metadata), then Confirm (UPDATE). */
async function adminCreateAuthUser(tx: postgres.TransactionSql, email: string): Promise<string> {
  const id = crypto.randomUUID()
  await tx.unsafe(
    `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
     values ($1, $2, '{"provider":"email","providers":["email"]}'::jsonb,
             '{"full_name":"Invited Colleague"}'::jsonb, null)`,
    [id, email]
  )
  await tx.unsafe('update auth.users set email_confirmed_at = now() where id = $1', [id])
  return id
}

runtimeDescribe('B1 tenant-admin invite provisioning (runtime)', () => {
  let sql: ReturnType<typeof makeSql>

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  it("binds the new identity to the inviter's tenant with one public.users row and no new tenant", async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const email = `colleague-${crypto.randomUUID()}@probe.test`
      const invitationId = await inviteToTenant(tx, tenantA, userA, email, 'pm')
      const tenantsBefore = await count(tx, 'select count(*)::int as n from public.tenants')

      const authUserId = await adminCreateAuthUser(tx, email)

      expect(await count(tx, 'select count(*)::int as n from public.tenants')).toBe(tenantsBefore)
      expect(await count(tx, 'select count(*)::int as n from public.users where email = $1', [email])).toBe(1)
      const [provisioned] = await tx.unsafe<Array<Record<string, string>>>(
        `select app_user.tenant_id, app_user.role::text as role, app_user.account_status::text as account_status,
                invitation.status::text as invitation_status, invitation.auth_user_id
           from public.users as app_user
           join public.platform_user_invitations as invitation on invitation.id = $2
          where app_user.id = $1`,
        [authUserId, invitationId]
      )
      expect(provisioned).toEqual({
        tenant_id: tenantA,
        role: 'pm',
        account_status: 'invited',
        invitation_status: 'sent',
        auth_user_id: authUserId,
      })

      await becomeAuthenticated(tx, authUserId)
      const [activation] = await tx.unsafe<Array<{ activated: boolean }>>(
        'select public.activate_current_invited_user() as activated'
      )
      await tx.unsafe('reset role')
      expect(activation?.activated).toBe(true)
      const [active] = await tx.unsafe<Array<{ tenant_id: string; account_status: string }>>(
        'select tenant_id, account_status::text as account_status from public.users where id = $1',
        [authUserId]
      )
      expect(active).toEqual({ tenant_id: tenantA, account_status: 'active' })
    })
  })

  it('refuses a second open invitation for the same email, even for another tenant', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const email = `contested-${crypto.randomUUID()}@probe.test`
      await inviteToTenant(tx, tenantA, userA, email)

      const second = await tx.unsafe<Array<{ id: string }>>(
        `insert into public.platform_user_invitations
           (tenant_id, normalized_email, full_name, role, invited_by)
         values ($1, $2, 'Invited Colleague', 'viewer', $3)
         on conflict do nothing
         returning id`,
        [tenantB, email, userB]
      )
      expect(second).toHaveLength(0)
    })
  })

  it('a closed (failed) invitation can be re-issued and never binds a later identity', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const email = `retry-${crypto.randomUUID()}@probe.test`
      const failedId = await inviteToTenant(tx, tenantA, userA, email)
      await tx.unsafe(
        `update public.platform_user_invitations set status = 'failed', failure_reason = 'probe'
          where id = $1`,
        [failedId]
      )

      // With no open invitation the identity has no profile, so Auth's insert is refused.
      await expect(
        tx.savepoint((savepoint) => adminCreateAuthUser(savepoint, email))
      ).rejects.toMatchObject({ code: 'P0001' })
      const [placed] = await tx.unsafe<Array<{ n: number }>>(
        'select count(*)::int as n from public.users where email = $1',
        [email]
      )
      expect(placed?.n).toBe(0)
      const [failed] = await tx.unsafe<Array<{ status: string; auth_user_id: string | null }>>(
        'select status::text as status, auth_user_id from public.platform_user_invitations where id = $1',
        [failedId]
      )
      expect(failed).toEqual({ status: 'failed', auth_user_id: null })

      // The closed invitation no longer blocks a re-invite of the same email.
      await expect(inviteToTenant(tx, tenantA, userA, email)).resolves.not.toBe(failedId)
    })
  })

  it('a bound invitation closed by compensation cannot activate the identity', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const email = `compensated-${crypto.randomUUID()}@probe.test`
      const invitationId = await inviteToTenant(tx, tenantA, userA, email, 'admin')
      const authUserId = await adminCreateAuthUser(tx, email)
      await tx.unsafe(
        `update public.platform_user_invitations set status = 'failed', failure_reason = 'probe'
          where id = $1 and status in ('pending', 'sent')`,
        [invitationId]
      )

      await becomeAuthenticated(tx, authUserId)
      const [activation] = await tx.unsafe<Array<{ activated: boolean }>>(
        'select public.activate_current_invited_user() as activated'
      )
      const [tenantIdentity] = await tx.unsafe<Array<{ tenant_id: string | null }>>(
        'select public.auth_tenant_id() as tenant_id'
      )
      await tx.unsafe('reset role')
      expect(activation?.activated).toBe(false)
      expect(tenantIdentity?.tenant_id).toBeNull()
      const [user] = await tx.unsafe<Array<{ account_status: string }>>(
        'select account_status::text as account_status from public.users where id = $1',
        [authUserId]
      )
      expect(user?.account_status).toBe('invited')
    })
  })
})
