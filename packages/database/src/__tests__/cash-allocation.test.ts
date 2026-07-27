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
    '../../../../supabase/migrations/20260726225000_cash_allocation_schema.sql'
  ),
  'utf8'
).toLowerCase()
const workflowSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726230000_cash_allocation_foundation.sql'
  ),
  'utf8'
).toLowerCase()
const migrationSql = `${schemaSql}\n${workflowSql}`

describe('cash allocation migration contract', () => {
  it('creates typed Cash Accounts, transactions, and allocations', () => {
    for (const table of [
      'cash_accounts',
      'cash_transactions',
      'cash_allocations',
    ]) {
      expect(migrationSql).toContain(
        `create table if not exists public.${table}`
      )
    }
    for (const type of [
      'cash_account_kind',
      'cash_transaction_direction',
      'cash_transaction_status',
      'cash_allocation_type',
    ]) {
      expect(migrationSql).toContain(`create type public.${type}`)
    }
  })

  it('binds every target and Cash Account through tenant-safe keys', () => {
    for (const constraint of [
      'cash_accounts_ledger_tenant_fk',
      'cash_transactions_cash_account_tenant_fk',
      'cash_transactions_business_account_tenant_fk',
      'cash_transactions_vendor_tenant_fk',
      'cash_allocations_invoice_tenant_fk',
      'cash_allocations_supplier_bill_tenant_fk',
    ]) {
      expect(migrationSql).toContain(`constraint ${constraint}`)
    }
  })

  it('posts balanced receipt and disbursement journals', () => {
    expect(workflowSql).toContain(
      'create or replace function public.post_cash_transaction'
    )
    expect(workflowSql).toContain("'cash received'")
    expect(workflowSql).toContain("'cash disbursed'")
    expect(workflowSql).toContain(
      'from public.post_journal_entry(v_journal_id, p_actor_id)'
    )
  })

  it('prevents partial and excessive allocation evidence', () => {
    expect(workflowSql).toContain(
      'cash allocations must equal transaction amount'
    )
    expect(workflowSql).toContain(
      'receipt allocation exceeds open invoice component'
    )
    expect(workflowSql).toContain(
      'disbursement allocation exceeds open supplier bill'
    )
    expect(workflowSql).toMatch(
      /from public\.invoices invoice[\s\S]*?order by invoice\.id[\s\S]*?for update/
    )
    expect(workflowSql).toMatch(
      /from public\.supplier_bills bill[\s\S]*?order by bill\.id[\s\S]*?for update/
    )
  })

  it('makes allocation evidence immutable and workflow-owned', () => {
    expect(workflowSql).toContain('posted cash transaction terms are immutable')
    expect(workflowSql).toContain('posted cash allocations are immutable')
    expect(workflowSql).toContain(
      'create or replace function public.reverse_cash_transaction'
    )
    expect(workflowSql).toContain('use the cash transaction reversal workflow')
  })

  it('blocks source-document reversal while active cash exists', () => {
    expect(workflowSql).toContain(
      'reverse allocated customer receipts first'
    )
    expect(workflowSql).toContain(
      'reverse allocated vendor disbursements first'
    )
  })

  it('protects, audits, and mirrors finance-sensitive cash records', () => {
    expect(workflowSql).toContain('create policy cash_accounts_finance_read')
    expect(workflowSql).toContain(
      'create policy cash_transactions_finance_insert'
    )
    expect(workflowSql).toContain(
      'create policy cash_allocations_finance_insert'
    )
    expect(workflowSql).toContain('create trigger audit_cash_transactions')
    expect(workflowSql).toContain(
      'create or replace function public.cortex_mirror_cash'
    )
    expect(workflowSql).toMatch(
      /revoke execute on function public\.post_cash_transaction\(uuid, uuid, date\)[\s\S]*?from public, anon, authenticated/
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_CASH_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface CashFixture {
  tenantId: string
  actorId: string
  businessAccountId: string
  projectId: string
  vendorId: string
  invoiceId: string
  supplierBillId: string
  cashAccountId: string
}

async function seedCashFixture(
  tx: postgres.TransactionSql
): Promise<CashFixture> {
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Cash probe', 'cash-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const actorId = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values(
         gen_random_uuid(),
         '${tenantId}',
         'cash-${suffix}@probe.test',
         'Cash Probe',
         'admin'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const businessAccountId = (
    (await tx.unsafe(
      `insert into accounts(tenant_id, name, created_by)
       values('${tenantId}', 'Customer ${suffix}', '${actorId}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const projectId = (
    (await tx.unsafe(
      `insert into projects(
         tenant_id, account_id, name, client, created_by
       )
       values(
         '${tenantId}',
         '${businessAccountId}',
         'Cash project',
         'Customer ${suffix}',
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

  await tx.unsafe(
    `insert into fiscal_periods(
       tenant_id, name, starts_on, ends_on, created_by
     )
     values(
       '${tenantId}',
       'FY 2026',
       '2026-01-01',
       '2026-12-31',
       '${actorId}'
     )`
  )

  const ledger = (await tx.unsafe(
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
       ('${tenantId}', '1000', 'Cash', 'asset', 'debit', 'cash', '${actorId}'),
       ('${tenantId}', '1100', 'Accounts receivable', 'asset', 'debit', 'accounts_receivable', '${actorId}'),
       ('${tenantId}', '1110', 'Retention receivable', 'asset', 'debit', 'retention_receivable', '${actorId}'),
       ('${tenantId}', '1120', 'Withholding receivable', 'asset', 'debit', 'withholding_tax_receivable', '${actorId}'),
       ('${tenantId}', '1130', 'Input VAT', 'asset', 'debit', 'input_vat_receivable', '${actorId}'),
       ('${tenantId}', '2000', 'Accounts payable', 'liability', 'credit', 'accounts_payable', '${actorId}'),
       ('${tenantId}', '2100', 'Output VAT', 'liability', 'credit', 'output_vat_payable', '${actorId}'),
       ('${tenantId}', '2110', 'Withholding payable', 'liability', 'credit', 'withholding_tax_payable', '${actorId}'),
       ('${tenantId}', '4000', 'Revenue', 'income', 'credit', 'revenue', '${actorId}'),
       ('${tenantId}', '6100', 'Project materials', 'expense', 'debit', null, '${actorId}')
     returning id, code`
  )) as Rows
  const cashLedgerId = ledger.find((row) => row.code === '1000')!.id as string
  const expenseLedgerId = ledger.find((row) => row.code === '6100')!.id as string

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
         '${cashLedgerId}',
         'Operating cash',
         'bank',
         '${actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

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
         '${businessAccountId}',
         '${actorId}',
         'INV-${suffix}',
         2500,
         1000,
         100000,
         10000,
         10800,
         1800,
         99000,
         '2099-08-15'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `select * from issue_customer_invoice(
      '${invoiceId}', '${actorId}', '2026-07-20'
    )`
  )

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
         100000,
         12000,
         2000,
         110000
       )
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
         100000,
         100000
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const supplierBillId = (
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
       '${supplierBillId}',
       '${expenseLedgerId}',
       '${projectId}',
       '${purchaseOrderLineId}',
       '${costCodeId}',
       1,
       'Project materials',
       100000
     )`
  )
  await tx.unsafe(
    `select * from post_supplier_bill(
      '${supplierBillId}', '${actorId}', '2026-07-20'
    )`
  )

  return {
    tenantId,
    actorId,
    businessAccountId,
    projectId,
    vendorId,
    invoiceId,
    supplierBillId,
    cashAccountId,
  }
}

async function createCashDraft(
  tx: postgres.TransactionSql,
  fixture: CashFixture,
  options: {
    direction?: 'receipt' | 'disbursement'
    amountCents?: number
    allocationAmountCents?: number
    allocationType?:
      | 'customer_current_due'
      | 'customer_retention'
      | 'supplier_bill'
    targetId?: string
    counterpartyId?: string
  } = {}
): Promise<string> {
  const direction = options.direction ?? 'receipt'
  const amountCents = options.amountCents ?? 50_000
  const allocationAmountCents = options.allocationAmountCents ?? amountCents
  const allocationType =
    options.allocationType ??
    (direction === 'receipt' ? 'customer_current_due' : 'supplier_bill')
  const targetId =
    options.targetId ??
    (direction === 'receipt' ? fixture.invoiceId : fixture.supplierBillId)
  const counterpartyId =
    options.counterpartyId ??
    (direction === 'receipt'
      ? fixture.businessAccountId
      : fixture.vendorId)
  const transactionId = (
    (await tx.unsafe(
      `insert into cash_transactions(
         tenant_id,
         cash_account_id,
         direction,
         business_account_id,
         vendor_id,
         reference_number,
         transaction_date,
         amount_cents,
         created_by
       )
       values(
         '${fixture.tenantId}',
         '${fixture.cashAccountId}',
         '${direction}',
         ${direction === 'receipt' ? `'${counterpartyId}'` : 'null'},
         ${direction === 'disbursement' ? `'${counterpartyId}'` : 'null'},
         'REF-' || substr(md5(random()::text), 1, 12),
         '2026-07-27',
         ${amountCents},
         '${fixture.actorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

  await tx.unsafe(
    `insert into cash_allocations(
       tenant_id,
       cash_transaction_id,
       allocation_type,
       invoice_id,
       supplier_bill_id,
       line_number,
       amount_cents
     )
     values(
       '${fixture.tenantId}',
       '${transactionId}',
       '${allocationType}',
       ${allocationType === 'supplier_bill' ? 'null' : `'${targetId}'`},
       ${allocationType === 'supplier_bill' ? `'${targetId}'` : 'null'},
       1,
       ${allocationAmountCents}
     )`
  )

  return transactionId
}

runtimeSuite('cash allocation runtime proof', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('posts a balanced Customer-dimensional receipt and derives partial status', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      const posted = (await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )) as Rows
      const lines = (await tx.unsafe(
        `select
           account.system_key,
           line.debit_cents,
           line.credit_cents,
           line.business_account_id
         from journal_lines line
         join ledger_accounts account
           on account.id = line.ledger_account_id
          and account.tenant_id = line.tenant_id
         where line.journal_entry_id =
           '${posted[0]!.journal_entry_id}'
         order by line.line_number`
      )) as Rows
      const invoice = (await tx.unsafe(
        `select status from invoices where id = '${fixture.invoiceId}'`
      )) as Rows
      return { fixture, posted: posted[0], lines, invoice: invoice[0] }
    })

    expect(result.posted?.cash_transaction_number).toMatch(
      /^CT-2026-\d{6}$/
    )
    expect(result.invoice?.status).toBe('partial_payment')
    expect(result.lines).toHaveLength(2)
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.debit_cents),
        0
      )
    ).toBe(50_000)
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.credit_cents),
        0
      )
    ).toBe(50_000)
    expect(
      result.lines.every(
        (line) =>
          line.business_account_id === result.fixture.businessAccountId
      )
    ).toBe(true)
  })

  it('derives paid only after current and retention components are settled', async () => {
    const invoice = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture, {
        amountCents: 109_000,
        allocationAmountCents: 99_000,
      })
      await tx.unsafe(
        `insert into cash_allocations(
           tenant_id,
           cash_transaction_id,
           allocation_type,
           invoice_id,
           line_number,
           amount_cents
         )
         values(
           '${fixture.tenantId}',
           '${transactionId}',
           'customer_retention',
           '${fixture.invoiceId}',
           2,
           10000
         )`
      )
      await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      return (
        (await tx.unsafe(
          `select status, paid_at is not null as has_paid_at
           from invoices where id = '${fixture.invoiceId}'`
        )) as Rows
      )[0]
    })

    expect(invoice).toEqual({ status: 'paid', has_paid_at: true })
  })

  it('posts a balanced Vendor-dimensional disbursement', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture, {
        direction: 'disbursement',
        amountCents: 110_000,
      })
      const posted = (await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )) as Rows
      const lines = (await tx.unsafe(
        `select debit_cents, credit_cents, vendor_id
         from journal_lines
         where journal_entry_id = '${posted[0]!.journal_entry_id}'`
      )) as Rows
      return { fixture, lines }
    })

    expect(result.lines).toHaveLength(2)
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.debit_cents),
        0
      )
    ).toBe(110_000)
    expect(
      result.lines.reduce(
        (sum, line) => sum + Number(line.credit_cents),
        0
      )
    ).toBe(110_000)
    expect(
      result.lines.every(
        (line) => line.vendor_id === result.fixture.vendorId
      )
    ).toBe(true)
  })

  it('rejects allocations that do not equal the cash amount', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture, {
        amountCents: 50_000,
        allocationAmountCents: 49_999,
      })
      try {
        await tx.unsafe(
          `select * from post_cash_transaction(
            '${transactionId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('rejects a receipt counterparty mismatch', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const otherAccount = (await tx.unsafe(
        `insert into accounts(tenant_id, name, created_by)
         values('${fixture.tenantId}', 'Other Customer', '${fixture.actorId}')
         returning id`
      )) as Rows
      const transactionId = await createCashDraft(tx, fixture, {
        counterpartyId: otherAccount[0]!.id as string,
      })
      try {
        await tx.unsafe(
          `select * from post_cash_transaction(
            '${transactionId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('rejects over-allocation of an invoice component', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture, {
        amountCents: 99_001,
      })
      try {
        await tx.unsafe(
          `select * from post_cash_transaction(
            '${transactionId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('rejects posting without an active Cash Account', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      await tx.unsafe(
        `update cash_accounts set is_active = false
         where id = '${fixture.cashAccountId}'`
      )
      try {
        await tx.unsafe(
          `select * from post_cash_transaction(
            '${transactionId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('rejects posting into a closed fiscal period', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
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
          `select * from post_cash_transaction(
            '${transactionId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('denies posting to a non-finance actor', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      await tx.unsafe(
        `update users set role = 'viewer' where id = '${fixture.actorId}'`
      )
      try {
        await tx.unsafe(
          `select * from post_cash_transaction(
            '${transactionId}', '${fixture.actorId}', '2026-07-27'
          )`
        )
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('blocks cash transaction and allocation edits after posting', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      let parentBlocked = false
      let allocationBlocked = false
      await tx.unsafe('savepoint cash_parent_edit')
      try {
        await tx.unsafe(
          `update cash_transactions
           set amount_cents = amount_cents + 1
           where id = '${transactionId}'`
        )
      } catch {
        parentBlocked = true
        await tx.unsafe('rollback to savepoint cash_parent_edit')
      }
      await tx.unsafe('release savepoint cash_parent_edit')
      await tx.unsafe('savepoint cash_allocation_edit')
      try {
        await tx.unsafe(
          `update cash_allocations
           set amount_cents = amount_cents + 1
           where cash_transaction_id = '${transactionId}'`
        )
      } catch {
        allocationBlocked = true
        await tx.unsafe('rollback to savepoint cash_allocation_edit')
      }
      await tx.unsafe('release savepoint cash_allocation_edit')
      return parentBlocked && allocationBlocked
    })
    expect(rejected).toBe(true)
  })

  it('blocks generic journal reversal bypass', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      const posted = (await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
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
      } catch {
        return true
      }
      return false
    })
    expect(rejected).toBe(true)
  })

  it('reversal removes active receipt evidence and restores invoice state', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      await tx.unsafe(
        `select * from reverse_cash_transaction(
          '${transactionId}',
          '${fixture.actorId}',
          'Returned customer deposit',
          '2026-07-28'
        )`
      )
      const invoice = (await tx.unsafe(
        `select status, paid_at from invoices
         where id = '${fixture.invoiceId}'`
      )) as Rows
      const active = (await tx.unsafe(
        `select coalesce(sum(allocation.amount_cents), 0)::bigint as amount
         from cash_allocations allocation
         join cash_transactions cash_tx
           on cash_tx.id = allocation.cash_transaction_id
          and cash_tx.tenant_id = allocation.tenant_id
         where allocation.invoice_id = '${fixture.invoiceId}'
           and cash_tx.status = 'posted'`
      )) as Rows
      return { invoice: invoice[0], active: active[0] }
    })
    expect(result.invoice).toEqual({ status: 'issued', paid_at: null })
    expect(result.active?.amount).toBe('0')
  })

  it('requires cash reversal before customer invoice reversal', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      let blocked = false
      await tx.unsafe('savepoint invoice_reverse_attempt')
      try {
        await tx.unsafe(
          `select * from reverse_customer_invoice(
            '${fixture.invoiceId}',
            '${fixture.actorId}',
            'Customer correction',
            '2026-07-28'
          )`
        )
      } catch {
        blocked = true
        await tx.unsafe('rollback to savepoint invoice_reverse_attempt')
      }
      await tx.unsafe('release savepoint invoice_reverse_attempt')
      await tx.unsafe(
        `select * from reverse_cash_transaction(
          '${transactionId}',
          '${fixture.actorId}',
          'Unwind receipt first',
          '2026-07-28'
        )`
      )
      const reversed = (await tx.unsafe(
        `select * from reverse_customer_invoice(
          '${fixture.invoiceId}',
          '${fixture.actorId}',
          'Customer correction',
          '2026-07-28'
        )`
      )) as Rows
      return { blocked, reversed: reversed[0] }
    })
    expect(result.blocked).toBe(true)
    expect(result.reversed?.reversal_entry_id).toBeTruthy()
  })

  it('requires disbursement reversal before Supplier Bill reversal', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture, {
        direction: 'disbursement',
        amountCents: 110_000,
      })
      await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      let blocked = false
      try {
        await tx.unsafe(
          `select * from reverse_supplier_bill(
            '${fixture.supplierBillId}',
            '${fixture.actorId}',
            'Vendor correction',
            '2026-07-28'
          )`
        )
      } catch {
        blocked = true
      }
      return blocked
    })
    expect(result).toBe(true)
  })

  it('hides cash Cortex records from a viewer', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedCashFixture(tx)
      const transactionId = await createCashDraft(tx, fixture)
      await tx.unsafe(
        `select * from post_cash_transaction(
          '${transactionId}', '${fixture.actorId}', '2026-07-27'
        )`
      )
      await tx.unsafe(
        `update users set role = 'viewer' where id = '${fixture.actorId}'`
      )
      await becomeAuthenticated(tx, fixture.actorId)
      const nodes = (await tx.unsafe(
        `select count(*)::int as count
         from cortex_nodes
         where node_type in ('cash_account', 'cash_transaction')`
      )) as Rows
      return nodes[0]!.count
    })
    expect(visible).toBe(0)
  })

  it('keeps cash RPCs unavailable to authenticated', async () => {
    const grants = (await sqlClient.unsafe(
      `select
         has_function_privilege(
           'authenticated',
           'post_cash_transaction(uuid,uuid,date)',
           'EXECUTE'
         ) as post_execute,
         has_function_privilege(
           'authenticated',
           'reverse_cash_transaction(uuid,uuid,text,date)',
           'EXECUTE'
         ) as reverse_execute`
    )) as Rows

    expect(grants[0]).toEqual({
      post_execute: false,
      reverse_execute: false,
    })
  })
})
