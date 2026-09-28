import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260928110000_task_instances_core_read_boundary.sql'
  ),
  'utf8'
)
const migrationBody = migration
  .replace(/^\s*(?:--[^\r\n]*\r?\n\s*)*begin;\s*/i, '')
  .replace(/\s*commit;\s*$/i, '')

describe('task instance Core read boundary migration', () => {
  it('removes the authenticated grant and tenant-wide policy while preserving Core reads', () => {
    expect(migration).toMatch(/revoke select on table public\.task_instances from public, anon, authenticated;/i)
    expect(migration).toMatch(/drop policy if exists task_instances_tenant_read on public\.task_instances;/i)
    expect(migration).toMatch(/grant select on table public\.task_instances to service_role;/i)
    expect(migration).toMatch(/^begin;/m)
    expect(migration.trimEnd()).toMatch(/commit;$/)
  })
})

const databaseUrl = process.env.DATABASE_URL?.trim()
const databaseDescribe = databaseUrl ? describe : describe.skip
const rollback = Symbol('rollback')

function firstId(rows: Array<{ id: string }>, label: string): string {
  const id = rows[0]?.id
  if (!id) throw new Error(`Expected ${label} insert to return an id`)
  return id
}

databaseDescribe('task instance Data API role and tenant isolation', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(databaseUrl as string, {
      prepare: false,
      max: 1,
      connect_timeout: 15,
      idle_timeout: 5,
    })
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  async function insertProbe(tx: postgres.TransactionSql, suffix: string): Promise<{
    tenantId: string
    userId: string
    taskId: string
  }> {
    const tenantId = firstId(await tx.unsafe<Array<{ id: string }>>(
      `insert into public.tenants (name, slug)
       values ($1, $2) returning id`,
      [`Task read probe ${suffix}`, `task-read-${suffix}`]
    ), 'tenant')
    const userId = firstId(await tx.unsafe<Array<{ id: string }>>(
      `insert into public.users (id, tenant_id, email, full_name, role)
       values (gen_random_uuid(), $1, $2, $3, 'finance') returning id`,
      [tenantId, `task-read-${suffix}@example.test`, `Task read probe ${suffix}`]
    ), 'user')
    const stepId = firstId(await tx.unsafe<Array<{ id: string }>>(
      `insert into public.process_steps
         (tenant_id, code, stage, name, responsible_bu, input, input_from,
          output, output_by, sla_days)
       values ($1, $2, 'proposal', 'Task read probe', 'Finance', 'Input',
               'System', 'Output', 'Finance', 1)
      returning id`,
      [tenantId, `TR-${suffix}`]
    ), 'process step')
    const taskId = firstId(await tx.unsafe<Array<{ id: string }>>(
      `insert into public.task_instances
         (tenant_id, process_step_id, subject_type, subject_id, instance_key)
      values ($1, $2, 'project', gen_random_uuid(), $3) returning id`,
      [tenantId, stepId, `task-read-${suffix}`]
    ), 'task instance')
    return { tenantId, userId, taskId }
  }

  async function expectDirectReadDenied(
    tx: postgres.TransactionSql,
    role: 'anon' | 'authenticated',
    userId: string | null,
    taskIds: string[]
  ): Promise<void> {
    await tx.unsafe(
      `select set_config('request.jwt.claims',
        json_build_object('sub', $1::text, 'role', $2::text)::text, true)`,
      [userId, role]
    )
    await tx.unsafe(`set local role ${role}`)
    await tx.unsafe('savepoint task_read_denied')
    let errorCode: string | undefined
    try {
      await tx.unsafe(
        `select id from public.task_instances where id = any($1::uuid[])`,
        [taskIds]
      )
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        errorCode = String(error.code)
      }
    }
    await tx.unsafe('rollback to savepoint task_read_denied')
    await tx.unsafe('release savepoint task_read_denied')
    await tx.unsafe('reset role')
    expect(errorCode).toBe('42501')
  }

  it('denies both tenants to client roles and preserves tenant-filtered Core reads', async () => {
    try {
      await sql.begin(async (connection) => {
        const tx = connection as postgres.TransactionSql
        const first = await insertProbe(tx, randomUUID())
        const second = await insertProbe(tx, randomUUID())

        await tx.unsafe(migrationBody)

        const grants = await tx.unsafe<Array<{
          anonymous: boolean
          authenticated: boolean
          service: boolean
          rls: boolean
        }>>(
          `select has_table_privilege('anon', 'public.task_instances', 'select') as anonymous,
                  has_table_privilege('authenticated', 'public.task_instances', 'select') as authenticated,
                  has_table_privilege('service_role', 'public.task_instances', 'select') as service,
                  c.relrowsecurity as rls
             from pg_class c
            where c.oid = 'public.task_instances'::regclass`
        )
        expect(grants).toEqual([{
          anonymous: false,
          authenticated: false,
          service: true,
          rls: true,
        }])

        const policies = await tx.unsafe<Array<{ policyname: string }>>(
          `select policyname from pg_policies
            where schemaname = 'public'
              and tablename = 'task_instances'
              and cmd = 'SELECT'`
        )
        expect(policies).toEqual([])

        const taskIds = [first.taskId, second.taskId]
        await expectDirectReadDenied(tx, 'authenticated', first.userId, taskIds)
        await expectDirectReadDenied(tx, 'authenticated', second.userId, taskIds)
        await expectDirectReadDenied(tx, 'anon', null, taskIds)

        await tx.unsafe('set local role service_role')
        const firstTenantRows = await tx.unsafe<Array<{ id: string }>>(
          `select id from public.task_instances
            where tenant_id = $1 and id = any($2::uuid[])`,
          [first.tenantId, taskIds]
        )
        const secondTenantRows = await tx.unsafe<Array<{ id: string }>>(
          `select id from public.task_instances
            where tenant_id = $1 and id = any($2::uuid[])`,
          [second.tenantId, taskIds]
        )
        await tx.unsafe('reset role')
        expect(firstTenantRows.map(({ id }) => id)).toEqual([first.taskId])
        expect(secondTenantRows.map(({ id }) => id)).toEqual([second.taskId])

        throw rollback
      })
    } catch (error) {
      if (error !== rollback) throw error
    }
  })
})
