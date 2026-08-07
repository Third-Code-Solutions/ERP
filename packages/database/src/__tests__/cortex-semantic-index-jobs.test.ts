import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { cortexSemanticIndexJobs } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260807160000_cortex_semantic_index_jobs.sql'
  ),
  'utf8'
).toLowerCase()
const runtimeIt = process.env.DATABASE_URL ? it : it.skip

describe('Cortex semantic index job foundation', () => {
  it('enforces one active tenant job and immutable spend ceilings', () => {
    expect(migrationSql).toContain(
      'create unique index ux_cortex_semantic_index_jobs_one_active_tenant'
    )
    expect(migrationSql).toMatch(
      /where status in \('queued', 'processing'\)/
    )
    expect(migrationSql).toContain('max_nodes = 64')
    expect(migrationSql).toContain('provider_call_count between 0 and 1')
    expect(migrationSql).toContain('attempt_count between 0 and 3')
  })

  it('keeps jobs server-only and tenant-linked to their requester', () => {
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, requested_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.cortex_semantic_index_jobs force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.cortex_semantic_index_jobs[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle index and tenant-FK names aligned with SQL', () => {
    const config = getTableConfig(cortexSemanticIndexJobs)
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'ux_cortex_semantic_index_jobs_tenant_idempotency',
        'ux_cortex_semantic_index_jobs_one_active_tenant',
        'idx_cortex_semantic_index_jobs_tenant_status',
      ])
    )
    expect(config.foreignKeys.map((key) => key.getName())).toContain(
      'cortex_semantic_index_jobs_requested_by_tenant_fk'
    )
  })

  runtimeIt(
    'denies direct authenticated reads and writes at runtime',
    async () => {
      const sql = postgres(process.env.DATABASE_URL as string, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 15,
      })
      const rollback = Symbol('rollback')
      let selectDenied = false
      let insertDenied = false

      try {
        await sql.begin(async (transaction) => {
          const tenantId = randomUUID()
          const userId = randomUUID()
          const jobId = randomUUID()
          const suffix = randomUUID().slice(0, 12)

          await transaction`
            insert into public.tenants (id, name, slug)
            values (
              ${tenantId}::uuid,
              'Cortex browser denial probe',
              ${`cortex-browser-denial-${suffix}`}
            )
          `
          await transaction`
            insert into public.users (
              id,
              tenant_id,
              email,
              full_name,
              role
            ) values (
              ${userId}::uuid,
              ${tenantId}::uuid,
              ${`cortex-browser-denial-${suffix}@integration.test`},
              'Cortex browser denial',
              'admin'
            )
          `
          await transaction`
            insert into public.cortex_semantic_index_jobs (
              id,
              tenant_id,
              requested_by,
              idempotency_key,
              request_hash,
              backlog_at_request
            ) values (
              ${jobId}::uuid,
              ${tenantId}::uuid,
              ${userId}::uuid,
              'browser-denial-probe',
              ${'a'.repeat(64)},
              1
            )
          `

          const browserOperationDenied = async (
            operation: () => Promise<unknown>
          ): Promise<boolean> => {
            await transaction.unsafe('savepoint cortex_browser_denial')
            await transaction`
              select pg_catalog.set_config(
                'request.jwt.claims',
                pg_catalog.json_build_object(
                  'sub',
                  ${userId}::uuid,
                  'role',
                  'authenticated'
                )::text,
                true
              )
            `
            await transaction.unsafe('set local role authenticated')
            let denied = false
            try {
              await operation()
            } catch (error) {
              denied =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                (error as { code?: unknown }).code === '42501'
            } finally {
              await transaction.unsafe(
                'rollback to savepoint cortex_browser_denial'
              )
              await transaction.unsafe(
                'release savepoint cortex_browser_denial'
              )
            }
            return denied
          }

          selectDenied = await browserOperationDenied(() =>
            transaction`
              select id
              from public.cortex_semantic_index_jobs
              where id = ${jobId}::uuid
            `
          )
          insertDenied = await browserOperationDenied(() =>
            transaction`
              insert into public.cortex_semantic_index_jobs (
                tenant_id,
                requested_by,
                idempotency_key,
                request_hash,
                backlog_at_request
              ) values (
                ${tenantId}::uuid,
                ${userId}::uuid,
                'browser-forgery-probe',
                ${'b'.repeat(64)},
                1
              )
            `
          )
          throw rollback
        })
      } catch (error) {
        if (error !== rollback) throw error
      } finally {
        await sql.end({ timeout: 5 })
      }

      expect(selectDenied).toBe(true)
      expect(insertDenied).toBe(true)
    },
    30_000
  )
})
