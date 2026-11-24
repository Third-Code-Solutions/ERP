import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, becomeAuthenticated, inRollback, makeSql, seedTwoTenants } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20261124210000_notifications_recipient_read.sql'
  ),
  'utf8'
)

describe('notifications recipient read migration contract', () => {
  it('replaces the tenant-wide read with a recipient-only read under bounded timeouts', () => {
    expect(migrationSql.startsWith('-- NEEDS PRODUCTION MIGRATION APPROVAL')).toBe(true)
    expect(migrationSql).toContain(
      "begin;\n\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';"
    )
    const flat = migrationSql.replace(/\s+/g, ' ')
    expect(flat).toContain('drop policy if exists notifications_tenant_read on public.notifications;')
    expect(flat).toContain(
      'create policy notifications_recipient_read on public.notifications for select to authenticated using ( tenant_id = public.auth_tenant_id() and recipient_user_id = (select auth.uid()) );'
    )
    expect(migrationSql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('changes no grant, table or data', () => {
    const body = migrationSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(body).not.toMatch(/\b(grant|revoke|alter table|insert|update|delete)\b/i)
  })
})

type Rows = Array<Record<string, unknown>>

const runtimeSuite = DATABASE_URL ? describe : describe.skip

runtimeSuite('notifications recipient read (database)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('holds exactly one SELECT policy on notifications, for the recipient', async () => {
    const rows = await sql<{ policyname: string; roles: string[] }[]>`
      select policyname, roles
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'notifications' and cmd = 'SELECT'
    `
    expect(rows).toEqual([{ policyname: 'notifications_recipient_read', roles: ['authenticated'] }])
  })

  it('shows a user their own notifications and no colleague or other tenant notification', async () => {
    const seen = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const colleague = ((await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(gen_random_uuid(), '${tenantA}', 'colleague-' || substr(md5(random()::text), 1, 10) || '@probe.test', 'Probe Colleague', 'viewer')
         returning id`
      )) as Rows)[0]!.id as string
      const insert = async (tenantId: string, recipient: string | null, subject: string) =>
        ((await tx.unsafe(
          `insert into notifications(tenant_id, recipient_user_id, subject, body)
           values('${tenantId}', ${recipient ? `'${recipient}'` : 'null'}, '${subject}', 'https://example.test/survey/probe')
           returning id`
        )) as Rows)[0]!.id as string
      const own = await insert(tenantA, userA, 'NOTIF_PROBE_OWN')
      const colleagues = await insert(tenantA, colleague, 'NOTIF_PROBE_COLLEAGUE')
      await insert(tenantA, null, 'NOTIF_PROBE_NO_RECIPIENT')
      await insert(tenantB, userB, 'NOTIF_PROBE_OTHER_TENANT')

      const visibleTo = async (userId: string) => {
        await becomeAuthenticated(tx, userId)
        const rows = (await tx.unsafe(
          `select id from notifications where subject like 'NOTIF_PROBE_%' order by subject`
        )) as Rows
        await tx.unsafe('reset role')
        return rows.map((row) => row.id as string)
      }
      return { own, colleagues, forA: await visibleTo(userA), forColleague: await visibleTo(colleague) }
    })

    expect(seen.forA).toEqual([seen.own])
    expect(seen.forColleague).toEqual([seen.colleagues])
  })
})
