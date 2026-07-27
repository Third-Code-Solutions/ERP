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
  '../../../../supabase/migrations/20260726201606_accounting_ledger_foundation.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('accounting ledger migration contract', () => {
  it('creates the complete finance write model', () => {
    for (const table of [
      'fiscal_periods',
      'ledger_accounts',
      'financial_sequences',
      'journal_entries',
      'journal_lines',
    ]) {
      expect(migrationSql).toContain(`create table if not exists public.${table}`)
    }
  })

  it('enforces balanced one-sided positive lines', () => {
    expect(migrationSql).toContain(
      'constraint journal_lines_one_sided_positive_amount'
    )
    expect(migrationSql).toContain(
      '(debit_cents > 0 and credit_cents = 0)'
    )
    expect(migrationSql).toContain(
      '(credit_cents > 0 and debit_cents = 0)'
    )
    expect(migrationSql).toContain(
      'journal debits and credits must balance above zero'
    )
  })

  it('allocates tenant-year journal numbers atomically', () => {
    expect(migrationSql).toContain(
      'primary key (tenant_id, sequence_key)'
    )
    expect(migrationSql).toContain(
      'on conflict (tenant_id, sequence_key)'
    )
    expect(migrationSql).toContain(
      'next_value = public.financial_sequences.next_value + 1'
    )
    expect(migrationSql).toContain("'journal:' ||")
    expect(migrationSql).toContain("'je-%s-%s'")
  })

  it('makes posting and reversal database transactions', () => {
    expect(migrationSql).toContain(
      'create or replace function public.post_journal_entry'
    )
    expect(migrationSql).toContain(
      'create or replace function public.reverse_journal_entry'
    )
    expect(migrationSql).toContain('for update;')
    expect(migrationSql).toContain("set status = 'posted'")
    expect(migrationSql).toContain(
      'original_line.credit_cents,\n    original_line.debit_cents'
    )
  })

  it('blocks edits to posted entries and lines', () => {
    expect(migrationSql).toContain(
      'create or replace function public.guard_posted_journal_entry'
    )
    expect(migrationSql).toContain(
      'create or replace function public.guard_posted_journal_line'
    )
    expect(migrationSql).toContain(
      'posted journal entries are immutable'
    )
    expect(migrationSql).toContain('posted journal lines are immutable')
  })

  it('prevents overlapping and reopening fiscal periods', () => {
    expect(migrationSql).toContain(
      "pg_catalog.hashtextextended(\n      'fiscal_periods:'"
    )
    expect(migrationSql).toContain('fiscal periods cannot overlap')
    expect(migrationSql).toContain('closed fiscal periods are immutable')
  })

  it('uses tenant-consistent finance foreign keys', () => {
    for (const constraint of [
      'journal_entries_created_by_tenant_fk',
      'journal_entries_period_tenant_fk',
      'journal_entries_reverses_tenant_fk',
      'journal_lines_entry_tenant_fk',
      'journal_lines_account_tenant_fk',
      'journal_lines_project_tenant_fk',
    ]) {
      expect(migrationSql).toContain(`constraint ${constraint}`)
    }
  })

  it('restricts finance policies to finance, admin, and owner', () => {
    expect(migrationSql).toContain(
      "app_user.role::text in ('finance', 'admin', 'owner')"
    )
    expect(migrationSql).toContain(
      'create policy journal_entries_finance_read'
    )
    expect(migrationSql).toContain(
      'create policy journal_lines_finance_insert'
    )
    expect(migrationSql).toContain('and public.auth_can_manage_finance()')
  })

  it('keeps posting, reversal, closing, and sequence writes trusted-only', () => {
    expect(migrationSql).toMatch(
      /revoke execute on function public\.post_journal_entry\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke execute on function public\.reverse_journal_entry\(uuid, uuid, text, date\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke execute on function public\.close_fiscal_period\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).not.toMatch(
      /grant\s+.+financial_sequences[\s\S]*?to authenticated/
    )
  })

  it('attaches serialized audit triggers to every mutable finance record', () => {
    for (const trigger of [
      'audit_fiscal_periods',
      'audit_ledger_accounts',
      'audit_journal_entries',
      'audit_journal_lines',
    ]) {
      expect(migrationSql).toContain(`create trigger ${trigger}`)
    }
    expect(migrationSql).toContain(
      'execute function public.audit_log_trigger()'
    )
  })

  it('mirrors finance records into Cortex behind finance-aware RLS', () => {
    for (const nodeType of [
      'fiscal_period',
      'ledger_account',
      'journal_entry',
      'journal_line',
    ]) {
      expect(migrationSql).toContain(
        `add value if not exists '${nodeType}'`
      )
    }
    expect(migrationSql).toContain(
      'create or replace function public.cortex_mirror_finance'
    )
    expect(migrationSql).toContain(
      'create or replace function public.auth_can_read_cortex_node_type'
    )
    expect(migrationSql).toContain(
      'and public.auth_can_read_cortex_node_type(node_type)'
    )
    expect(migrationSql).toContain(
      'and public.auth_can_read_cortex_subject(subject_kind, subject_id)'
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_ACCOUNTING_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface AccountingFixture {
  tenantId: string
  actorId: string
  debitAccountId: string
  creditAccountId: string
  entryId: string
}

async function seedAccountingFixture(
  tx: postgres.TransactionSql,
  role = 'admin'
): Promise<AccountingFixture> {
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Ledger probe', 'ledger-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const actorId = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values(
         gen_random_uuid(),
         '${tenantId}',
         'ledger-${suffix}@probe.test',
         'Ledger Probe',
         '${role}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into fiscal_periods(
       tenant_id,
       name,
       starts_on,
       ends_on,
       created_by
     )
     values(
       '${tenantId}',
       'FY 2026',
       '2026-01-01',
       '2026-12-31',
       '${actorId}'
     )`
  )
  const debitAccountId = (
    (await tx.unsafe(
      `insert into ledger_accounts(
         tenant_id,
         code,
         name,
         account_type,
         normal_balance,
         created_by
       )
       values(
         '${tenantId}',
         '1000',
         'Cash',
         'asset',
         'debit',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const creditAccountId = (
    (await tx.unsafe(
      `insert into ledger_accounts(
         tenant_id,
         code,
         name,
         account_type,
         normal_balance,
         created_by
       )
       values(
         '${tenantId}',
         '3000',
         'Equity',
         'equity',
         'credit',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const entryId = (
    (await tx.unsafe(
      `insert into journal_entries(
         tenant_id,
         posting_date,
         description,
         created_by
       )
       values(
         '${tenantId}',
         '2026-07-01',
         'Opening balance',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into journal_lines(
       tenant_id,
       journal_entry_id,
       ledger_account_id,
       line_number,
       debit_cents,
       credit_cents
     )
     values
       ('${tenantId}', '${entryId}', '${debitAccountId}', 1, 10000, 0),
       ('${tenantId}', '${entryId}', '${creditAccountId}', 2, 0, 10000)`
  )
  return {
    tenantId,
    actorId,
    debitAccountId,
    creditAccountId,
    entryId,
  }
}

runtimeSuite('accounting ledger runtime proof', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('posts a balanced draft with a unique tenant-year number', async () => {
    const posted = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      const rows = (await tx.unsafe(
        `select *
         from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
      )) as Rows
      const state = (await tx.unsafe(
        `select status, entry_number, fiscal_period_id is not null as has_period
         from journal_entries
         where id = '${fixture.entryId}'`
      )) as Rows
      return { functionRow: rows[0], state: state[0] }
    })

    expect(posted.functionRow?.posted_number).toMatch(/^JE-2026-\d{6}$/)
    expect(posted.state).toMatchObject({
      status: 'posted',
      has_period: true,
    })
  })

  it('rejects an unbalanced journal', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      await tx.unsafe(
        `update journal_lines
         set credit_cents = 9999
         where journal_entry_id = '${fixture.entryId}'
           and credit_cents > 0`
      )
      try {
        await tx.unsafe(
          `select *
           from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects posting into a closed period', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      const period = (await tx.unsafe(
        `select id
         from fiscal_periods
         where tenant_id = '${fixture.tenantId}'`
      )) as Rows
      await tx.unsafe(
        `select close_fiscal_period(
           '${period[0]!.id}',
           '${fixture.actorId}'
         )`
      )
      try {
        await tx.unsafe(
          `select *
           from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects posting to an inactive ledger account', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      await tx.unsafe(
        `update ledger_accounts
         set is_active = false
         where id = '${fixture.debitAccountId}'`
      )
      try {
        await tx.unsafe(
          `select *
           from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('creates one posted equal-and-opposite reversal', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      await tx.unsafe(
        `select *
         from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
      )
      const reversal = (await tx.unsafe(
        `select *
         from reverse_journal_entry(
           '${fixture.entryId}',
           '${fixture.actorId}',
           'Duplicate opening entry',
           '2026-07-02'
         )`
      )) as Rows
      const totals = (await tx.unsafe(
        `select
           sum(debit_cents)::bigint as debit,
           sum(credit_cents)::bigint as credit
         from journal_lines
         where journal_entry_id = '${reversal[0]!.reversal_entry_id}'`
      )) as Rows
      const swapped = (await tx.unsafe(
        `select debit_cents, credit_cents
         from journal_lines
         where journal_entry_id = '${reversal[0]!.reversal_entry_id}'
         order by line_number`
      )) as Rows
      return {
        reversal: reversal[0],
        totals: totals[0],
        swapped: swapped.map((line) => ({
          debit_cents: Number(line.debit_cents),
          credit_cents: Number(line.credit_cents),
        })),
      }
    })

    expect(result.reversal?.reversal_number).toMatch(/^JE-2026-\d{6}$/)
    expect(result.totals).toEqual({ debit: '10000', credit: '10000' })
    expect(result.swapped[0]).toMatchObject({
      debit_cents: 0,
      credit_cents: 10000,
    })
    expect(result.swapped[1]).toMatchObject({
      debit_cents: 10000,
      credit_cents: 0,
    })
  })

  it('rejects a second reversal of the same original', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      await tx.unsafe(
        `select *
         from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
      )
      await tx.unsafe(
        `select *
         from reverse_journal_entry(
           '${fixture.entryId}',
           '${fixture.actorId}',
           'First reversal',
           '2026-07-02'
         )`
      )
      try {
        await tx.unsafe(
          `select *
           from reverse_journal_entry(
             '${fixture.entryId}',
             '${fixture.actorId}',
             'Second reversal',
             '2026-07-03'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects mutation of posted journal lines', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx)
      await tx.unsafe(
        `select *
         from post_journal_entry('${fixture.entryId}', '${fixture.actorId}')`
      )
      try {
        await tx.unsafe(
          `update journal_lines
           set debit_cents = debit_cents + 1
           where journal_entry_id = '${fixture.entryId}'`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('isolates finance records between tenants', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const tenantA = await seedAccountingFixture(tx, 'finance')
      await seedAccountingFixture(tx, 'finance')
      await becomeAuthenticated(tx, tenantA.actorId)
      const periods = (await tx.unsafe(
        `select count(*)::integer as count from fiscal_periods`
      )) as Rows
      const accounts = (await tx.unsafe(
        `select count(*)::integer as count from ledger_accounts`
      )) as Rows
      return {
        periods: periods[0]!.count,
        accounts: accounts[0]!.count,
      }
    })

    expect(visible).toEqual({ periods: 1, accounts: 2 })
  })

  it('denies finance mutation to a viewer', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx, 'viewer')
      await becomeAuthenticated(tx, fixture.actorId)
      try {
        await tx.unsafe(
          `insert into ledger_accounts(
             tenant_id,
             code,
             name,
             account_type,
             normal_balance,
             created_by
           )
           values(
             '${fixture.tenantId}',
             '7000',
             'Forbidden',
             'expense',
             'debit',
             '${fixture.actorId}'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('hides finance Cortex nodes, edges, and provenance from a viewer', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx, 'viewer')
      await becomeAuthenticated(tx, fixture.actorId)
      const nodes = (await tx.unsafe(
        `select count(*)::integer as count
         from cortex_nodes
         where node_type in (
           'fiscal_period',
           'ledger_account',
           'journal_entry',
           'journal_line'
         )`
      )) as Rows
      const edges = (await tx.unsafe(
        `select count(*)::integer as count
         from cortex_edges`
      )) as Rows
      const provenance = (await tx.unsafe(
        `select count(*)::integer as count
         from cortex_provenance
         where origin_ref like 'journal_%'
            or origin_ref like 'ledger_%'
            or origin_ref like 'fiscal_%'`
      )) as Rows
      return {
        nodes: nodes[0]!.count,
        edges: edges[0]!.count,
        provenance: provenance[0]!.count,
      }
    })

    expect(visible).toEqual({ nodes: 0, edges: 0, provenance: 0 })
  })

  it('allows a finance user to retrieve finance Cortex nodes', async () => {
    const count = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedAccountingFixture(tx, 'finance')
      await becomeAuthenticated(tx, fixture.actorId)
      const rows = (await tx.unsafe(
        `select count(*)::integer as count
         from cortex_nodes
         where node_type in (
           'fiscal_period',
           'ledger_account',
           'journal_entry',
           'journal_line'
         )`
      )) as Rows
      return rows[0]!.count
    })

    expect(count).toBe(6)
  })

  it('keeps posting and reversal RPCs unavailable to authenticated', async () => {
    const grants = (await sqlClient.unsafe(
      `select
         has_function_privilege(
           'authenticated',
           'post_journal_entry(uuid,uuid)',
           'EXECUTE'
         ) as post_execute,
         has_function_privilege(
           'authenticated',
           'reverse_journal_entry(uuid,uuid,text,date)',
           'EXECUTE'
         ) as reverse_execute,
         has_table_privilege(
           'authenticated',
           'financial_sequences',
           'SELECT'
         ) as sequence_read`
    )) as Rows

    expect(grants[0]).toEqual({
      post_execute: false,
      reverse_execute: false,
      sequence_read: false,
    })
  })
})
