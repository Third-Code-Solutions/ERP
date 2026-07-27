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
const schemaSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726231000_bank_reconciliation_schema.sql'
  ),
  'utf8'
).toLowerCase()
const workflowSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726232000_bank_reconciliation_foundation.sql'
  ),
  'utf8'
).toLowerCase()
const migrationSql = `${schemaSql}\n${workflowSql}`

describe('bank reconciliation migration contract', () => {
  it('creates typed statement and line evidence', () => {
    expect(schemaSql).toContain('create type public.bank_statement_status')
    expect(schemaSql).toContain(
      'create table if not exists public.bank_statements'
    )
    expect(schemaSql).toContain(
      'create table if not exists public.bank_statement_lines'
    )
    expect(schemaSql).toContain("add value if not exists 'bank_statement'")
  })

  it('fingerprints the exact imported source bytes', () => {
    expect(schemaSql).toContain('source_file_name varchar(255) not null')
    expect(schemaSql).toContain('source_sha256 char(64) not null')
    expect(schemaSql).toContain('bank_statements_source_sha256_format')
    expect(workflowSql).toContain(
      'new.source_sha256 is distinct from old.source_sha256'
    )
  })

  it('uses tenant-safe keys and one-use cash evidence', () => {
    for (const constraint of [
      'bank_statements_cash_account_tenant_fk',
      'bank_statement_lines_statement_tenant_fk',
      'bank_statement_lines_cash_transaction_tenant_fk',
      'bank_statement_lines_matched_by_tenant_fk',
    ]) {
      expect(schemaSql).toContain(`constraint ${constraint}`)
    }
    expect(schemaSql).toContain(
      'ux_bank_statement_lines_cash_transaction'
    )
  })

  it('matches manually and automatically through trusted workflows', () => {
    expect(workflowSql).toContain(
      'create or replace function public.match_bank_statement_line'
    )
    expect(workflowSql).toContain(
      'create or replace function public.auto_match_bank_statement'
    )
    expect(workflowSql).toContain('v_candidate_count = 1')
    expect(workflowSql).toMatch(
      /line_record\.transaction_date - 7[\s\S]*?line_record\.transaction_date \+ 7/
    )
  })

  it('reconciles only complete, balanced, unchanged evidence', () => {
    expect(workflowSql).toContain(
      'create or replace function public.reconcile_bank_statement'
    )
    expect(workflowSql).toContain(
      'bank statement balances do not roll forward'
    )
    expect(workflowSql).toContain(
      'every bank statement line must be matched'
    )
    expect(workflowSql).toContain(
      'matched cash evidence changed before reconciliation'
    )
  })

  it('uses void evidence instead of destructive reconciliation edits', () => {
    expect(workflowSql).toContain(
      'create or replace function public.void_bank_statement'
    )
    expect(workflowSql).toContain(
      'reconciled bank statement evidence is immutable'
    )
    expect(workflowSql).toContain(
      'bank statement void evidence is immutable'
    )
  })

  it('blocks cash reversal while active bank evidence exists', () => {
    expect(workflowSql).toContain(
      'unmatch or void bank reconciliation first'
    )
    expect(workflowSql).toMatch(
      /from public\.bank_statement_lines line[\s\S]*?statement\.status <> 'voided'/
    )
  })

  it('protects, audits, and mirrors finance-sensitive records', () => {
    expect(workflowSql).toContain(
      'create policy bank_statements_finance_read'
    )
    expect(workflowSql).toContain(
      'create policy bank_statement_lines_finance_insert'
    )
    expect(workflowSql).toContain('create trigger audit_bank_statements')
    expect(workflowSql).toContain(
      'create or replace function public.cortex_mirror_bank_statement'
    )
    expect(workflowSql).toMatch(
      /revoke execute on function public\.reconcile_bank_statement\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_RECONCILIATION_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface ReconciliationFixture {
  tenantId: string
  actorId: string
  viewerId: string
  cashAccountId: string
  receiptId: string
}

async function seedReconciliationFixture(
  tx: postgres.TransactionSql
): Promise<ReconciliationFixture> {
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Reconciliation probe', 'reconciliation-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const users = (await tx.unsafe(
    `insert into users(id, tenant_id, email, full_name, role)
     values
       (
         gen_random_uuid(),
         '${tenantId}',
         'finance-${suffix}@probe.test',
         'Finance Probe',
         'finance'
       ),
       (
         gen_random_uuid(),
         '${tenantId}',
         'viewer-${suffix}@probe.test',
         'Viewer Probe',
         'viewer'
       )
     returning id, role`
  )) as Rows
  const actorId = users.find((user) => user.role === 'finance')!.id as string
  const viewerId = users.find((user) => user.role === 'viewer')!.id as string
  const businessAccountId = (
    (await tx.unsafe(
      `insert into accounts(tenant_id, name, created_by)
       values('${tenantId}', 'Customer ${suffix}', '${actorId}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const periodId = (
    (await tx.unsafe(
      `insert into fiscal_periods(
         tenant_id, name, starts_on, ends_on, created_by
       )
       values(
         '${tenantId}',
         'FY 2026',
         '2026-01-01',
         '2026-12-31',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const ledgerId = (
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
         '1010',
         'Operating bank',
         'asset',
         'debit',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const cashAccountId = (
    (await tx.unsafe(
      `insert into cash_accounts(
         tenant_id,
         ledger_account_id,
         name,
         account_kind,
         created_by
       )
       values(
         '${tenantId}',
         '${ledgerId}',
         'Operating bank',
         'bank',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const journalId = (
    (await tx.unsafe(
      `insert into journal_entries(
         tenant_id,
         fiscal_period_id,
         entry_number,
         status,
         source_type,
         posting_date,
         description,
         currency,
         created_by,
         posted_by,
         posted_at
       )
       values(
         '${tenantId}',
         '${periodId}',
         'JE-2026-${suffix}',
         'posted',
         'system',
         '2026-07-27',
         'Reconciliation fixture',
         'PHP',
         '${actorId}',
         '${actorId}',
         now()
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const receiptId = (
    (await tx.unsafe(
      `insert into cash_transactions(
         tenant_id,
         cash_account_id,
         direction,
         business_account_id,
         reference_number,
         internal_number,
         status,
         transaction_date,
         currency,
         amount_cents,
         posting_journal_entry_id,
         posted_by,
         posted_at,
         created_by
       )
       values(
         '${tenantId}',
         '${cashAccountId}',
         'receipt',
         '${businessAccountId}',
         'DEP-${suffix}',
         'CT-2026-${suffix}',
         'posted',
         '2026-07-27',
         'PHP',
         50000,
         '${journalId}',
         '${actorId}',
         now(),
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

  return { tenantId, actorId, viewerId, cashAccountId, receiptId }
}

async function createStatement(
  tx: postgres.TransactionSql,
  fixture: ReconciliationFixture,
  options: {
    amountCents?: number
    transactionDate?: string
    referenceSuffix?: string
  } = {}
): Promise<{ statementId: string; lineId: string }> {
  const amountCents = options.amountCents ?? 50_000
  const transactionDate = options.transactionDate ?? '2026-07-27'
  const referenceSuffix =
    options.referenceSuffix ??
    ((await tx.unsafe(
      `select substr(md5(random()::text), 1, 8) as suffix`
    )) as Rows)[0]!.suffix
  const statementId = (
    (await tx.unsafe(
      `insert into bank_statements(
         tenant_id,
         cash_account_id,
         reference_number,
         source_file_name,
         source_sha256,
         statement_start,
         statement_end,
         opening_balance_cents,
         closing_balance_cents,
         created_by
       )
       values(
         '${fixture.tenantId}',
         '${fixture.cashAccountId}',
         'ST-${referenceSuffix}',
         'statement-${referenceSuffix}.csv',
         repeat('a', 64),
         '2026-07-01',
         '2026-07-31',
         100000,
         ${100_000 + amountCents},
         '${fixture.actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const lineId = (
    (await tx.unsafe(
      `insert into bank_statement_lines(
         tenant_id,
         bank_statement_id,
         line_number,
         transaction_date,
         reference_number,
         description,
         amount_cents
       )
       values(
         '${fixture.tenantId}',
         '${statementId}',
         1,
         '${transactionDate}',
         'DEP',
         'Customer deposit',
         ${amountCents}
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  return { statementId, lineId }
}

runtimeSuite('bank reconciliation runtime proof', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('auto-matches one unambiguous exact candidate', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture)
      const match = (await tx.unsafe(
        `select * from auto_match_bank_statement(
          '${statement.statementId}', '${fixture.actorId}'
        )`
      )) as Rows
      const line = (await tx.unsafe(
        `select matched_cash_transaction_id
         from bank_statement_lines
         where id = '${statement.lineId}'`
      )) as Rows
      return { fixture, match: match[0], line: line[0] }
    })

    expect(result.match).toEqual({
      matched_count: 1,
      remaining_count: 0,
    })
    expect(result.line?.matched_cash_transaction_id).toBe(
      result.fixture.receiptId
    )
  })

  it('leaves ambiguous exact candidates for Finance review', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture)
      const existing = (await tx.unsafe(
        `select *
         from cash_transactions
         where id = '${fixture.receiptId}'`
      )) as Rows
      const source = existing[0]!
      const journalId = (
        (await tx.unsafe(
          `insert into journal_entries(
             tenant_id,
             fiscal_period_id,
             entry_number,
             status,
             source_type,
             posting_date,
             description,
             currency,
             created_by,
             posted_by,
             posted_at
           )
           select
             tenant_id,
             fiscal_period_id,
             entry_number || '-B',
             status,
             source_type,
             posting_date,
             description,
             currency,
             created_by,
             posted_by,
             posted_at
           from journal_entries
           where id = '${source.posting_journal_entry_id}'
           returning id`
        )) as Rows
      )[0]!.id as string
      await tx.unsafe(
        `insert into cash_transactions(
           tenant_id,
           cash_account_id,
           direction,
           business_account_id,
           reference_number,
           internal_number,
           status,
           transaction_date,
           currency,
           amount_cents,
           posting_journal_entry_id,
           posted_by,
           posted_at,
           created_by
         )
         values(
           '${fixture.tenantId}',
           '${fixture.cashAccountId}',
           'receipt',
           '${source.business_account_id}',
           'DEP-AMBIGUOUS',
           'CT-AMBIGUOUS',
           'posted',
           '2026-07-27',
           'PHP',
           50000,
           '${journalId}',
           '${fixture.actorId}',
           now(),
           '${fixture.actorId}'
         )`
      )
      const match = (await tx.unsafe(
        `select * from auto_match_bank_statement(
          '${statement.statementId}', '${fixture.actorId}'
        )`
      )) as Rows
      return match[0]
    })

    expect(result).toEqual({ matched_count: 0, remaining_count: 1 })
  })

  it('manually matches, reconciles, and freezes source evidence', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture)
      await tx.unsafe(
        `select match_bank_statement_line(
          '${statement.lineId}',
          '${fixture.receiptId}',
          '${fixture.actorId}'
        )`
      )
      await tx.unsafe(
        `select reconcile_bank_statement(
          '${statement.statementId}',
          '${fixture.actorId}'
        )`
      )
      let immutable = false
      await tx.unsafe('savepoint bank_source_edit')
      try {
        await tx.unsafe(
          `update bank_statements
           set source_sha256 = repeat('b', 64)
           where id = '${statement.statementId}'`
        )
      } catch {
        immutable = true
        await tx.unsafe('rollback to savepoint bank_source_edit')
      }
      await tx.unsafe('release savepoint bank_source_edit')
      const state = (await tx.unsafe(
        `select status, reconciled_at is not null as reconciled
         from bank_statements
         where id = '${statement.statementId}'`
      )) as Rows
      return { immutable, state: state[0] }
    })

    expect(result.immutable).toBe(true)
    expect(result.state).toEqual({
      status: 'reconciled',
      reconciled: true,
    })
  })

  it('rejects a cash match with the wrong amount', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture, {
        amountCents: 49_999,
      })
      try {
        await tx.unsafe(
          `select match_bank_statement_line(
            '${statement.lineId}',
            '${fixture.receiptId}',
            '${fixture.actorId}'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('requires Finance authority for manual matching', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture)
      try {
        await tx.unsafe(
          `select match_bank_statement_line(
            '${statement.lineId}',
            '${fixture.receiptId}',
            '${fixture.viewerId}'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('blocks cash reversal while draft match evidence remains', async () => {
    const rejection = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture)
      await tx.unsafe(
        `select match_bank_statement_line(
          '${statement.lineId}',
          '${fixture.receiptId}',
          '${fixture.actorId}'
        )`
      )
      try {
        await tx.unsafe(
          `select * from reverse_cash_transaction(
            '${fixture.receiptId}',
            '${fixture.actorId}',
            'Correction',
            '2026-07-28'
          )`
        )
      } catch (error) {
        return String(error)
      }
      return ''
    })
    expect(rejection).toContain('Unmatch or void bank reconciliation first')
  })

  it('voids a reconciled statement without deleting match history', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      const statement = await createStatement(tx, fixture)
      await tx.unsafe(
        `select match_bank_statement_line(
          '${statement.lineId}',
          '${fixture.receiptId}',
          '${fixture.actorId}'
        )`
      )
      await tx.unsafe(
        `select reconcile_bank_statement(
          '${statement.statementId}',
          '${fixture.actorId}'
        )`
      )
      await tx.unsafe(
        `select void_bank_statement(
          '${statement.statementId}',
          '${fixture.actorId}',
          'Imported wrong institution period'
        )`
      )
      const evidence = (await tx.unsafe(
        `select
           statement.status,
           statement.void_reason,
           line.matched_cash_transaction_id
         from bank_statements statement
         join bank_statement_lines line
           on line.bank_statement_id = statement.id
         where statement.id = '${statement.statementId}'`
      )) as Rows
      return evidence[0]
    })

    expect(result).toEqual({
      status: 'voided',
      void_reason: 'Imported wrong institution period',
      matched_cash_transaction_id: expect.any(String),
    })
  })

  it('hides bank statement Cortex records from a viewer', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReconciliationFixture(tx)
      await createStatement(tx, fixture)
      await becomeAuthenticated(tx, fixture.viewerId)
      const nodes = (await tx.unsafe(
        `select count(*)::int as count
         from cortex_nodes
         where node_type = 'bank_statement'`
      )) as Rows
      return nodes[0]!.count
    })
    expect(visible).toBe(0)
  })

  it('keeps reconciliation RPCs unavailable to authenticated', async () => {
    const grants = (await sqlClient.unsafe(
      `select
         has_function_privilege(
           'authenticated',
           'match_bank_statement_line(uuid,uuid,uuid)',
           'EXECUTE'
         ) as match_execute,
         has_function_privilege(
           'authenticated',
           'reconcile_bank_statement(uuid,uuid)',
           'EXECUTE'
         ) as reconcile_execute,
         has_function_privilege(
           'authenticated',
           'void_bank_statement(uuid,uuid,text)',
           'EXECUTE'
         ) as void_execute`
    )) as Rows

    expect(grants[0]).toEqual({
      match_execute: false,
      reconcile_execute: false,
      void_execute: false,
    })
  })
})
