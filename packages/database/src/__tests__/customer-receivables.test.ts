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
  '../../../../supabase/migrations/20260726210500_customer_receivables_foundation.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('customer receivables migration contract', () => {
  it('adds immutable issuance evidence and Business Account dimensions', () => {
    for (const fragment of [
      'add column if not exists account_id uuid',
      'add column if not exists issued_by uuid',
      'add column if not exists issued_at timestamptz',
      'add column if not exists issuance_journal_entry_id uuid',
      'add column if not exists reversed_by uuid',
      'add column if not exists reversed_at timestamptz',
      'add column if not exists reversal_reason text',
      'add column if not exists reversal_journal_entry_id uuid',
      'add column if not exists business_account_id uuid',
    ]) {
      expect(migrationSql).toContain(fragment)
    }
  })

  it('enforces tenant-consistent invoice and journal dimensions', () => {
    for (const constraint of [
      'invoices_project_tenant_fk',
      'invoices_account_tenant_fk',
      'invoices_issued_by_tenant_fk',
      'invoices_issuance_journal_tenant_fk',
      'invoices_reversed_by_tenant_fk',
      'invoices_reversal_journal_tenant_fk',
      'journal_lines_business_account_tenant_fk',
    ]) {
      expect(migrationSql).toContain(`constraint ${constraint}`)
    }
  })

  it('posts issuance through one database-authoritative function', () => {
    expect(migrationSql).toContain(
      'create or replace function public.issue_customer_invoice'
    )
    expect(migrationSql).toContain(
      'from public.post_journal_entry(v_journal_id, p_actor_id)'
    )
    expect(migrationSql).toContain("'customer_invoice'")
    expect(migrationSql).toContain("status = 'issued'")
    expect(migrationSql).toContain(
      'create or replace function public.reverse_customer_invoice'
    )
  })

  it('separates receivable components and balances revenue plus VAT', () => {
    for (const systemKey of [
      'accounts_receivable',
      'retention_receivable',
      'withholding_tax_receivable',
      'revenue',
      'output_vat_payable',
    ]) {
      expect(migrationSql).toContain(`system_key = '${systemKey}'`)
    }
    expect(migrationSql).toContain('customer invoice amounts do not reconcile')
  })

  it('makes issued invoice financial terms and posting evidence immutable', () => {
    expect(migrationSql).toContain(
      'create or replace function public.guard_customer_invoice'
    )
    expect(migrationSql).toContain(
      'issued invoice financial terms are immutable'
    )
    expect(migrationSql).toContain('invoice issuance linkage is immutable')
    expect(migrationSql).toContain('invoice reversal linkage is immutable')
    expect(migrationSql).toContain(
      'receipt allocation evidence is required for payment status'
    )
  })

  it('limits invoice Data API mutation and trusted functions', () => {
    expect(migrationSql).toContain('create policy invoices_finance_read')
    expect(migrationSql).toContain('create policy invoices_finance_insert')
    expect(migrationSql).toContain('create policy invoices_finance_update')
    expect(migrationSql).toMatch(
      /revoke execute on function public\.issue_customer_invoice\(uuid, uuid, date\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke execute on function public\.cancel_customer_invoice\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke execute on function public\.reverse_customer_invoice\(uuid, uuid, text, date\)[\s\S]*?from public, anon, authenticated/
    )
  })

  it('adds finance-aware Cortex edges and protects invoice nodes', () => {
    expect(migrationSql).toContain(
      'create or replace function public.cortex_mirror_receivable_dimensions'
    )
    expect(migrationSql).toContain("'bills'")
    expect(migrationSql).toContain("'invoice',")
    expect(migrationSql).toContain(
      'create or replace function public.auth_can_read_cortex_node_type'
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_RECEIVABLES_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface ReceivablesFixture {
  tenantId: string
  actorId: string
  businessAccountId: string | null
  projectId: string
  invoiceId: string
}

async function seedReceivablesFixture(
  tx: postgres.TransactionSql,
  options: {
    role?: string
    withBusinessAccount?: boolean
  } = {}
): Promise<ReceivablesFixture> {
  const role = options.role ?? 'admin'
  const withBusinessAccount = options.withBusinessAccount ?? true
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Receivables probe', 'receivables-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const actorId = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values(
         gen_random_uuid(),
         '${tenantId}',
         'receivables-${suffix}@probe.test',
         'Receivables Probe',
         '${role}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const businessAccountId = withBusinessAccount
    ? ((
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values('${tenantId}', 'Customer ${suffix}', '${actorId}')
           returning id`
        )) as Rows
      )[0]!.id as string)
    : null
  const projectId = (
    (await tx.unsafe(
      `insert into projects(
         tenant_id,
         account_id,
         name,
         client,
         created_by
       )
       values(
         '${tenantId}',
         ${businessAccountId ? `'${businessAccountId}'` : 'null'},
         'Receivables project',
         'Customer ${suffix}',
         '${actorId}'
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

  await tx.unsafe(
    `insert into ledger_accounts(
       tenant_id,
       code,
       name,
       account_type,
       normal_balance,
       system_key,
       created_by
     )
     values
       (
         '${tenantId}', '1100', 'Accounts receivable',
         'asset', 'debit', 'accounts_receivable', '${actorId}'
       ),
       (
         '${tenantId}', '1110', 'Retention receivable',
         'asset', 'debit', 'retention_receivable', '${actorId}'
       ),
       (
         '${tenantId}', '1120', 'Withholding tax receivable',
         'asset', 'debit', 'withholding_tax_receivable', '${actorId}'
       ),
       (
         '${tenantId}', '2100', 'Output VAT payable',
         'liability', 'credit', 'output_vat_payable', '${actorId}'
       ),
       (
         '${tenantId}', '4000', 'Revenue',
         'income', 'credit', 'revenue', '${actorId}'
       )`
  )

  const invoiceId = (
    (await tx.unsafe(
      `insert into invoices(
         tenant_id,
         project_id,
         account_id,
         created_by,
         invoice_number,
         billing_percent_bps,
         retention_bps,
         subtotal_cents,
         retention_cents,
         vat_cents,
         withholding_tax_cents,
         net_amount_cents,
         due_date
       )
       values(
         '${tenantId}',
         '${projectId}',
         ${businessAccountId ? `'${businessAccountId}'` : 'null'},
         '${actorId}',
         'INV-202607-001',
         2500,
         1000,
         100000,
         10000,
         10800,
         1800,
         99000,
         '2026-08-15'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

  return {
    tenantId,
    actorId,
    businessAccountId,
    projectId,
    invoiceId,
  }
}

runtimeSuite('customer receivables runtime proof', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('issues one balanced dimensional journal atomically', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      const issued = (await tx.unsafe(
        `select *
         from issue_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )) as Rows
      const invoice = (await tx.unsafe(
        `select status, issuance_journal_entry_id, account_id
         from invoices
         where id = '${fixture.invoiceId}'`
      )) as Rows
      const lines = (await tx.unsafe(
        `select
           account.system_key,
           line.debit_cents,
           line.credit_cents,
           line.project_id,
           line.business_account_id
         from journal_lines line
         join ledger_accounts account
           on account.id = line.ledger_account_id
          and account.tenant_id = line.tenant_id
         where line.journal_entry_id =
           '${issued[0]!.journal_entry_id}'
         order by line.line_number`
      )) as Rows
      return { fixture, issued: issued[0], invoice: invoice[0], lines }
    })

    expect(result.issued?.journal_entry_number).toMatch(/^JE-2026-\d{6}$/)
    expect(result.invoice).toMatchObject({
      status: 'issued',
      issuance_journal_entry_id: result.issued?.journal_entry_id,
      account_id: result.fixture.businessAccountId,
    })
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.debit_cents),
        0
      )
    ).toBe(110_800)
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.credit_cents),
        0
      )
    ).toBe(110_800)
    expect(result.lines).toHaveLength(5)
    expect(
      result.lines.every(
        (line) =>
          line.project_id === result.fixture.projectId &&
          line.business_account_id === result.fixture.businessAccountId
      )
    ).toBe(true)
  })

  it('rejects repeated issuance', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      await tx.unsafe(
        `select *
         from issue_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )
      try {
        await tx.unsafe(
          `select *
           from issue_customer_invoice(
             '${fixture.invoiceId}',
             '${fixture.actorId}',
             '2026-07-27'
           )`
        )
      } catch {
        return true
      }
      return false
    })

    expect(rejected).toBe(true)
  })

  it('reverses an issued invoice with equal opposite dimensions', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      const issued = (await tx.unsafe(
        `select *
         from issue_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )) as Rows
      const reversed = (await tx.unsafe(
        `select *
         from reverse_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           'Customer-approved correction',
           '2026-07-28'
         )`
      )) as Rows
      const invoice = (await tx.unsafe(
        `select status, reversal_journal_entry_id, reversal_reason
         from invoices
         where id = '${fixture.invoiceId}'`
      )) as Rows
      const totals = (await tx.unsafe(
        `select
           sum(debit_cents)::bigint as debit,
           sum(credit_cents)::bigint as credit,
           count(*) filter (
             where project_id = '${fixture.projectId}'
               and business_account_id = '${fixture.businessAccountId}'
           )::int as dimensional_lines
         from journal_lines
         where journal_entry_id =
           '${reversed[0]!.reversal_entry_id}'`
      )) as Rows
      return {
        issued: issued[0],
        reversed: reversed[0],
        invoice: invoice[0],
        totals: totals[0],
      }
    })

    expect(result.reversed?.reversal_entry_number).toMatch(
      /^JE-2026-\d{6}$/
    )
    expect(result.reversed?.reversal_entry_id).not.toBe(
      result.issued?.journal_entry_id
    )
    expect(result.invoice).toMatchObject({
      status: 'cancelled',
      reversal_journal_entry_id: result.reversed?.reversal_entry_id,
      reversal_reason: 'Customer-approved correction',
    })
    expect(result.totals).toEqual({
      debit: '110800',
      credit: '110800',
      dimensional_lines: 5,
    })
  })

  it('rejects bypassing the invoice reversal workflow', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      const issued = (await tx.unsafe(
        `select *
         from issue_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )) as Rows
      try {
        await tx.unsafe(
          `select *
           from reverse_journal_entry(
             '${issued[0]!.journal_entry_id}',
             '${fixture.actorId}',
             'Bypass attempt',
             '2026-07-28'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects issuance into a closed fiscal period', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      const period = (await tx.unsafe(
        `select id from fiscal_periods where tenant_id = '${fixture.tenantId}'`
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
           from issue_customer_invoice(
             '${fixture.invoiceId}',
             '${fixture.actorId}',
             '2026-07-27'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects an invoice without a Business Account', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx, {
        withBusinessAccount: false,
      })
      try {
        await tx.unsafe(
          `select *
           from issue_customer_invoice(
             '${fixture.invoiceId}',
             '${fixture.actorId}',
             '2026-07-27'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects a missing required control account', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      await tx.unsafe(
        `delete from ledger_accounts
         where tenant_id = '${fixture.tenantId}'
           and system_key = 'output_vat_payable'`
      )
      try {
        await tx.unsafe(
          `select *
           from issue_customer_invoice(
             '${fixture.invoiceId}',
             '${fixture.actorId}',
             '2026-07-27'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('denies invoice issuance to a non-finance actor', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx, { role: 'viewer' })
      try {
        await tx.unsafe(
          `select *
           from issue_customer_invoice(
             '${fixture.invoiceId}',
             '${fixture.actorId}',
             '2026-07-27'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('blocks financial edits after issuance', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      await tx.unsafe(
        `select *
         from issue_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )
      try {
        await tx.unsafe(
          `update invoices
           set subtotal_cents = subtotal_cents + 1
           where id = '${fixture.invoiceId}'`
        )
      } catch {
        return true
      }
      return false
    })

    expect(rejected).toBe(true)
  })

  it('blocks payment status without receipt allocation evidence', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      await tx.unsafe(
        `select *
         from issue_customer_invoice(
           '${fixture.invoiceId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )
      try {
        await tx.unsafe(
          `update invoices
           set status = 'paid'
           where id = '${fixture.invoiceId}'`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('hides invoice graph records from a viewer', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedReceivablesFixture(tx)
      await tx.unsafe(
        `update users set role = 'viewer' where id = '${fixture.actorId}'`
      )
      await becomeAuthenticated(tx, fixture.actorId)
      const nodes = (await tx.unsafe(
        `select count(*)::int as count
         from cortex_nodes
         where node_type = 'invoice'`
      )) as Rows
      return nodes[0]!.count
    })

    expect(visible).toBe(0)
  })

  it('keeps issuance and cancellation RPCs unavailable to authenticated', async () => {
    const grants = (await sqlClient.unsafe(
      `select
         has_function_privilege(
           'authenticated',
           'issue_customer_invoice(uuid,uuid,date)',
           'EXECUTE'
         ) as issue_execute,
         has_function_privilege(
           'authenticated',
           'cancel_customer_invoice(uuid,uuid)',
           'EXECUTE'
         ) as cancel_execute,
         has_function_privilege(
           'authenticated',
           'reverse_customer_invoice(uuid,uuid,text,date)',
           'EXECUTE'
         ) as reverse_execute`
    )) as Rows

    expect(grants[0]).toEqual({
      issue_execute: false,
      cancel_execute: false,
      reverse_execute: false,
    })
  })
})
