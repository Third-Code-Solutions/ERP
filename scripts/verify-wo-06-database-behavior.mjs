#!/usr/bin/env node

/**
 * Transactional WO-06 behavior probe.
 *
 * The probe runs only against DATABASE_URL and rolls every fixture back. It
 * exercises the database-owned cascade; it is not a production data seeder.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('BLOCKED DATABASE_URL is required')
  process.exit(2)
}

const requireFromDatabasePackage = createRequire(
  join(process.cwd(), 'packages', 'database', 'package.json'),
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})
const ROLLBACK = Symbol('rollback')

function totalValue(row, key) {
  return String(row?.[key])
}

async function expectRejected(tx, savepoint, callback, expectedMessage) {
  await tx.unsafe(`savepoint ${savepoint}`)
  let caught
  try {
    await callback()
  } catch (error) {
    caught = error
  }
  await tx.unsafe(`rollback to savepoint ${savepoint}`)
  await tx.unsafe(`release savepoint ${savepoint}`)
  assert.ok(caught, `expected ${savepoint} operation to fail`)
  assert.match(String(caught), new RegExp(expectedMessage))
}

try {
  try {
    await sql.begin(async (tx) => {
      const tenantId = randomUUID()
      const projectId = randomUUID()
      const bomId = randomUUID()
      const lineId = randomUUID()
      const reviewLineId = randomUUID()
      const dupaId = randomUUID()
      const crewRoleId = randomUUID()
      const materialLineId = randomUUID()
      const labourLineId = randomUUID()
      const equipmentLineId = randomUUID()
      const authenticatedUserId = randomUUID()
      const authenticatedLineId = randomUUID()
      const authenticatedDupaId = randomUUID()
      const suffix = randomUUID().slice(0, 12)

      await tx`
        insert into public.tenants (id, name, slug, organization_type)
        values (${tenantId}, ${'WO-06 probe'}, ${`wo06-${suffix}`}, 'construction')
      `
      await tx`
        insert into public.projects (id, tenant_id, name, client, status, project_type)
        values (${projectId}, ${tenantId}, 'WO-06 probe project', 'Probe client', 'active', 'mep')
      `
      await tx`
        insert into public.boms (id, tenant_id, project_id, status, label)
        values (${bomId}, ${tenantId}, ${projectId}, 'draft', 'WO-06 probe BOM')
      `
      await tx`
        insert into public.bom_line_items (
          id, tenant_id, bom_id, kind, classification_status, description,
          description_original, unit, quantity, unit_rate_source
        ) values (
          ${lineId}, ${tenantId}, ${bomId}, 'work_item', 'classified',
          'Probe work item', 'Probe work item', 'lot', 3, 'manual'
        )
      `
      await tx`
        insert into public.bom_line_items (
          id, tenant_id, bom_id, kind, classification_status, description,
          description_original, unit, quantity, unit_rate_source
        ) values (
          ${reviewLineId}, ${tenantId}, ${bomId}, 'work_item', 'review',
          'Unclassified probe item', 'Unclassified probe item', 'lot', 1, 'manual'
        )
      `
      await tx`
        insert into public.dupas (
          id, tenant_id, bom_line_item_id, header_quantity, uom, vat_base
        ) values (${dupaId}, ${tenantId}, ${lineId}, 2, 'lot', 'direct_only')
      `
      await tx`
        insert into public.crew_roles (
          id, tenant_id, name, hourly_rate_centavos, effective_from
        ) values (${crewRoleId}, ${tenantId}, 'Probe carpenter', 300, '2026-01-01')
      `
      await tx`
        insert into public.dupa_material_lines (
          id, tenant_id, dupa_id, description, quantity, uom,
          unit_rate_centavos, rate_source
        ) values (
          ${materialLineId}, ${tenantId}, ${dupaId}, 'Probe material', 2,
          'pcs', 100, 'manual'
        )
      `
      await tx`
        insert into public.dupa_labour_lines (
          id, tenant_id, dupa_id, crew_role_id, description, no_of_persons,
          hourly_rate_centavos, productivity_per_hour
        ) values (
          ${labourLineId}, ${tenantId}, ${dupaId}, ${crewRoleId}, 'Probe labour',
          1, 300, 2
        )
      `
      await tx`
        insert into public.dupa_equipment_lines (
          id, tenant_id, dupa_id, description, no_of_units,
          hourly_rate_centavos, productivity_per_hour
        ) values (
          ${equipmentLineId}, ${tenantId}, ${dupaId}, 'Probe equipment',
          1, 1000, 4
        )
      `

      let [totals] = await tx`
        select direct_cost_centavos, indirect_cost_centavos, vat_centavos,
               total_cost_centavos, unit_rate_centavos
          from public.dupas
         where id = ${dupaId} and tenant_id = ${tenantId}
      `
      assert.equal(totalValue(totals, 'direct_cost_centavos'), '600')
      assert.equal(totalValue(totals, 'indirect_cost_centavos'), '90')
      assert.equal(totalValue(totals, 'vat_centavos'), '72')
      assert.equal(totalValue(totals, 'total_cost_centavos'), '762')
      assert.equal(totalValue(totals, 'unit_rate_centavos'), '381')

      let [line] = await tx`
        select unit_rate_source, unit_cost_cents, markup_bps, line_total_cents
          from public.bom_line_items
         where id = ${lineId} and tenant_id = ${tenantId}
      `
      assert.equal(line.unit_rate_source, 'dupa')
      assert.equal(String(line.unit_cost_cents), '381')
      assert.equal(line.markup_bps, 0)
      assert.equal(String(line.line_total_cents), '1143')

      await tx`
        update public.crew_roles
           set hourly_rate_centavos = 500
         where id = ${crewRoleId} and tenant_id = ${tenantId}
      `
      ;[totals] = await tx`
        select direct_cost_centavos, indirect_cost_centavos, vat_centavos,
               total_cost_centavos, unit_rate_centavos
          from public.dupas
         where id = ${dupaId} and tenant_id = ${tenantId}
      `
      assert.equal(totalValue(totals, 'direct_cost_centavos'), '700')
      assert.equal(totalValue(totals, 'indirect_cost_centavos'), '105')
      assert.equal(totalValue(totals, 'vat_centavos'), '84')
      assert.equal(totalValue(totals, 'total_cost_centavos'), '889')
      assert.equal(totalValue(totals, 'unit_rate_centavos'), '445')

      ;[line] = await tx`
        select unit_cost_cents, line_total_cents
          from public.bom_line_items
         where id = ${lineId} and tenant_id = ${tenantId}
      `
      assert.equal(String(line.unit_cost_cents), '445')
      assert.equal(String(line.line_total_cents), '1335')

      await tx`
        update public.dupas
           set vat_base = 'direct_plus_indirect'
         where id = ${dupaId} and tenant_id = ${tenantId}
      `
      ;[totals] = await tx`
        select vat_centavos, total_cost_centavos, unit_rate_centavos
          from public.dupas
         where id = ${dupaId} and tenant_id = ${tenantId}
      `
      assert.equal(totalValue(totals, 'vat_centavos'), '97')
      assert.equal(totalValue(totals, 'total_cost_centavos'), '902')
      assert.equal(totalValue(totals, 'unit_rate_centavos'), '451')

      ;[line] = await tx`
        select unit_cost_cents, line_total_cents
          from public.bom_line_items
         where id = ${lineId} and tenant_id = ${tenantId}
      `
      assert.equal(String(line.unit_cost_cents), '451')
      assert.equal(String(line.line_total_cents), '1353')
      assert.notEqual(String(totals.unit_rate_centavos), String(totals.total_cost_centavos))

      await expectRejected(
        tx,
        'dupa_unclassified_guard',
        () => tx`
          insert into public.dupas (tenant_id, bom_line_item_id, header_quantity, uom)
          values (${tenantId}, ${reviewLineId}, 1, 'lot')
        `,
        'DUPA requires a classified work item',
      )

      const [audit] = await tx`
        select count(*)::int as count
          from public.audit_log
         where tenant_id = ${tenantId}
           and entity_type in (
             'dupas', 'dupa_material_lines', 'dupa_labour_lines',
             'dupa_equipment_lines', 'crew_roles'
           )
      `
      assert.ok(Number(audit.count) >= 8, `expected DUPA audit rows, got ${audit.count}`)

      // Probe the same role used by Supabase's authenticated Data API. The
      // fixture is still inside the outer rollback transaction.
      await tx`
        insert into public.users (id, tenant_id, email, full_name, role)
        values (
          ${authenticatedUserId}, ${tenantId}, ${`wo06-${suffix}@probe.test`},
          'WO-06 Authenticated Probe', 'admin'
        )
      `
      await tx`
        insert into public.bom_line_items (
          id, tenant_id, bom_id, kind, classification_status, description,
          description_original, unit, quantity, unit_rate_source
        ) values (
          ${authenticatedLineId}, ${tenantId}, ${bomId}, 'work_item', 'classified',
          'Authenticated probe work item', 'Authenticated probe work item',
          'lot', 1, 'manual'
        )
      `
      await tx`
        select set_config(
          'request.jwt.claims',
          ${JSON.stringify({ sub: authenticatedUserId, role: 'authenticated' })},
          true
        )
      `
      await tx.unsafe('set local role authenticated')
      await tx`
        insert into public.dupas (
          id, tenant_id, bom_line_item_id, header_quantity, uom, created_by
        ) values (
          ${authenticatedDupaId}, ${tenantId}, ${authenticatedLineId}, 1, 'lot',
          ${authenticatedUserId}
        )
      `
      const [authenticatedRead] = await tx`
        select total_cost_centavos, unit_rate_centavos
          from public.dupas
         where id = ${authenticatedDupaId}
      `
      assert.equal(totalValue(authenticatedRead, 'total_cost_centavos'), '0')
      assert.equal(totalValue(authenticatedRead, 'unit_rate_centavos'), '0')
      await expectRejected(
        tx,
        'dupa_computed_forge',
        () => tx`update public.dupas set total_cost_centavos = 999 where id = ${authenticatedDupaId}`,
        'permission denied',
      )
      await tx.unsafe('reset role')

      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  console.log('PASS WO-06 database behavior: cascade, H sync, crew refresh, VAT base, audit, and classified-work guard')
} finally {
  await sql.end({ timeout: 5 })
}
