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
  '../../../../supabase/migrations/20260726220000_supplier_payables_foundation.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('supplier payables migration contract', () => {
  it('creates matched supplier bills and allocation lines', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.supplier_bills'
    )
    expect(migrationSql).toContain(
      'create table if not exists public.supplier_bill_lines'
    )
    for (const constraint of [
      'supplier_bills_po_tenant_fk',
      'supplier_bills_project_tenant_fk',
      'supplier_bills_vendor_tenant_fk',
      'supplier_bill_lines_account_tenant_fk',
      'supplier_bill_lines_project_tenant_fk',
    ]) {
      expect(migrationSql).toContain(`constraint ${constraint}`)
    }
  })

  it('enforces external bill uniqueness and immutable posting evidence', () => {
    expect(migrationSql).toContain('ux_supplier_bills_vendor_number')
    expect(migrationSql).toContain(
      'create or replace function public.guard_supplier_bill'
    )
    expect(migrationSql).toContain('posted supplier bill terms are immutable')
    expect(migrationSql).toContain(
      'supplier bill reversal linkage is immutable'
    )
    expect(migrationSql).toContain('posted supplier bill lines are immutable')
  })

  it('posts only matched issued Purchase Orders through the ledger', () => {
    expect(migrationSql).toContain(
      'create or replace function public.post_supplier_bill'
    )
    expect(migrationSql).toContain(
      'purchase order must be approved and issued before billing'
    )
    expect(migrationSql).toContain(
      'supplier bill vendor or project does not match purchase order'
    )
    expect(migrationSql).toContain(
      'supplier bill exceeds unbilled purchase order subtotal'
    )
    expect(migrationSql).toContain(
      'from public.post_journal_entry(v_journal_id, p_actor_id)'
    )
  })

  it('balances expense and tax debits against payable credits', () => {
    for (const systemKey of [
      'accounts_payable',
      'input_vat_receivable',
      'withholding_tax_payable',
    ]) {
      expect(migrationSql).toContain(`system_key = '${systemKey}'`)
    }
    expect(migrationSql).toContain("'amount payable to vendor'")
    expect(migrationSql).toContain("'input vat'")
    expect(migrationSql).toContain("'withholding tax payable'")
  })

  it('preserves Vendor dimensions and makes the bill own reversal', () => {
    expect(migrationSql).toContain('add column if not exists vendor_id uuid')
    expect(migrationSql).toContain('original_line.vendor_id')
    expect(migrationSql).toContain(
      'create or replace function public.reverse_supplier_bill'
    )
    expect(migrationSql).toContain(
      'use the supplier bill reversal workflow'
    )
  })

  it('protects payable tables and trusted RPCs', () => {
    expect(migrationSql).toContain('create policy supplier_bills_finance_read')
    expect(migrationSql).toContain(
      'create policy supplier_bill_lines_finance_insert'
    )
    expect(migrationSql).toMatch(
      /revoke execute on function public\.post_supplier_bill\(uuid, uuid, date\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke execute on function public\.reverse_supplier_bill\(uuid, uuid, text, date\)[\s\S]*?from public, anon, authenticated/
    )
  })

  it('audits and mirrors finance-sensitive payable records into Cortex', () => {
    expect(migrationSql).toContain(
      'create or replace function public.cortex_mirror_payables'
    )
    expect(migrationSql).toContain("'supplier_bill'")
    expect(migrationSql).toContain('create trigger audit_supplier_bills')
    expect(migrationSql).toContain(
      'create trigger audit_supplier_bill_lines'
    )
    expect(migrationSql).toContain(
      'create or replace function public.auth_can_read_cortex_node_type'
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_PAYABLES_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface PayablesFixture {
  tenantId: string
  actorId: string
  projectId: string
  vendorId: string
  purchaseOrderId: string
  billId: string
  allocationAccountId: string
}

async function seedPayablesFixture(
  tx: postgres.TransactionSql,
  options: {
    role?: string
    poSubtotalCents?: number
  } = {}
): Promise<PayablesFixture> {
  const role = options.role ?? 'admin'
  const poSubtotalCents = options.poSubtotalCents ?? 100_000
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Payables probe', 'payables-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const actorId = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values(
         gen_random_uuid(),
         '${tenantId}',
         'payables-${suffix}@probe.test',
         'Payables Probe',
         '${role}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client, created_by)
       values(
         '${tenantId}',
         'Payables project',
         'Owner ${suffix}',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const vendorId = (
    (await tx.unsafe(
      `insert into vendors(tenant_id, name)
       values('${tenantId}', 'Vendor ${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const costCodeId = (
    (await tx.unsafe(
      `insert into cost_codes(
         tenant_id,
         code,
         name,
         category,
         created_by
       )
       values(
         '${tenantId}',
         'MAT-${suffix}',
         'Project materials',
         'material',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const purchaseOrderId = (
    (await tx.unsafe(
      `insert into purchase_orders(
         tenant_id,
         project_id,
         vendor_id,
         created_by,
         po_number,
         status,
         subtotal_cents,
         vat_cents,
         withholding_tax_cents,
         total_cents
       )
       values(
         '${tenantId}',
         '${projectId}',
         '${vendorId}',
         '${actorId}',
         'PO-${suffix}',
         'issued',
         ${poSubtotalCents},
         12000,
         2000,
         ${poSubtotalCents + 10_000}
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const purchaseOrderLineId = (
    (await tx.unsafe(
      `insert into po_line_items(
         tenant_id,
         po_id,
         sort_order,
         description,
         cost_code_id,
         quantity,
         quantity_micros,
         unit_cost_cents,
         line_total_cents
       )
       values(
         '${tenantId}',
         '${purchaseOrderId}',
         1,
         'Project materials',
         '${costCodeId}',
         1,
         1000000,
         ${poSubtotalCents},
         ${poSubtotalCents}
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

  const accounts = (await tx.unsafe(
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
         '${tenantId}', '2000', 'Accounts payable',
         'liability', 'credit', 'accounts_payable', '${actorId}'
       ),
       (
         '${tenantId}', '1130', 'Input VAT receivable',
         'asset', 'debit', 'input_vat_receivable', '${actorId}'
       ),
       (
         '${tenantId}', '2110', 'Withholding tax payable',
         'liability', 'credit', 'withholding_tax_payable', '${actorId}'
       ),
       (
         '${tenantId}', '6100', 'Project materials',
         'expense', 'debit', null, '${actorId}'
       )
     returning id, code`
  )) as Rows
  const allocationAccountId = accounts.find(
    (account) => account.code === '6100'
  )!.id as string

  const billId = (
    (await tx.unsafe(
      `insert into supplier_bills(
         tenant_id,
         purchase_order_id,
         project_id,
         vendor_id,
         vendor_bill_number,
         bill_date,
         due_date,
         subtotal_cents,
         input_vat_cents,
         withholding_tax_cents,
         total_payable_cents,
         created_by
       )
       values(
         '${tenantId}',
         '${purchaseOrderId}',
         '${projectId}',
         '${vendorId}',
         'SI-${suffix}',
         '2026-07-20',
         '2026-08-20',
         100000,
         12000,
         2000,
         110000,
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

  await tx.unsafe(
    `insert into supplier_bill_lines(
       tenant_id,
       supplier_bill_id,
       ledger_account_id,
       project_id,
       po_line_item_id,
       cost_code_id,
       line_number,
       description,
       amount_cents
     )
     values(
       '${tenantId}',
       '${billId}',
       '${allocationAccountId}',
       '${projectId}',
       '${purchaseOrderLineId}',
       '${costCodeId}',
       1,
       'Project materials',
       100000
     )`
  )

  return {
    tenantId,
    actorId,
    projectId,
    vendorId,
    purchaseOrderId,
    billId,
    allocationAccountId,
  }
}

runtimeSuite('supplier payables runtime proof', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('posts one balanced Vendor-dimensional payable journal', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      const posted = (await tx.unsafe(
        `select *
         from post_supplier_bill(
           '${fixture.billId}',
           '${fixture.actorId}',
           '2026-07-27'
         )`
      )) as Rows
      const bill = (await tx.unsafe(
        `select status, internal_number, posting_journal_entry_id
         from supplier_bills
         where id = '${fixture.billId}'`
      )) as Rows
      const lines = (await tx.unsafe(
        `select
           account.system_key,
           account.code,
           line.debit_cents,
           line.credit_cents,
           line.project_id,
           line.vendor_id
         from journal_lines line
         join ledger_accounts account
           on account.id = line.ledger_account_id
          and account.tenant_id = line.tenant_id
         where line.journal_entry_id =
           '${posted[0]!.journal_entry_id}'
         order by line.line_number`
      )) as Rows
      return { fixture, posted: posted[0], bill: bill[0], lines }
    })

    expect(result.posted?.journal_entry_number).toMatch(/^JE-2026-\d{6}$/)
    expect(result.posted?.supplier_bill_number).toMatch(/^SB-2026-\d{6}$/)
    expect(result.bill).toMatchObject({
      status: 'posted',
      internal_number: result.posted?.supplier_bill_number,
      posting_journal_entry_id: result.posted?.journal_entry_id,
    })
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.debit_cents),
        0
      )
    ).toBe(112_000)
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.credit_cents),
        0
      )
    ).toBe(112_000)
    expect(result.lines).toHaveLength(4)
    expect(
      result.lines.every(
        (line) =>
          line.project_id === result.fixture.projectId &&
          line.vendor_id === result.fixture.vendorId
      )
    ).toBe(true)
  })

  it('rejects repeated posting', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      await tx.unsafe(
        `select * from post_supplier_bill(
          '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('reverses with equal opposite Vendor dimensions', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      const posted = (await tx.unsafe(
        `select * from post_supplier_bill(
          '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
        )`
      )) as Rows
      const reversed = (await tx.unsafe(
        `select * from reverse_supplier_bill(
          '${fixture.billId}',
          '${fixture.actorId}',
          'Vendor issued corrected bill',
          '2026-07-28'
        )`
      )) as Rows
      const bill = (await tx.unsafe(
        `select status, reversal_journal_entry_id, reversal_reason
         from supplier_bills
         where id = '${fixture.billId}'`
      )) as Rows
      const totals = (await tx.unsafe(
        `select
           sum(debit_cents)::bigint as debit,
           sum(credit_cents)::bigint as credit,
           count(*) filter (
             where project_id = '${fixture.projectId}'
               and vendor_id = '${fixture.vendorId}'
           )::int as dimensional_lines
         from journal_lines
         where journal_entry_id =
           '${reversed[0]!.reversal_entry_id}'`
      )) as Rows
      return {
        posted: posted[0],
        reversed: reversed[0],
        bill: bill[0],
        totals: totals[0],
      }
    })

    expect(result.reversed?.reversal_entry_number).toMatch(
      /^JE-2026-\d{6}$/
    )
    expect(result.reversed?.reversal_entry_id).not.toBe(
      result.posted?.journal_entry_id
    )
    expect(result.bill).toMatchObject({
      status: 'reversed',
      reversal_journal_entry_id: result.reversed?.reversal_entry_id,
      reversal_reason: 'Vendor issued corrected bill',
    })
    expect(result.totals).toEqual({
      debit: '112000',
      credit: '112000',
      dimensional_lines: 4,
    })
  })

  it('rejects bypassing the supplier-bill reversal workflow', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      const posted = (await tx.unsafe(
        `select * from post_supplier_bill(
          '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
        )`
      )) as Rows
      try {
        await tx.unsafe(
          `select * from reverse_journal_entry(
            '${posted[0]!.journal_entry_id}',
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

  it('rejects posting into a closed fiscal period', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      const period = (await tx.unsafe(
        `select id from fiscal_periods
         where tenant_id = '${fixture.tenantId}'`
      )) as Rows
      await tx.unsafe(
        `select close_fiscal_period(
          '${period[0]!.id}', '${fixture.actorId}'
        )`
      )
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects a bill above the unbilled Purchase Order subtotal', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx, {
        poSubtotalCents: 90_000,
      })
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects a Vendor mismatch against the Purchase Order', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      const otherVendor = (await tx.unsafe(
        `insert into vendors(tenant_id, name)
         values('${fixture.tenantId}', 'Replacement Vendor')
         returning id`
      )) as Rows
      await tx.unsafe(
        `update purchase_orders
         set vendor_id = '${otherVendor[0]!.id}'
         where id = '${fixture.purchaseOrderId}'`
      )
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects allocation totals that differ from bill subtotal', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      await tx.unsafe(
        `update supplier_bill_lines
         set amount_cents = 90000
         where supplier_bill_id = '${fixture.billId}'`
      )
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects a missing tax control account', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      await tx.unsafe(
        `delete from ledger_accounts
         where tenant_id = '${fixture.tenantId}'
           and system_key = 'input_vat_receivable'`
      )
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('denies posting to a non-finance actor', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx, { role: 'viewer' })
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('blocks bill edits after posting', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      await tx.unsafe(
        `select * from post_supplier_bill(
          '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      try {
        await tx.unsafe(
          `update supplier_bills
           set subtotal_cents = subtotal_cents + 1
           where id = '${fixture.billId}'`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('blocks allocation edits after posting', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      await tx.unsafe(
        `select * from post_supplier_bill(
          '${fixture.billId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      try {
        await tx.unsafe(
          `update supplier_bill_lines
           set amount_cents = amount_cents + 1
           where supplier_bill_id = '${fixture.billId}'`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('rejects a duplicate Vendor bill number', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      try {
        await tx.unsafe(
          `insert into supplier_bills(
             tenant_id,
             purchase_order_id,
             project_id,
             vendor_id,
             vendor_bill_number,
             bill_date,
             subtotal_cents,
             total_payable_cents,
             created_by
           )
           select
             tenant_id,
             purchase_order_id,
             project_id,
             vendor_id,
             upper(vendor_bill_number),
             bill_date,
             subtotal_cents,
             subtotal_cents,
             created_by
           from supplier_bills
           where id = '${fixture.billId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('hides supplier-bill Cortex records from a viewer', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedPayablesFixture(tx)
      await tx.unsafe(
        `update users set role = 'viewer' where id = '${fixture.actorId}'`
      )
      await becomeAuthenticated(tx, fixture.actorId)
      const nodes = (await tx.unsafe(
        `select count(*)::int as count
         from cortex_nodes
         where node_type = 'supplier_bill'`
      )) as Rows
      return nodes[0]!.count
    })
    expect(visible).toBe(0)
  })

  it('keeps payable RPCs unavailable to authenticated', async () => {
    const grants = (await sqlClient.unsafe(
      `select
         has_function_privilege(
           'authenticated',
           'post_supplier_bill(uuid,uuid,date)',
           'EXECUTE'
         ) as post_execute,
         has_function_privilege(
           'authenticated',
           'reverse_supplier_bill(uuid,uuid,text,date)',
           'EXECUTE'
         ) as reverse_execute`
    )) as Rows

    expect(grants[0]).toEqual({
      post_execute: false,
      reverse_execute: false,
    })
  })
})
