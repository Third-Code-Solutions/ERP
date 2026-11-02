import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allocateBomInvoice, computeDupa } from '@third-code-erp/shared-types/bom'
import { becomeAuthenticated, inRollback, seedTwoTenants } from './_db-harness'

const suite = process.env.DATABASE_HARDENING_EXPECTED === '1' ? describe : describe.skip

async function fixture(tx: postgres.TransactionSql) {
  const tenants = await seedTwoTenants(tx)
  await tx`update tenants set legal_name='Synthetic exact pricing company',registered_address='Synthetic test address',bir_tin='TEST-ONLY-TIN' where id=${tenants.tenantA}`
  const [project] = await tx<{ id: string }[]>`insert into projects(tenant_id,name,client,status,created_by)
    values(${tenants.tenantA},'Exact pricing proof','Synthetic client','active',${tenants.userA}) returning id`
  const [bom] = await tx<{ id: string }[]>`insert into boms(tenant_id,project_id,created_by)
    values(${tenants.tenantA},${project!.id},${tenants.userA}) returning id`
  const [line] = await tx<{ id: string }[]>`insert into bom_line_items(tenant_id,bom_id,description,kind,classification_status,quantity,unit_cost_cents)
    values(${tenants.tenantA},${bom!.id},'Work item','work_item','classified',0.1,10000) returning id`
  const [dupa] = await tx<{ id: string }[]>`insert into dupas(tenant_id,bom_line_item_id,header_quantity,uom,created_by)
    values(${tenants.tenantA},${line!.id},1,'cu.m',${tenants.userA}) returning id`
  const [material] = await tx<{ id: string }[]>`insert into dupa_material_lines(tenant_id,dupa_id,description,quantity,uom,unit_rate_centavos,rate_source)
    values(${tenants.tenantA},${dupa!.id},'Material',1,'cu.m',10000,'manual') returning id`
  return { ...tenants, projectId: project!.id, bomId: bom!.id, lineId: line!.id, dupaId: dupa!.id, materialId: material!.id }
}

async function denied(tx: postgres.TransactionSql, statement: string, values: string[]) {
  await tx.unsafe('savepoint denied_write')
  try { await tx.unsafe(statement, values); return undefined }
  catch (error) { if (error instanceof postgres.PostgresError) return error.code; throw error }
  finally { await tx.unsafe('rollback to savepoint denied_write'); await tx.unsafe('release savepoint denied_write') }
}

suite('ADR-041 exact draft BOM snapshots', () => {
  let sql: postgres.Sql
  beforeAll(() => {
    const url = process.env.DATABASE_URL
    if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Explicit disposable loopback database required')
    sql = postgres(url, { max: 3, prepare: false, onnotice: () => {} })
  })
  afterAll(async () => { await sql?.end() })

  it('updates fractional line and parent atomically with separate cost, selling, VAT and positive margin', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      const [before] = await tx`select quantity::text,unit_cost_cents::text,direct_cost_cents::text,selling_ex_vat_cents::text,vat_cents::text,line_total_cents::text from bom_line_items where id=${f.lineId}`
      expect(before).toMatchObject({ quantity: '0.1', unit_cost_cents: '10000', direct_cost_cents: '1000', selling_ex_vat_cents: '1150', vat_cents: '120', line_total_cents: '1270' })
      await tx`update dupa_material_lines set unit_rate_centavos=20000 where id=${f.materialId}`
      const [parent] = await tx`select total_cost_cents::text,selling_ex_vat_cents::text,vat_cents::text,tcv_cents::text,gp_cents::text,pricing_basis from boms where id=${f.bomId}`
      expect(parent).toEqual({ total_cost_cents: '2000', selling_ex_vat_cents: '2300', vat_cents: '240', tcv_cents: '2540', gp_cents: '300', pricing_basis: 'reconciled_v1' })
      const invoice = allocateBomInvoice({ pricingBasis: 'reconciled_v1', sellingExVatCents: 2300, vatCents: 240, billingPercentBps: 10000, retentionBps: 1000, withholdingBps: 200 })
      expect(invoice).toEqual({ subtotalCents: 2300, vatCents: 240, retentionCents: 230, withholdingTaxCents: 46, netAmountCents: 2264 })
      expect(invoice.netAmountCents + invoice.retentionCents + invoice.withholdingTaxCents).toBe(invoice.subtotalCents + invoice.vatCents)
      await tx`update bom_line_items set quantity=12.5 where id=${f.lineId}`
      expect(await tx`select tcv_cents::text from boms where id=${f.bomId}`).toEqual([{ tcv_cents: '317500' }])
    })
  })

  it('combines manual exclusive and DUPA inclusive lines without double-counting attached children', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      await tx`insert into bom_line_items(tenant_id,bom_id,description,quantity,unit_cost_cents,manual_vat_bps)
        values(${f.tenantA},${f.bomId},'Manual',12.5,100,1200)`
      await tx`insert into bom_line_items(tenant_id,bom_id,description,kind,parent_line_item_id,quantity,unit_cost_cents)
        values(${f.tenantA},${f.bomId},'Attached child','material_line',${f.lineId},1,500)`
      expect(await tx`select total_cost_cents::text,selling_ex_vat_cents::text,vat_cents::text,tcv_cents::text,gp_cents::text from boms where id=${f.bomId}`)
        .toEqual([{ total_cost_cents: '2250', selling_ex_vat_cents: '2400', vat_cents: '270', tcv_cents: '2670', gp_cents: '150' }])
      expect(await denied(tx, 'update bom_line_items set quantity=0.12345 where id=$1', [f.lineId])).toBe('23514')
    })
  })

  it('preserves approved values and rolls back failed pricing changes', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      await tx.unsafe('savepoint price_change')
      await tx`update dupa_material_lines set unit_rate_centavos=20000 where id=${f.materialId}`
      await tx.unsafe('rollback to savepoint price_change')
      expect(await tx`select tcv_cents::text from boms where id=${f.bomId}`).toEqual([{ tcv_cents: '1270' }])
      await tx`update boms set status='approved' where id=${f.bomId}`
      expect(await denied(tx, 'update boms set status=\'draft\' where id=$1', [f.bomId])).toBe('23514')
      expect(await denied(tx, 'update dupa_material_lines set unit_rate_centavos=90000 where id=$1', [f.materialId])).toBe('23514')
      expect(await denied(tx, 'update boms set tcv_cents=1 where id=$1', [f.bomId])).toBe('23514')
      expect(await tx`select tcv_cents::text from boms where id=${f.bomId}`).toEqual([{ tcv_cents: '1270' }])
      await becomeAuthenticated(tx, f.userB)
      expect(await tx`select id from bom_line_items where id=${f.lineId}`).toHaveLength(0)
      await tx.unsafe('reset role')
    })
  })

  it('denies direct Viewer approval, reopening and draft pricing writes', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      await tx`update users set role='viewer' where id=${f.userA}`
      await becomeAuthenticated(tx, f.userA)
      expect(await denied(tx, 'update boms set status=\'approved\' where id=$1', [f.bomId])).toBe('42501')
      expect(await denied(tx, 'update dupa_material_lines set unit_rate_centavos=90000 where id=$1', [f.materialId])).toBe('42501')
      await tx.unsafe('reset role')
      await tx`update boms set status='locked' where id=${f.bomId}`
      await becomeAuthenticated(tx, f.userA)
      expect(await denied(tx, 'update boms set status=\'draft\' where id=$1', [f.bomId])).toBe('42501')
      expect(await tx`select tcv_cents::text from boms where id=${f.bomId}`).toEqual([{ tcv_cents: '1270' }])
    })
  })

  it('matches the published source-precision DUPA computation for 0.1 cu.m', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      await tx`update dupas set header_quantity=0.1 where id=${f.dupaId}`
      await tx`update dupa_material_lines set unit_rate_centavos=595100 where id=${f.materialId}`
      for (const [count, rate] of [[1,27202],[1,19909],[2,17379]]) {
        await tx`insert into dupa_labour_lines(tenant_id,dupa_id,description,no_of_persons,hourly_rate_centavos,productivity_per_hour)
          values(${f.tenantA},${f.dupaId},'Crew',${count!},${rate!},1)`
      }
      await tx`insert into dupa_equipment_lines(tenant_id,dupa_id,description,no_of_units,hourly_rate_centavos,productivity_per_hour)
        values(${f.tenantA},${f.dupaId},'Mixer',1,60000,0.1)`
      const expected = computeDupa({ headerQuantity: '0.1', materials: [{ quantity: '1', unitRateCentavos: 595100n }], labour: [
        { noOfPersons: '1', hourlyRateCentavos: 27202n, productivityPerHour: '1' },
        { noOfPersons: '1', hourlyRateCentavos: 19909n, productivityPerHour: '1' },
        { noOfPersons: '2', hourlyRateCentavos: 17379n, productivityPerHour: '1' },
      ], equipment: [{ noOfUnits: '1', hourlyRateCentavos: 60000n, productivityPerHour: '0.1' }] })
      expect(await tx`select unit_rate_centavos::text from dupas where id=${f.dupaId}`).toEqual([{ unit_rate_centavos: expected.unitRateCentavos.toString() }])
      expect(await tx`select tcv_cents::text from boms where id=${f.bomId}`).toEqual([{ tcv_cents: '1621751' }])
    })
  })

  it('rejects orphaning a priced analysis but permits draft line deletion and recalculates the parent', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      expect(await denied(tx, 'delete from dupas where id=$1', [f.dupaId])).toBe('23514')
      await tx`delete from bom_line_items where id=${f.lineId}`
      expect(await tx`select id from dupas where id=${f.dupaId}`).toHaveLength(0)
      expect(await tx`select tcv_cents::text from boms where id=${f.bomId}`).toEqual([{ tcv_cents: '0' }])
      const [invoice] = await tx<{ id: string }[]>`insert into invoices(tenant_id,project_id,created_by,invoice_number)
        values(${f.tenantA},${f.projectId},${f.userA},'LEGACY-UNREVIEWED') returning id`
      expect(await denied(tx, 'update invoices set status=\'issued\' where id=$1', [invoice!.id])).toBe('23514')
    })
  })

  it('issues a balanced journal from the same selling/VAT allocation and freezes its new snapshots', async () => {
    await inRollback(sql, async tx => {
      const f = await fixture(tx)
      const [account] = await tx<{ id: string }[]>`insert into accounts(tenant_id,name,created_by) values(${f.tenantA},'Synthetic customer',${f.userA}) returning id`
      await tx`update projects set account_id=${account!.id} where id=${f.projectId}`
      await tx`update boms set status='approved' where id=${f.bomId}`
      await tx`insert into fiscal_periods(tenant_id,name,starts_on,ends_on,created_by) values(${f.tenantA},'Proof FY2026','2026-01-01','2026-12-31',${f.userA})`
      for (const [code,key,type,balance] of [
        ['1100','accounts_receivable','asset','debit'], ['1110','retention_receivable','asset','debit'],
        ['1120','withholding_tax_receivable','asset','debit'], ['2100','output_vat_payable','liability','credit'], ['4000','revenue','income','credit'],
      ]) {
        await tx`insert into ledger_accounts(tenant_id,code,name,account_type,normal_balance,system_key,created_by)
          values(${f.tenantA},${code!},${key!},${type!},${balance!},${key!},${f.userA})`
      }
      const amount = allocateBomInvoice({ pricingBasis: 'reconciled_v1', sellingExVatCents: 1150, vatCents: 120, billingPercentBps: 10000, retentionBps: 1000, withholdingBps: 200 })
      const [invoice] = await tx<{ id: string }[]>`insert into invoices(tenant_id,project_id,account_id,created_by,invoice_number,pricing_basis,source_bom_id,billing_percent_bps,retention_bps,withholding_bps,subtotal_cents,retention_cents,vat_cents,withholding_tax_cents,net_amount_cents)
        values(${f.tenantA},${f.projectId},${account!.id},${f.userA},'EXACT-PROOF','reconciled_v1',${f.bomId},10000,1000,200,${amount.subtotalCents},${amount.retentionCents},${amount.vatCents},${amount.withholdingTaxCents},${amount.netAmountCents}) returning id`
      const [issued] = await tx<{ journal_entry_id: string }[]>`select * from issue_customer_invoice(${invoice!.id},${f.userA},'2026-10-11')`
      expect(await tx`select sum(debit_cents)::text as debits,sum(credit_cents)::text as credits from journal_lines where journal_entry_id=${issued!.journal_entry_id}`)
        .toEqual([{ debits: '1270', credits: '1270' }])
      expect(await denied(tx, 'update invoices set withholding_bps=0 where id=$1', [invoice!.id])).toBe('23514')
    })
  })

  it('serializes concurrent material edits into a complete parent snapshot', async () => {
    // This one fixture must be visible to independent connections. It is synthetic
    // and remains only in the explicitly disposable loopback database.
    const f = await sql.begin(async tx => fixture(tx as postgres.TransactionSql))
    const [other] = await sql<{ id: string }[]>`insert into dupa_material_lines(tenant_id,dupa_id,description,quantity,uom,unit_rate_centavos,rate_source)
      values(${f.tenantA},${f.dupaId},'Second material',1,'cu.m',10000,'manual') returning id`
    await Promise.all([
      sql.begin(async tx => { await tx`update dupa_material_lines set unit_rate_centavos=20000 where id=${f.materialId}` }),
      sql.begin(async tx => { await tx`update dupa_material_lines set unit_rate_centavos=30000 where id=${other!.id}` }),
    ])
    expect(await sql`select total_cost_cents::text,tcv_cents::text,gp_cents::text from boms where id=${f.bomId}`)
      .toEqual([{ total_cost_cents: '5000', tcv_cents: '6350', gp_cents: '750' }])
  })

  it.each([1, 2])('locks all %i affected BOMs before shared crew refresh acquires the audit lock', async (bomCount) => {
    const f = await sql.begin(async tx => fixture(tx as postgres.TransactionSql))
    const [crew] = await sql<{ id: string }[]>`insert into crew_roles(tenant_id,name,hourly_rate_centavos,effective_from,created_by)
      values(${f.tenantA},'Exact crew',10000,'2026-01-01',${f.userA}) returning id`
    const dupaIds = [f.dupaId]
    if (bomCount === 2) {
      const secondDupaId = await sql.begin(async tx => {
        const [bom] = await tx<{ id: string }[]>`insert into boms(tenant_id,project_id,version,created_by)
          values(${f.tenantA},${f.projectId},2,${f.userA}) returning id`
        const [line] = await tx<{ id: string }[]>`insert into bom_line_items(tenant_id,bom_id,description,kind,classification_status,quantity,unit_cost_cents)
          values(${f.tenantA},${bom!.id},'Second work item','work_item','classified',0.1,10000) returning id`
        const [dupa] = await tx<{ id: string }[]>`insert into dupas(tenant_id,bom_line_item_id,header_quantity,uom,created_by)
          values(${f.tenantA},${line!.id},1,'cu.m',${f.userA}) returning id`
        await tx`insert into dupa_material_lines(tenant_id,dupa_id,description,quantity,uom,unit_rate_centavos,rate_source)
          values(${f.tenantA},${dupa!.id},'Material',1,'cu.m',10000,'manual')`
        return dupa!.id
      })
      dupaIds.push(secondDupaId)
    }
    for (const dupaId of dupaIds) {
      await sql`insert into dupa_labour_lines(tenant_id,dupa_id,crew_role_id,description,no_of_persons,hourly_rate_centavos,productivity_per_hour)
        values(${f.tenantA},${dupaId},${crew!.id},'Crew',1,10000,1)`
    }
    const affected = await sql<{ bom_id: string; labour_id: string }[]>`select line.bom_id,labour.id as labour_id
      from dupa_labour_lines labour join dupas dupa on dupa.id=labour.dupa_id
      join bom_line_items line on line.id=dupa.bom_line_item_id
      where labour.crew_role_id=${crew!.id} order by line.bom_id`
    // Hold the last parent: refreshing an earlier parent must not take the audit
    // lock before the refresh has acquired this parent's lock too.
    const edited = affected[affected.length - 1]!
    let refresh: Promise<PromiseSettledResult<void>[]> | undefined
    try {
      await sql.begin(async editor => {
        const [editorConnection] = await editor<{ pid: number }[]>`select pg_backend_pid() as pid`
        await editor`select id from boms where id=${edited.bom_id} for update`
        let reportRefreshPid!: (pid: number) => void
        const refreshPid = new Promise<number>(resolve => { reportRefreshPid = resolve })
        refresh = Promise.allSettled([sql.begin(async writer => {
          const [connection] = await writer<{ pid: number }[]>`select pg_backend_pid() as pid`
          reportRefreshPid(connection!.pid)
          await writer`update crew_roles set hourly_rate_centavos=20000 where id=${crew!.id}`
        })])
        const writerPid = await refreshPid
        await expect.poll(async () => {
          const [state] = await sql<{ blocked: boolean }[]>`select ${editorConnection!.pid} = any(pg_blocking_pids(${writerPid})) as blocked`
          return state!.blocked
        }, { timeout: 5000, interval: 10 }).toBe(true)
        await editor`update dupa_labour_lines set no_of_persons=2 where id=${edited.labour_id}`
      })
    } finally {
      const results = await refresh
      if (results?.[0]?.status === 'rejected') throw results[0].reason
    }
    for (const parent of affected) {
      expect(await sql`select total_cost_cents::text,tcv_cents::text from boms where id=${parent.bom_id}`)
        .toEqual([parent.bom_id === edited.bom_id
          ? { total_cost_cents: '5000', tcv_cents: '6350' }
          : { total_cost_cents: '3000', tcv_cents: '3810' }])
    }
    await sql`update boms set status='approved' where id=${edited.bom_id}`
    await sql`update crew_roles set hourly_rate_centavos=30000 where id=${crew!.id}`
    expect(await sql`select tcv_cents::text from boms where id=${edited.bom_id}`).toEqual([{ tcv_cents: '6350' }])
  })
})
