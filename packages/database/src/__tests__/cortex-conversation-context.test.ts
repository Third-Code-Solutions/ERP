import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260729115110_cortex_conversation_record_context.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('Cortex conversation record-context migration contract', () => {
  it('stores an all-null or all-present immutable canonical record reference', () => {
    expect(migrationSql).toContain(
      'add column if not exists context_ref_table varchar(100)'
    )
    expect(migrationSql).toContain(
      'add column if not exists context_ref_id uuid'
    )
    expect(migrationSql).toContain(
      'constraint cortex_conversations_context_pair_check'
    )
    expect(migrationSql).toMatch(
      /check \(\s*\(context_ref_table is null and context_ref_id is null\)\s*or\s*\(context_ref_table is not null and context_ref_id is not null\)\s*\)/
    )
  })

  it('makes conversation and message mutation server-only', () => {
    expect(migrationSql).toContain(
      'drop policy if exists cortex_conversations_owner_insert'
    )
    expect(migrationSql).toContain(
      'drop policy if exists cortex_conversations_owner_update'
    )
    expect(migrationSql).toContain(
      'drop policy if exists cortex_messages_parent_owner_insert'
    )
    expect(migrationSql).toMatch(
      /revoke insert \(tenant_id, user_id, title\)[\s\S]*?public\.cortex_conversations[\s\S]*?from authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke update \(title, updated_at\)[\s\S]*?public\.cortex_conversations[\s\S]*?from authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke insert \(tenant_id, conversation_id, role, content, citations\)[\s\S]*?public\.cortex_messages[\s\S]*?from authenticated/
    )
    expect(migrationSql).toContain(
      'grant select on table public.cortex_conversations, public.cortex_messages to authenticated'
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = any

runtimeSuite('Cortex conversation record-context runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('accepts complete context and rejects a half-bound record reference', async () => {
    const result = await inRollback(sql, async (tx) => {
      const suffix = (
        (await tx.unsafe(
          `select substr(md5(random()::text),1,10) as suffix`
        )) as Rows
      )[0].suffix as string
      const tenantId = (
        (await tx.unsafe(
          `insert into tenants(name, slug)
           values('Context Runtime','context-runtime-${suffix}')
           returning id`
        )) as Rows
      )[0].id as string
      const userId = (
        (await tx.unsafe(
          `insert into users(
             id, tenant_id, email, full_name, role
           )
           values(
             gen_random_uuid(),
             '${tenantId}',
             'context-${suffix}@probe.test',
             'Context Runtime',
             'admin'
           )
           returning id`
        )) as Rows
      )[0].id as string
      const contextRefId = (
        (await tx.unsafe(`select gen_random_uuid() as id`)) as Rows
      )[0].id as string

      await tx.unsafe(
        `insert into cortex_conversations(
           tenant_id,
           user_id,
           title,
           context_ref_table,
           context_ref_id
         )
         values(
           '${tenantId}',
           '${userId}',
           'Scoped thread',
           'projects',
           '${contextRefId}'
         )`
      )

      let rejectedHalfPair = false
      try {
        await tx.unsafe(
          `insert into cortex_conversations(
             tenant_id,
             user_id,
             title,
             context_ref_table
           )
           values(
             '${tenantId}',
             '${userId}',
             'Invalid thread',
             'projects'
           )`
        )
      } catch {
        rejectedHalfPair = true
      }

      return { rejectedHalfPair }
    })

    expect(result.rejectedHalfPair).toBe(true)
  })

  it('rejects direct authenticated conversation creation', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const suffix = (
        (await tx.unsafe(
          `select substr(md5(random()::text),1,10) as suffix`
        )) as Rows
      )[0].suffix as string
      const tenantId = (
        (await tx.unsafe(
          `insert into tenants(name, slug)
           values('Context Auth','context-auth-${suffix}')
           returning id`
        )) as Rows
      )[0].id as string
      const userId = (
        (await tx.unsafe(
          `insert into users(
             id, tenant_id, email, full_name, role
           )
           values(
             gen_random_uuid(),
             '${tenantId}',
             'context-auth-${suffix}@probe.test',
             'Context Auth',
             'admin'
           )
           returning id`
        )) as Rows
      )[0].id as string

      await becomeAuthenticated(tx, userId)
      try {
        await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title)
           values('${tenantId}','${userId}','Browser write')`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })
})
