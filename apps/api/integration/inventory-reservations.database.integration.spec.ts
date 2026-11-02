import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { RoadmapService } from '../src/roadmap/roadmap.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
if (enabled) {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !(/^\/(?:erp_(?:turnover_audit|self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/.test(target.pathname) ||
      (process.env.GITHUB_ACTIONS === 'true' && target.port === '54322' && target.pathname === '/postgres'))) {
    throw new Error('Reservation tests require an explicitly enabled loopback disposable database')
  }
}

describe.skipIf(!enabled)('reserved inventory and ordinary posting', () => {
  const service = new RoadmapService(new ConfigService({ ERP_ROADMAP_STOCK_RESERVATIONS_ENABLED: 'true' }), new DatabaseService(), new AuditService())
  let principal: ErpPrincipal
  let warehouseId: string
  let materialItemId: string
  let uomId: string
  let projectId: string
  let costCodeId: string
  let procurementId: string

  beforeEach(async () => {
    principal = { tenantId: randomUUID(), userId: randomUUID(), role: 'finance', email: 'fixture@example.invalid' }
    warehouseId = randomUUID(); materialItemId = randomUUID(); uomId = randomUUID(); projectId = randomUUID(); costCodeId = randomUUID(); procurementId = randomUUID()
    const { tenantId, userId } = principal
    await db.execute(sql`insert into tenants(id,name,slug) values(${tenantId},'Reservation fixture',${`reserved-${tenantId}`})`)
    await db.execute(sql`insert into users(id,tenant_id,email,full_name,role) values
      (${userId},${tenantId},${`${userId}@example.invalid`},'Fixture finance','finance'),
      (${procurementId},${tenantId},${`${procurementId}@example.invalid`},'Fixture procurement','procurement')`)
    await db.execute(sql`insert into projects(id,tenant_id,name,client,created_by) values(${projectId},${tenantId},'Stock fixture','Synthetic company',${userId})`)
    await db.execute(sql`insert into fiscal_periods(tenant_id,name,starts_on,ends_on,created_by) values(${tenantId},'Fixture period',current_date-365,current_date+365,${userId})`)
    await db.execute(sql`insert into ledger_accounts(tenant_id,code,name,account_type,normal_balance,system_key,created_by) values
      (${tenantId},'1200','Inventory','asset','debit','inventory',${userId}),
      (${tenantId},'4200','Adjustment gain','income','credit','inventory_adjustment_gain',${userId}),
      (${tenantId},'5100','Consumption','expense','debit','inventory_consumption',${userId})`)
    await db.execute(sql`insert into units_of_measure(id,tenant_id,code,name,decimal_places,created_by) values(${uomId},${tenantId},'KG','Kilograms',6,${userId})`)
    await db.execute(sql`insert into material_items(id,tenant_id,code,description,unit,base_uom_id,inventory_tracked,created_by) values(${materialItemId},${tenantId},'FIXTURE','Stock fixture','KG',${uomId},true,${userId})`)
    await db.execute(sql`insert into warehouses(id,tenant_id,code,name,created_by) values(${warehouseId},${tenantId},'FIXTURE','Fixture warehouse',${userId})`)
    await db.execute(sql`insert into cost_codes(id,tenant_id,code,name,category,created_by) values(${costCodeId},${tenantId},'MATERIAL','Fixture material','material',${userId})`)
    const opening = await movement('adjustment', 10_000_000)
    await db.execute(sql`select * from post_stock_movement(${opening}::uuid,${userId}::uuid)`)
  })
  afterAll(async () => { await db.$client.end({ timeout: 5 }) })

  async function movement(type: 'adjustment' | 'consumption', quantity: number) {
    const id = randomUUID()
    await db.execute(sql`insert into stock_movements(id,tenant_id,movement_type,source_warehouse_id,project_id,movement_date,reason,created_by)
      values(${id},${principal.tenantId},${type},${warehouseId},${type === 'consumption' ? projectId : null},current_date,'Synthetic stock fixture',${principal.userId})`)
    await db.execute(sql`insert into stock_movement_lines(tenant_id,stock_movement_id,material_item_id,uom_id,cost_code_id,line_number,description,quantity_micros,declared_unit_cost_cents)
      values(${principal.tenantId},${id},${materialItemId},${uomId},${type === 'consumption' ? costCodeId : null},1,'Fixture stock',${quantity},${type === 'adjustment' ? 10000 : null})`)
    return id
  }
  function reserve(quantity = '6000000') {
    return service.reserveInventory({ warehouseId, materialItemId, uomId, projectId, costCodeId, quantityMicros: quantity, sourceType: 'fixture' }, principal, randomUUID())
  }
  async function balance() {
    const [row] = await db.execute<{ quantity: string }>(sql`select sum(quantity_delta_micros)::text as quantity from stock_ledger_entries where tenant_id=${principal.tenantId} and warehouse_id=${warehouseId}`)
    return row!.quantity
  }

  it('ordinary consumption cannot spend reserved stock and failed posting rolls back', async () => {
    await reserve()
    const issue = await movement('consumption', 5_000_000)
    await expect(db.execute(sql`select * from post_stock_movement(${issue}::uuid,${principal.userId}::uuid)`)).rejects.toThrow()
    expect(await balance()).toBe('10000000')
    const [row] = await db.execute<{ status: string; entries: number }>(sql`select status,(select count(*)::integer from stock_ledger_entries where stock_movement_id=${issue}) as entries from stock_movements where id=${issue}`)
    expect(row).toMatchObject({ status: 'draft', entries: 0 })
  })

  it('consumes once with balanced accounting and preserves the remaining reservation', async () => {
    const first = await reserve()
    await reserve('2000000')
    const key = randomUUID()
    const result = await service.transitionReservation(first.reservationId, { action: 'consume' }, principal, key)
    expect(result).toMatchObject({ status: 'consumed', availableQuantityMicros: '2000000', created: true })
    expect(await service.transitionReservation(first.reservationId, { action: 'consume' }, principal, key)).toMatchObject({ status: 'consumed', created: false })
    await expect(service.transitionReservation(first.reservationId, { action: 'release' }, principal, key)).rejects.toThrow('different request')
    expect(await balance()).toBe('4000000')
    const [evidence] = await db.execute<{ status: string; quantity: string; debit: string; credit: string }>(sql`
      select m.status,l.quantity_micros::text as quantity,
        (select sum(debit_cents)::text from journal_lines where journal_entry_id=m.posting_journal_entry_id) as debit,
        (select sum(credit_cents)::text from journal_lines where journal_entry_id=m.posting_journal_entry_id) as credit
      from inventory_reservations r join stock_movements m on m.id=r.consumption_movement_id
      join stock_movement_lines l on l.stock_movement_id=m.id where r.id=${first.reservationId}`)
    expect(evidence).toMatchObject({ status: 'posted', quantity: '6000000', debit: '60000', credit: '60000' })
  })

  it('serializes competing reservations and prevents an unposted consumption from committing', async () => {
    const results = await Promise.allSettled([reserve(), reserve()])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const winner = results.find((result) => result.status === 'fulfilled')
    if (!winner || winner.status !== 'fulfilled') throw new Error('Expected one reservation')
    const draft = await movement('consumption', 6_000_000)
    await expect(db.execute(sql`update inventory_reservations set status='consumed',consumed_at=now(),consumption_movement_id=${draft} where id=${winner.value.reservationId}`)).rejects.toThrow()
    expect(await balance()).toBe('10000000')
    const [row] = await db.execute<{ status: string }>(sql`select status from inventory_reservations where id=${winner.value.reservationId}`)
    expect(row?.status).toBe('active')
  })

  it('denies consumption without posting authority and denies cross-tenant reservation IDs', async () => {
    const row = await reserve()
    await expect(service.transitionReservation(row.reservationId, { action: 'consume' }, { ...principal, userId: procurementId, role: 'procurement' }, randomUUID())).rejects.toThrow('Stock posting capability')
    await expect(service.transitionReservation(row.reservationId, { action: 'expire' }, principal, randomUUID())).rejects.toThrow('not reached its expiry')
    await expect(service.transitionReservation(row.reservationId, { action: 'consume' }, { ...principal, tenantId: randomUUID() }, randomUUID())).rejects.toThrow('not in this tenant')
    expect(await balance()).toBe('10000000')
  })

  it('can release an existing reservation after its material is deactivated', async () => {
    const row = await reserve()
    await db.execute(sql`update material_items set is_active=false where id=${materialItemId} and tenant_id=${principal.tenantId}`)
    expect(await service.transitionReservation(row.reservationId, { action: 'release' }, principal, randomUUID())).toMatchObject({ status: 'released', availableQuantityMicros: '10000000' })
    expect(await balance()).toBe('10000000')
  })
})
