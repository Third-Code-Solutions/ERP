import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, makeSql } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260807140000_revoke_anon_tenant_identity_rpc.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('tenant identity RPC hardening migration contract', () => {
  it('removes anonymous execution while preserving authenticated RLS execution', () => {
    expect(migrationSql).toMatch(
      /revoke execute on function public\.auth_tenant_id\(\)[\s\S]*?from public, anon/
    )
    expect(migrationSql).toMatch(
      /grant execute on function public\.auth_tenant_id\(\)[\s\S]*?to authenticated, service_role/
    )
    expect(migrationSql).not.toMatch(
      /grant execute on function public\.auth_tenant_id\(\)[\s\S]*?to[^;]*\banon\b/
    )
  })
})

const runtimeSuite = DATABASE_URL ? describe : describe.skip

runtimeSuite('tenant identity RPC hardening runtime', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  it('keeps auth_tenant_id unavailable to anon and available to trusted roles', async () => {
    const [privileges] = await sql<
      Array<{
        anon_execute: boolean
        authenticated_execute: boolean
        service_execute: boolean
      }>
    >`
      select
        has_function_privilege(
          'anon',
          'public.auth_tenant_id()',
          'EXECUTE'
        ) as anon_execute,
        has_function_privilege(
          'authenticated',
          'public.auth_tenant_id()',
          'EXECUTE'
        ) as authenticated_execute,
        has_function_privilege(
          'service_role',
          'public.auth_tenant_id()',
          'EXECUTE'
        ) as service_execute
    `

    expect(privileges).toEqual({
      anon_execute: false,
      authenticated_execute: true,
      service_execute: true,
    })
  })
})
