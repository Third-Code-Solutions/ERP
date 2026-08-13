import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

import {
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

type Row = Record<string, unknown>

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260813200000_wo_17_cost_control_v1.sql'
  ),
  'utf8'
).toLowerCase()

describe('WO-17 cost control migration contract', () => {
  it('preserves PO-line to BOM-line provenance for posted actuals', () => {
    expect(migrationSql).toContain(
      'add column if not exists bom_line_item_id uuid'
    )
    expect(migrationSql).toContain(
      'supplier_bill_lines_bom_line_tenant_fk'
    )
    expect(migrationSql).toContain(
      'idx_supplier_bill_lines_bom_line'
    )
    expect(migrationSql).toContain(
      'supplier bill bom line must match purchase order line'
    )
    expect(migrationSql).toContain(
      'set bom_line_item_id = po_line.bom_line_item_id'
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

runtimeSuite('WO-17 cost control database evidence', () => {
  const sql = DATABASE_URL ? makeSql() : null

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('keeps budget, commitment, and posted actual on the same BOM line', async () => {
    expect(sql).not.toBeNull()
    const result = await inRollback(sql!, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const suffix = ((await tx.unsafe(
        `select substr(md5(random()::text), 1, 10) as suffix`
      )) as unknown as Array<{ suffix: string }>)[0]!.suffix
      const commercialId = ((await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(gen_random_uuid(), '${fixture.tenantA}', 'commercial-${suffix}@probe.test', 'Commercial', 'commercial')
         returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const financeId = ((await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(gen_random_uuid(), '${fixture.tenantA}', 'finance-${suffix}@probe.test', 'Finance', 'finance')
         returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const projectId = ((await tx.unsafe(
        `insert into projects(tenant_id, name, client, status, created_by)
         values('${fixture.tenantA}', 'WO17 cost project', 'Cost client', 'active', '${fixture.userA}')
         returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const bomId = ((await tx.unsafe(
        `insert into boms(
           tenant_id, project_id, created_by, approved_by, status,
           total_cost_cents, tcv_cents, gp_cents, gp_margin_bps, approved_at
         ) values(
           '${fixture.tenantA}', '${projectId}', '${fixture.userA}', '${fixture.userA}', 'locked',
           100000, 150000, 50000, 3333, now()
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const bomLineId = ((await tx.unsafe(
        `insert into bom_line_items(
           tenant_id, bom_id, code, description, quantity,
           unit_cost_cents, line_total_cents
         ) values(
           '${fixture.tenantA}', '${bomId}', 'MAT-01', 'Steel frame', 1,
           100000, 100000
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const secondBomLineId = ((await tx.unsafe(
        `insert into bom_line_items(
           tenant_id, bom_id, code, description, quantity,
           unit_cost_cents, line_total_cents
         ) values(
           '${fixture.tenantA}', '${bomId}', 'MAT-02', 'Wrong frame', 1,
           10000, 10000
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const costCodeId = ((await tx.unsafe(
        `insert into cost_codes(tenant_id, code, name, category, created_by)
         values('${fixture.tenantA}', 'MAT-${suffix}', 'Materials', 'material', '${fixture.userA}')
         returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const budgetId = ((await tx.unsafe(
        `insert into project_budgets(
           tenant_id, project_id, source_bom_id, revision, status,
           effective_from, revision_reason, created_by
         ) values(
           '${fixture.tenantA}', '${projectId}', '${bomId}', 1, 'draft',
           current_date, 'WO17 baseline', '${fixture.userA}'
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      await tx.unsafe(
        `insert into project_budget_lines(
           tenant_id, project_budget_id, cost_code_id, bom_line_item_id,
           line_number, description, amount_cents
         ) values(
           '${fixture.tenantA}', '${budgetId}', '${costCodeId}', '${bomLineId}',
           1, 'Steel baseline', 100000
         )`
      )
      await tx.unsafe(
        `select * from submit_project_budget('${budgetId}', '${fixture.userA}')`
      )
      await tx.unsafe(
        `select * from review_project_budget('${budgetId}', '${commercialId}', 'commercial')`
      )
      await tx.unsafe(
        `select * from review_project_budget('${budgetId}', '${financeId}', 'finance')`
      )
      const vendorId = ((await tx.unsafe(
        `insert into vendors(tenant_id, name) values('${fixture.tenantA}', 'WO17 Vendor') returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const poId = ((await tx.unsafe(
        `insert into purchase_orders(
           tenant_id, project_id, vendor_id, created_by, po_number,
           status, subtotal_cents, total_cents
         ) values(
           '${fixture.tenantA}', '${projectId}', '${vendorId}', '${fixture.userA}', 'PO-WO17-${suffix}',
           'draft', 70000, 70000
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      const poLineId = ((await tx.unsafe(
        `insert into po_line_items(
           tenant_id, po_id, description, cost_code_id, bom_line_item_id,
           quantity, unit_cost_cents, line_total_cents
         ) values(
           '${fixture.tenantA}', '${poId}', 'Steel frame', '${costCodeId}', '${bomLineId}',
           1, 70000, 70000
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      await tx.unsafe(
        `update purchase_orders set status = 'issued' where id = '${poId}'`
      )
      await tx.unsafe(
        `insert into fiscal_periods(tenant_id, name, starts_on, ends_on, created_by)
         values('${fixture.tenantA}', 'WO17 FY', '2026-01-01', '2026-12-31', '${fixture.userA}')`
      )
      const accounts = (await tx.unsafe(
        `insert into ledger_accounts(
           tenant_id, code, name, account_type, normal_balance, system_key, created_by
         ) values
           ('${fixture.tenantA}', '2000-${suffix}', 'Accounts payable', 'liability', 'credit', 'accounts_payable', '${fixture.userA}'),
           ('${fixture.tenantA}', '6100-${suffix}', 'Materials expense', 'expense', 'debit', null, '${fixture.userA}')
         returning id, account_type`
      )) as unknown as Array<{ id: string; account_type: string }>
      const expenseAccountId = accounts.find(
        (account) => account.account_type === 'expense'
      )!.id
      const billId = ((await tx.unsafe(
        `insert into supplier_bills(
           tenant_id, purchase_order_id, project_id, vendor_id,
           vendor_bill_number, bill_date, subtotal_cents, total_payable_cents,
           created_by
         ) values(
           '${fixture.tenantA}', '${poId}', '${projectId}', '${vendorId}',
           'BILL-WO17-${suffix}', current_date, 30000, 30000, '${fixture.userA}'
         ) returning id`
      )) as unknown as Array<{ id: string }>)[0]!.id
      await tx.unsafe(
        `insert into supplier_bill_lines(
           tenant_id, supplier_bill_id, ledger_account_id, project_id,
           po_line_item_id, line_number, description, amount_cents
         ) values(
           '${fixture.tenantA}', '${billId}', '${expenseAccountId}', '${projectId}',
           '${poLineId}', 1, 'Steel frame', 30000
         )`
      )
      const dimension = (await tx.unsafe(
        `select bom_line_item_id, cost_code_id
           from supplier_bill_lines
          where id = (select id from supplier_bill_lines where supplier_bill_id = '${billId}')`
      )) as Row[]

      await tx.unsafe('savepoint wo17_wrong_dimension')
      let wrongDimensionError = ''
      try {
        await tx.unsafe(
          `insert into supplier_bill_lines(
             tenant_id, supplier_bill_id, ledger_account_id, project_id,
             po_line_item_id, bom_line_item_id, line_number, description, amount_cents
           ) values(
             '${fixture.tenantA}', '${billId}', '${expenseAccountId}', '${projectId}',
             '${poLineId}', '${secondBomLineId}', 2, 'Wrong frame', 1
           )`
        )
      } catch (error) {
        wrongDimensionError = String(error)
      }
      await tx.unsafe('rollback to savepoint wo17_wrong_dimension')
      await tx.unsafe('release savepoint wo17_wrong_dimension')
      await tx.unsafe(
        `select * from post_supplier_bill('${billId}', '${financeId}', current_date)`
      )

      const totals = (await tx.unsafe(
        `with budget as (
           select sum(amount_cents)::bigint as baseline_cents
             from project_budget_lines
            where tenant_id = '${fixture.tenantA}' and project_budget_id = '${budgetId}'
              and bom_line_item_id = '${bomLineId}'
         ), commitment as (
           select sum(line.line_total_cents)::bigint as committed_cents
             from po_line_items line
             join purchase_orders po on po.id = line.po_id and po.tenant_id = line.tenant_id
            where line.tenant_id = '${fixture.tenantA}' and po.project_id = '${projectId}'
              and po.status = 'issued' and line.bom_line_item_id = '${bomLineId}'
         ), actual as (
           select sum(bill_line.amount_cents)::bigint as actual_cents
             from supplier_bill_lines bill_line
             join supplier_bills bill on bill.id = bill_line.supplier_bill_id
              and bill.tenant_id = bill_line.tenant_id
            where bill_line.tenant_id = '${fixture.tenantA}'
              and bill.status = 'posted'
              and bill_line.project_id = '${projectId}'
              and bill_line.bom_line_item_id = '${bomLineId}'
         ) select budget.baseline_cents, commitment.committed_cents, actual.actual_cents
             from budget cross join commitment cross join actual`
      )) as Row[]

      return { dimension: dimension[0], totals: totals[0], wrongDimensionError }
    })

    expect(result.dimension).toMatchObject({
      bom_line_item_id: expect.any(String),
      cost_code_id: expect.any(String),
    })
    expect(result.totals).toMatchObject({
      baseline_cents: '100000',
      committed_cents: '70000',
      actual_cents: '30000',
    })
    expect(result.wrongDimensionError).toMatch(
      /supplier bill bom line must match purchase order line/i
    )
  })
})
