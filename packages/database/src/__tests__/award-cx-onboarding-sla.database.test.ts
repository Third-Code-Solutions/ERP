import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/20260928110200_award_cx_onboarding_seven_day_sla.sql', import.meta.url),
  'utf8'
)
const migrationBody = migration
  .replace(/^\s*(?:--[^\r\n]*\r?\n\s*)*begin;\s*/i, '')
  .replace(/\s*commit;\s*(?:--[^\r\n]*\r?\n?\s*)*$/i, '')
const rollback = Symbol('rollback')

describe('CX award onboarding SLA correction', () => {
  it('uses a guarded transaction and leaves clock schedules for explicit repair', () => {
    expect(migration).toMatch(/^begin;/m)
    expect(migration).toMatch(/lock table public\.sla_clocks in share mode;/i)
    expect(migration).toMatch(/ps\.sla_days = 2/i)
    expect(migration).toMatch(/set sla_days = 7/i)
  })
})

const databaseUrl = process.env.DATABASE_URL?.trim()
;(databaseUrl ? describe : describe.skip)('CX award onboarding SLA correction in PostgreSQL', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    if (!databaseUrl || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname)) {
      throw new Error('CX award migration proof requires disposable loopback PostgreSQL')
    }
    sql = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 15 })
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  async function createStep(tx: postgres.TransactionSql): Promise<{ tenantId: string; stepId: string }> {
    const tenantId = randomUUID()
    const stepId = randomUUID()
    await tx.unsafe('insert into public.tenants (id, name, slug) values ($1, $2, $3)',
      [tenantId, 'Synthetic CX SLA proof', `cx-sla-${tenantId}`])
    await tx.unsafe(`insert into public.process_steps
      (id, tenant_id, code, stage, name, responsible_bu, input, input_from,
       output, output_by, sla_days)
      values ($1, $2, 'AWARD.CX_ONBOARDING', 'award', 'CX onboarding task',
              'CX', 'Signed BOM', 'SD/PM/PE', 'CX onboarding task', 'CX', 2)`,
    [stepId, tenantId])
    return { tenantId, stepId }
  }

  it('corrects an existing two-day step to seven days and appends an audit event', async () => {
    try {
      await sql.begin(async (tx) => {
        const { tenantId, stepId } = await createStep(tx)
        await tx.unsafe(migrationBody)
        const rows = await tx.unsafe<Array<{ sla_days: number }>>(
          'select sla_days from public.process_steps where id = $1', [stepId])
        expect(rows[0]?.sla_days).toBe(7)
        const audit = await tx.unsafe<Array<{ action: string }>>(
          `select action from public.audit_log
            where tenant_id = $1 and entity_type = 'process_steps' and entity_id = $2`,
          [tenantId, stepId])
        expect(audit.some(row => row.action === 'update')).toBe(true)
        throw rollback
      })
    } catch (error) {
      if (error !== rollback) throw error
    }
  })

  it('refuses to change a step whose task already has a clock', async () => {
    try {
      await sql.begin(async (tx) => {
        const { tenantId, stepId } = await createStep(tx)
        const taskId = randomUUID()
        await tx.unsafe(`insert into public.task_instances
          (id, tenant_id, process_step_id, subject_type, subject_id, instance_key)
          values ($1, $2, $3, 'award_handoff', $4, $5)`,
        [taskId, tenantId, stepId, randomUUID(), `award:${randomUUID()}:cxOnboarding`])
        await tx.unsafe(`insert into public.sla_clocks
          (tenant_id, task_instance_id, clock_type, clock_scope, target_value,
           started_at, at_risk_at, due_at, escalation_at)
          values ($1, $2, 'business_days', 'internal', 2,
                  '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01')`,
        [tenantId, taskId])
        await tx.unsafe('savepoint cx_sla_guard')
        let errorCode: string | undefined
        try {
          await tx.unsafe(migrationBody)
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error) {
            errorCode = String(error.code)
          }
        }
        await tx.unsafe('rollback to savepoint cx_sla_guard')
        await tx.unsafe('release savepoint cx_sla_guard')
        expect(errorCode).toBe('55000')
        const rows = await tx.unsafe<Array<{ sla_days: number }>>(
          'select sla_days from public.process_steps where id = $1', [stepId])
        expect(rows[0]?.sla_days).toBe(2)
        throw rollback
      })
    } catch (error) {
      if (error !== rollback) throw error
    }
  })
})
