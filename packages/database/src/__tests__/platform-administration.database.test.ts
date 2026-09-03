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

async function failureCode(
  tx: postgres.TransactionSql,
  statement: string,
  values: postgres.ParameterOrJSON<never>[] = []
): Promise<string | undefined> {
  await tx.unsafe('savepoint platform_expected_failure')
  let code: string | undefined
  try {
    await tx.unsafe(statement, values)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const candidate = error.code
      if (typeof candidate === 'string') code = candidate
    }
  }
  await tx.unsafe('rollback to savepoint platform_expected_failure')
  await tx.unsafe('release savepoint platform_expected_failure')
  return code
}

runtimeDescribe('ADR-027 platform administration runtime proof', () => {
  let sql: ReturnType<typeof makeSql>

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  it('covers every tenant-ID table with exactly one enabled audit trigger', async () => {
    const gaps = await sql.unsafe<Array<{ table_name: string }>>(`
      select c.table_name from information_schema.columns c
      join information_schema.tables t using (table_schema, table_name)
      left join pg_trigger trg on trg.tgrelid = to_regclass('public.' || c.table_name)
        and not trg.tgisinternal and trg.tgenabled <> 'D' and trg.tgname like 'audit_%'
      where c.table_schema = 'public' and c.column_name = 'tenant_id'
        and c.is_nullable = 'NO' and t.table_type = 'BASE TABLE' and c.table_name <> 'audit_log'
      group by c.table_name having count(trg.oid) <> 1
    `)
    expect(gaps).toEqual([])
  })

  it('audits support state transitions exactly once without leaking them to tenant audit', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantB, userA } = await seedTwoTenants(tx)
      const [session] = await tx.unsafe<Array<{ id: string }>>(
        `insert into public.platform_support_sessions(actor_id,tenant_id,reason,expires_at)
         values ($1,$2,'Private support reason',now()+interval '1 hour') returning id`,
        [userA, tenantB]
      )
      if (!session) throw new Error('Missing support fixture')
      await tx.unsafe('update public.platform_support_sessions set ended_at=now() where id=$1', [session.id])
      const events = await tx.unsafe<Array<{ action: string; actor_id: string; metadata: Record<string, unknown> }>>(
        'select action,actor_id,metadata from public.platform_audit_events where target_id=$1 order by id', [session.id]
      )
      expect(events.map((event) => event.action)).toEqual(['platform_support_sessions.insert', 'platform_support_sessions.update'])
      expect(events.every((event) => event.actor_id === userA)).toBe(true)
      expect(JSON.stringify(events)).not.toContain('Private support reason')
      const tenantEvents = await tx.unsafe('select id from public.audit_log where entity_id=$1', [session.id])
      expect(tenantEvents).toHaveLength(0)
      expect(await failureCode(tx, 'delete from public.platform_audit_events where target_id=$1', [session.id])).toBe('42501')
    })
  })

  it('preserves multiple immutable events from one request trace', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const rows = await tx.unsafe<Array<{ id: number }>>(
        `insert into public.platform_audit_events(trace_id,actor_id,action,outcome,target_type,target_tenant_id)
         select $1,$1,event,'succeeded','user_invitation',$2
         from unnest(array['platform.user.invitation_intent','platform.user.invite']) as event returning id`,
        [userA, tenantA]
      )
      expect(rows).toHaveLength(2)
      expect(rows[0]?.id).not.toBe(rows[1]?.id)
    })
  })

  it('rolls back a support insert when its audit cannot be written', async () => {
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      await tx.unsafe(`create function pg_temp.reject_platform_audit() returns trigger language plpgsql as
        $$ begin raise exception 'injected audit failure'; end $$;
        create trigger reject_probe_audit before insert on public.platform_audit_events
        for each row execute function pg_temp.reject_platform_audit()`)
      expect(await failureCode(tx,
        `insert into public.platform_support_sessions(actor_id,tenant_id,reason,expires_at)
         values ($1,$2,'must rollback',now()+interval '1 hour')`, [userA, tenantA]
      )).toBe('P0001')
      const sessions = await tx.unsafe('select id from public.platform_support_sessions where actor_id=$1', [userA])
      expect(sessions).toHaveLength(0)
    })
  })

  it('authorizes only the exact verified immutable owner identity', async () => {
    await inRollback(sql, async (tx) => {
      const [{ tenant_id: tenantId } = { tenant_id: '' }] = await tx.unsafe<
        Array<{ tenant_id: string }>
      >(
        `insert into public.tenants (name, slug)
         values ('Platform Probe', 'platform-probe-' || substr(md5(random()::text), 1, 12))
         returning id as tenant_id`
      )
      const [{ user_id: ownerId } = { user_id: '' }] = await tx.unsafe<
        Array<{ user_id: string }>
      >(
        `insert into public.users (id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), $1, 'kurt@thirdcodesolutions.com', 'Platform Owner', 'owner')
         returning id as user_id`,
        [tenantId]
      )
      const [{ user_id: tenantAdminId } = { user_id: '' }] = await tx.unsafe<
        Array<{ user_id: string }>
      >(
        `insert into public.users (id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), $1, 'tenant-admin@probe.test', 'Tenant Admin', 'admin')
         returning id as user_id`,
        [tenantId]
      )
      await tx.unsafe(
        `insert into auth.users (id, email, email_confirmed_at)
         values ($1, 'kurt@thirdcodesolutions.com', now()),
                ($2, 'tenant-admin@probe.test', now())`,
        [ownerId, tenantAdminId]
      )
      await tx.unsafe(
        `insert into public.platform_role_assignments (
           user_id, normalized_email, created_by
         ) values ($1, 'kurt@thirdcodesolutions.com', $1)`,
        [ownerId]
      )

      await becomeAuthenticated(tx, ownerId)
      const [ownerDecision] = await tx.unsafe<Array<{ allowed: boolean }>>(
        'select public.is_platform_owner() as allowed'
      )
      expect(ownerDecision?.allowed).toBe(true)
      expect(
        await failureCode(
          tx,
          'select * from public.platform_role_assignments'
        )
      ).toBe('42501')

      await tx.unsafe('reset role')
      await becomeAuthenticated(tx, tenantAdminId)
      const [adminDecision] = await tx.unsafe<Array<{ allowed: boolean }>>(
        'select public.is_platform_owner() as allowed'
      )
      expect(adminDecision?.allowed).toBe(false)
    })
  })

  it('denies unverified ownership and protects the sole owner from lockout', async () => {
    await inRollback(sql, async (tx) => {
      const [{ tenant_id: tenantId } = { tenant_id: '' }] = await tx.unsafe<
        Array<{ tenant_id: string }>
      >(
        `insert into public.tenants (name, slug)
         values ('Unverified Probe', 'unverified-probe-' || substr(md5(random()::text), 1, 12))
         returning id as tenant_id`
      )
      const [{ user_id: ownerId } = { user_id: '' }] = await tx.unsafe<
        Array<{ user_id: string }>
      >(
        `insert into public.users (id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), $1, 'kurt@thirdcodesolutions.com', 'Unverified Owner', 'owner')
         returning id as user_id`,
        [tenantId]
      )
      await tx.unsafe(
        `insert into auth.users (id, email, email_confirmed_at)
         values ($1, 'kurt@thirdcodesolutions.com', null)`,
        [ownerId]
      )
      await tx.unsafe(
        `insert into public.platform_role_assignments (
           user_id, normalized_email, created_by
         ) values ($1, 'kurt@thirdcodesolutions.com', $1)`,
        [ownerId]
      )

      await becomeAuthenticated(tx, ownerId)
      const [decision] = await tx.unsafe<Array<{ allowed: boolean }>>(
        'select public.is_platform_owner() as allowed'
      )
      expect(decision?.allowed).toBe(false)
      await tx.unsafe('reset role')

      expect(
        await failureCode(
          tx,
          `update public.users
              set account_status = 'suspended',
                  status_reason = 'security review',
                  status_changed_at = now(),
                  status_changed_by = $1
            where id = $1`,
          [ownerId]
        )
      ).toBe('42501')
      expect(
        await failureCode(
          tx,
          `update public.tenants
              set status = 'suspended',
                  status_reason = 'security review',
                  status_changed_at = now(),
                  status_changed_by = $1
            where id = $2`,
          [ownerId, tenantId]
        )
      ).toBe('42501')
      expect(
        await failureCode(
          tx,
          'delete from public.platform_role_assignments where user_id = $1',
          [ownerId]
        )
      ).toBe('42501')
    })
  })

  it('provisions and activates only the server-recorded tenant invitation', async () => {
    await inRollback(sql, async (tx) => {
      const [{ tenant_id: tenantId } = { tenant_id: '' }] = await tx.unsafe<
        Array<{ tenant_id: string }>
      >(
        `insert into public.tenants (name, slug)
         values ('Invitation Probe', 'invitation-probe-' || substr(md5(random()::text), 1, 12))
         returning id as tenant_id`
      )
      const [{ user_id: inviterId } = { user_id: '' }] = await tx.unsafe<
        Array<{ user_id: string }>
      >(
        `insert into public.users (id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), $1, 'inviter@probe.test', 'Platform Inviter', 'owner')
         returning id as user_id`,
        [tenantId]
      )
      const [{ invitation_id: invitationId } = { invitation_id: '' }] =
        await tx.unsafe<Array<{ invitation_id: string }>>(
          `insert into public.platform_user_invitations (
             tenant_id, normalized_email, full_name, role, invited_by
           ) values ($1, 'invited@probe.test', 'Invited User', 'viewer', $2)
           returning id as invitation_id`,
          [tenantId, inviterId]
        )
      const invitedId = crypto.randomUUID()

      await tx.unsafe(
        `insert into auth.users (id, email, email_confirmed_at)
         values ($1, 'invited@probe.test', null)`,
        [invitedId]
      )

      const [provisioned] = await tx.unsafe<
        Array<{
          tenant_id: string
          account_status: string
          invitation_status: string
          role: string
        }>
      >(
        `select app_user.tenant_id,
                app_user.account_status::text,
                invitation.status::text as invitation_status,
                app_user.role::text
           from public.users as app_user
           join public.platform_user_invitations as invitation
             on invitation.auth_user_id = app_user.id
          where app_user.id = $1
            and invitation.id = $2`,
        [invitedId, invitationId]
      )
      expect(provisioned).toEqual({
        tenant_id: tenantId,
        account_status: 'invited',
        invitation_status: 'sent',
        role: 'viewer',
      })

      await tx.unsafe(
        `update auth.users
            set email_confirmed_at = now()
          where id = $1`,
        [invitedId]
      )
      await becomeAuthenticated(tx, invitedId)
      const [activation] = await tx.unsafe<Array<{ activated: boolean }>>(
        'select public.activate_current_invited_user() as activated'
      )
      expect(activation?.activated).toBe(true)
      await tx.unsafe('reset role')

      const [accepted] = await tx.unsafe<
        Array<{ account_status: string; invitation_status: string }>
      >(
        `select app_user.account_status::text,
                invitation.status::text as invitation_status
           from public.users as app_user
           join public.platform_user_invitations as invitation
             on invitation.auth_user_id = app_user.id
          where app_user.id = $1`,
        [invitedId]
      )
      expect(accepted).toEqual({
        account_status: 'active',
        invitation_status: 'accepted',
      })
      const activationEvents = await tx.unsafe<Array<{ actor_id: string; metadata: Record<string, unknown> }>>(
        `select actor_id,metadata from public.platform_audit_events
         where action='platform_user_invitations.update' and metadata->'after'->>'status'='accepted'
           and target_tenant_id=$1`, [tenantId]
      )
      expect(activationEvents).toHaveLength(1)
      expect(activationEvents[0]?.actor_id).toBe(invitedId)
      expect(JSON.stringify(activationEvents)).not.toContain('@')
    })
  })

  it('removes tenant RLS identity for suspended users and tenants', async () => {
    await inRollback(sql, async (tx) => {
      const [{ tenant_id: tenantId } = { tenant_id: '' }] = await tx.unsafe<
        Array<{ tenant_id: string }>
      >(
        `insert into public.tenants (name, slug)
         values ('Lifecycle Probe', 'lifecycle-probe-' || substr(md5(random()::text), 1, 12))
         returning id as tenant_id`
      )
      const [{ user_id: userId } = { user_id: '' }] = await tx.unsafe<
        Array<{ user_id: string }>
      >(
        `insert into public.users (id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), $1, 'lifecycle@probe.test', 'Lifecycle User', 'admin')
         returning id as user_id`,
        [tenantId]
      )

      await becomeAuthenticated(tx, userId)
      const [active] = await tx.unsafe<Array<{ tenant_id: string | null }>>(
        'select public.auth_tenant_id() as tenant_id'
      )
      expect(active?.tenant_id).toBe(tenantId)
      await tx.unsafe('reset role')

      await tx.unsafe(
        `update public.users
            set account_status = 'suspended',
                status_reason = 'security review',
                status_changed_at = now(),
                status_changed_by = $1
          where id = $1`,
        [userId]
      )
      await becomeAuthenticated(tx, userId)
      const [suspendedUser] = await tx.unsafe<Array<{ tenant_id: string | null }>>(
        'select public.auth_tenant_id() as tenant_id'
      )
      expect(suspendedUser?.tenant_id).toBeNull()
      await tx.unsafe('reset role')

      await tx.unsafe(
        `update public.users
            set account_status = 'active',
                status_reason = null,
                status_changed_at = null,
                status_changed_by = null
          where id = $1`,
        [userId]
      )
      await tx.unsafe(
        `update public.tenants
            set status = 'suspended',
                status_reason = 'billing hold',
                status_changed_at = now(),
                status_changed_by = $1
          where id = $2`,
        [userId, tenantId]
      )
      await becomeAuthenticated(tx, userId)
      const [suspendedTenant] = await tx.unsafe<
        Array<{ tenant_id: string | null }>
      >('select public.auth_tenant_id() as tenant_id')
      expect(suspendedTenant?.tenant_id).toBeNull()
    })
  })

  it('keeps platform audit append-only and support context bounded', async () => {
    await inRollback(sql, async (tx) => {
      const [{ tenant_id: tenantId } = { tenant_id: '' }] = await tx.unsafe<
        Array<{ tenant_id: string }>
      >(
        `insert into public.tenants (name, slug)
         values ('Audit Probe', 'audit-probe-' || substr(md5(random()::text), 1, 12))
         returning id as tenant_id`
      )
      const [{ user_id: userId } = { user_id: '' }] = await tx.unsafe<
        Array<{ user_id: string }>
      >(
        `insert into public.users (id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), $1, 'audit@probe.test', 'Audit User', 'admin')
         returning id as user_id`,
        [tenantId]
      )
      const [{ event_id: eventId } = { event_id: 0 }] = await tx.unsafe<
        Array<{ event_id: number }>
      >(
        `insert into public.platform_audit_events (
           trace_id, actor_id, action, outcome, target_type, target_tenant_id
         ) values (gen_random_uuid(), $1, 'probe', 'succeeded', 'tenant', $2)
         returning id as event_id`,
        [userId, tenantId]
      )
      expect(
        await failureCode(
          tx,
          `update public.platform_audit_events
              set outcome = 'failed'
            where id = $1`,
          [eventId]
        )
      ).toBe('42501')
      expect(
        await failureCode(
          tx,
          `insert into public.platform_support_sessions (
             actor_id, tenant_id, reason, expires_at
           ) values ($1, $2, 'probe', now() + interval '5 hours')`,
          [userId, tenantId]
        )
      ).toBe('23514')
    })
  })
})
