/**
 * Provisioning regressions for `auth.users` -> `public.users` (P0 invite bug).
 *
 * Every case drives the real trigger by inserting into `auth.users` inside a
 * rolled-back transaction, so production data is never touched. The invite
 * claim (`raw_app_meta_data.erp_invite`) is the only channel a service-role
 * caller has to bind a new auth user to an existing tenant; these tests prove
 * it cannot be abused to cross a tenant boundary or escalate a role.
 */
import { afterAll, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const describeDb = DATABASE_URL ? describe : describe.skip
const sql = DATABASE_URL ? makeSql() : undefined

afterAll(async () => {
  await sql?.end({ timeout: 5 })
})

type Tx = postgres.TransactionSql

let seq = 0
function uniqueEmail(): string {
  seq += 1
  return `probe-${Date.now().toString(36)}-${seq}@probe.test`
}

interface AuthInsert {
  invite?: Record<string, postgres.JSONValue> | null
  userMeta?: Record<string, postgres.JSONValue>
  email?: string
}

/** Insert an `auth.users` row as superuser, firing `on_auth_user_created`. */
async function createAuthUser(tx: Tx, input: AuthInsert = {}): Promise<string> {
  const appMeta = input.invite ? { erp_invite: input.invite } : {}
  const rows = (await tx`
    insert into auth.users (
      id,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      ${input.email ?? uniqueEmail()},
      ${tx.json(appMeta)},
      ${tx.json({ full_name: 'Probe Invitee', ...input.userMeta })},
      now(),
      now()
    )
    returning id
  `) as unknown as Array<{ id: string }>
  return rows[0]!.id
}

/**
 * Run a statement that must fail, inside a savepoint, so the enclosing probe
 * transaction survives and later assertions still see a clean transaction.
 */
async function expectRejected(
  tx: Tx,
  run: (sp: Tx) => Promise<unknown>,
  pattern: RegExp
): Promise<void> {
  const error = await tx.savepoint(async (sp) => run(sp as Tx)).then(
    () => null,
    (err: unknown) => err
  )
  expect(String(error)).toMatch(pattern)
}

async function publicUser(
  tx: Tx,
  id: string
): Promise<{ tenant_id: string; role: string; email: string } | undefined> {
  const rows = (await tx`
    select tenant_id, role::text as role, email
      from public.users
     where id = ${id}
  `) as unknown as Array<{ tenant_id: string; role: string; email: string }>
  return rows[0]
}

async function tenantCount(tx: Tx): Promise<number> {
  const rows = (await tx`
    select count(*)::int as n from public.tenants
  `) as unknown as Array<{ n: number }>
  return rows[0]!.n
}

describeDb('auth.users provisioning trigger', () => {
  it('creates a new tenant and an admin for a self-signup', async () => {
    const result = await inRollback(sql!, async (tx) => {
      const before = await tenantCount(tx)
      const id = await createAuthUser(tx, {
        userMeta: { company_name: 'Probe Construction', organization_type: 'construction' },
      })
      const user = await publicUser(tx, id)
      const tenants = (await tx`
        select t.id, t.organization_type
          from public.tenants t
         where t.id = ${user!.tenant_id}
      `) as unknown as Array<{ id: string; organization_type: string }>
      return { before, after: await tenantCount(tx), user, tenant: tenants[0] }
    })

    expect(result.after).toBe(result.before + 1)
    expect(result.user?.role).toBe('admin')
    expect(result.tenant?.id).toBe(result.user?.tenant_id)
    expect(result.tenant?.organization_type).toBe('construction')
  })

  it('joins the inviting tenant without creating an orphan tenant', async () => {
    const result = await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const before = await tenantCount(tx)
      const id = await createAuthUser(tx, {
        invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'pm' },
      })
      return {
        before,
        after: await tenantCount(tx),
        user: await publicUser(tx, id),
        seed,
      }
    })

    expect(result.after).toBe(result.before)
    expect(result.user?.tenant_id).toBe(result.seed.tenantA)
    expect(result.user?.role).toBe('pm')
  })

  it('provisions every supported role for an admin invite', async () => {
    const roles = [
      'estimator',
      'pm',
      'admin',
      'sales',
      'commercial',
      'design',
      'sd_pm_pe',
      'finance',
      'procurement',
      'safety',
      'cx',
      'viewer',
    ] as const

    const provisioned = await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const out: Array<{ role: string; tenant_id: string }> = []
      for (const role of roles) {
        const id = await createAuthUser(tx, {
          invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role },
        })
        const user = await publicUser(tx, id)
        out.push({ role: user!.role, tenant_id: user!.tenant_id })
      }
      return { out, seed }
    })

    expect(provisioned.out.map((row) => row.role)).toEqual([...roles])
    for (const row of provisioned.out) {
      expect(row.tenant_id).toBe(provisioned.seed.tenantA)
    }
  })

  it('rejects an invite that targets another tenant', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      await expect(
        createAuthUser(tx, {
          invite: { tenant_id: seed.tenantB, invited_by: seed.userA, role: 'viewer' },
        })
      ).rejects.toThrow(/invite claim rejected/)
    })
  })

  it('rejects an inviter who is not an owner or admin', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      await tx`update public.users set role = 'viewer' where id = ${seed.userA}`
      await expect(
        createAuthUser(tx, {
          invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'viewer' },
        })
      ).rejects.toThrow(/invite claim rejected/)
    })
  })

  it('rejects a suspended inviter', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      await tx`
        update public.users
           set account_status = 'suspended',
               status_reason = 'qa probe suspension',
               status_changed_at = now(),
               status_changed_by = ${seed.userB}
         where id = ${seed.userA}
      `
      await expect(
        createAuthUser(tx, {
          invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'viewer' },
        })
      ).rejects.toThrow(/invite claim rejected/)
    })
  })

  it('rejects an admin inviting an owner', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      await tx`update public.users set role = 'admin' where id = ${seed.userA}`
      await expect(
        createAuthUser(tx, {
          invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'owner' },
        })
      ).rejects.toThrow(/only an owner may invite an owner/)
    })
  })

  it('allows an owner to invite another owner', async () => {
    const result = await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      await tx`update public.users set role = 'owner' where id = ${seed.userA}`
      const id = await createAuthUser(tx, {
        invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'owner' },
      })
      return { user: await publicUser(tx, id), seed }
    })

    expect(result.user?.tenant_id).toBe(result.seed.tenantA)
    expect(result.user?.role).toBe('owner')
  })

  it('rejects an unknown role or a malformed claim', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      await expectRejected(
        tx,
        (sp) =>
          createAuthUser(sp, {
            invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'superuser' },
          }),
        /invite claim is malformed/
      )
      await expectRejected(
        tx,
        (sp) =>
          createAuthUser(sp, {
            invite: { tenant_id: seed.tenantA, invited_by: 'not-a-uuid', role: 'viewer' },
          }),
        /invite claim is malformed/
      )
      await expectRejected(
        tx,
        (sp) =>
          createAuthUser(sp, {
            invite: { tenant_id: seed.tenantA, role: 'viewer' },
          }),
        /invite claim is incomplete/
      )
    })
  })

  it('fails closed on double-encoded app metadata instead of self-signing up', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const email = uniqueEmail()
      const claim = {
        erp_invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'viewer' },
      }

      // A writer that JSON-encodes a claim into a string makes the jsonb column
      // hold a *string*, hiding the claim from `-> 'erp_invite'`. Falling back
      // to self-signup there would silently create an orphan tenant.
      const error = await tx
        .savepoint(async (sp) => {
          await sp`
            insert into auth.users (
              id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
            )
            values (
              gen_random_uuid(),
              ${email},
              pg_catalog.to_jsonb(${JSON.stringify(claim)}::text),
              ${sp.json({ full_name: 'Probe Invitee' })},
              now(),
              now()
            )
          `
        })
        .then(
          () => null,
          (err: unknown) => err
        )

      expect(String(error)).toMatch(/raw app metadata must be a JSON object/)
      const orphans = (await tx`
        select 1 from public.users where email = ${email}
      `) as unknown as Array<unknown>
      expect(orphans).toHaveLength(0)
    })
  })

  it('rejects an invite claim for an email holding a pending platform invitation', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const email = uniqueEmail()
      await tx`
        insert into public.platform_user_invitations
          (tenant_id, normalized_email, full_name, role, invited_by)
        values (${seed.tenantB}, ${email}, 'Pending Invitee', 'pm', ${seed.userB})
      `

      await expectRejected(
        tx,
        (sp) =>
          createAuthUser(sp as Tx, {
            email,
            invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'pm' },
          }),
        /pending platform invitation/
      )

      const leaked = (await tx`
        select 1 from public.users where email = ${email}
      `) as unknown as Array<unknown>
      expect(leaked).toHaveLength(0)

      const invitation = (await tx`
        select status::text as status, auth_user_id
          from public.platform_user_invitations
         where normalized_email = ${email}
      `) as unknown as Array<{ status: string; auth_user_id: string | null }>
      expect(invitation[0]).toMatchObject({ status: 'pending', auth_user_id: null })
    })
  })

  it('still provisions a pending platform invitation on plain signup', async () => {
    const result = await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const email = uniqueEmail()
      await tx`
        insert into public.platform_user_invitations
          (tenant_id, normalized_email, full_name, role, invited_by)
        values (${seed.tenantB}, ${email}, 'Pending Invitee', 'pm', ${seed.userB})
      `
      const id = await createAuthUser(tx, { email })
      const invitation = (await tx`
        select status::text as status, auth_user_id
          from public.platform_user_invitations
         where normalized_email = ${email}
      `) as unknown as Array<{ status: string; auth_user_id: string | null }>
      return { id, seed, user: await publicUser(tx, id), invitation: invitation[0] }
    })

    expect(result.user?.tenant_id).toBe(result.seed.tenantB)
    expect(result.user?.role).toBe('pm')
    expect(result.invitation).toMatchObject({ status: 'sent', auth_user_id: result.id })
  })

  it('writes immutable audit evidence for a provisioned user', async () => {
    const result = await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const id = await createAuthUser(tx, {
        invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'estimator' },
      })
      const audit = (await tx`
        select entity_type, action, tenant_id
          from public.audit_log
         where entity_id = ${id}
      `) as unknown as Array<{ entity_type: string; action: string; tenant_id: string }>
      return { audit, seed }
    })

    expect(result.audit.length).toBeGreaterThan(0)
    expect(result.audit[0]!.tenant_id).toBe(result.seed.tenantA)
    expect(result.audit[0]!.action).toMatch(/create|insert/i)
  })

  it('keeps audit_log append-only for the authenticated client role', async () => {
    await inRollback(sql!, async (tx) => {
      const seed = await seedTwoTenants(tx)
      const provisionedId = await createAuthUser(tx, {
        invite: { tenant_id: seed.tenantA, invited_by: seed.userA, role: 'estimator' },
      })
      const rows = (await tx`
        select id, action
          from public.audit_log
         where entity_id = ${provisionedId}
         order by created_at desc
         limit 1
      `) as unknown as Array<{ id: string; action: string }>
      const evidence = rows[0]
      expect(evidence).toBeDefined()

      await becomeAuthenticated(tx, seed.userA)

      // `audit_log` carries DO INSTEAD NOTHING rules for UPDATE and DELETE, so
      // a client mutation is rewritten into a no-op instead of raising. The
      // evidence must still be byte-identical afterwards.
      await tx`update public.audit_log set action = 'tampered' where id = ${evidence!.id}`
      await tx`delete from public.audit_log where id = ${evidence!.id}`
      await expectRejected(
        tx,
        (sp) =>
          sp`insert into public.audit_log (tenant_id, entity_type, entity_id, action)
             values (${seed.tenantA}, 'users', ${seed.userA}, 'forged')`,
        /permission denied/
      )

      await tx.unsafe('reset role')

      const after = (await tx`
        select action from public.audit_log where id = ${evidence!.id}
      `) as unknown as Array<{ action: string }>
      expect(after).toHaveLength(1)
      expect(after[0]!.action).toBe(evidence!.action)

      const forged = (await tx`
        select 1 from public.audit_log where action = 'forged'
      `) as unknown as Array<unknown>
      expect(forged).toHaveLength(0)
    })
  })
})
