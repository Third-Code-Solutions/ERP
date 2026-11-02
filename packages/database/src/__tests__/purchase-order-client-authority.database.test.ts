import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { becomeAuthenticated, inRollback, makeSql, seedTwoTenants } from './_db-harness'

const suite = process.env.DATABASE_HARDENING_EXPECTED === '1' ? describe : describe.skip

async function denied(tx: postgres.TransactionSql, statement: string, values: string[]) {
  try {
    await tx.savepoint(async probe => { await probe.unsafe(statement, values) })
    return undefined
  } catch (error) {
    if (error instanceof postgres.PostgresError) return error.code
    throw error
  }
}

suite('Purchase order client write authority', () => {
  const sql = makeSql()
  afterAll(async () => { await sql.end() })

  it('denies a Viewer direct approval and line-price writes while retaining isolated reads', async () => {
    await inRollback(sql, async tx => {
      const { tenantA, userA, userB } = await seedTwoTenants(tx)
      await tx`update users set role='viewer' where id=${userA}`
      await tx`update tenants set legal_name='Synthetic legal company',registered_address='Synthetic address',bir_tin='TEST-ONLY-TIN' where id=${tenantA}`
      const [project] = await tx<{id:string}[]>`insert into projects(tenant_id,name,client) values(${tenantA},'Authority fixture','Synthetic client') returning id`
      const [po] = await tx<{id:string}[]>`insert into purchase_orders(tenant_id,project_id,po_number,status) values(${tenantA},${project!.id},'AUTHORITY-FIXTURE','pending_scm_issuance') returning id`
      const [line] = await tx<{id:string}[]>`insert into po_line_items(tenant_id,po_id,description,quantity,unit_cost_cents,line_total_cents) values(${tenantA},${po!.id},'Fixture material',1,100,100) returning id`
      await becomeAuthenticated(tx, userA)
      expect(await tx`select id from purchase_orders where id=${po!.id}`).toHaveLength(1)
      expect(await denied(tx, 'update purchase_orders set status=\'issued\' where id=$1', [po!.id])).toBe('42501')
      expect(await denied(tx, 'update po_line_items set unit_cost_cents=1 where id=$1', [line!.id])).toBe('42501')
      expect(await denied(tx, 'delete from po_line_items where id=$1', [line!.id])).toBe('42501')
      await tx.unsafe('reset role')
      await tx`update users set role='sales' where id=${userA}`
      await becomeAuthenticated(tx, userA)
      expect(await tx`select id from purchase_orders where id=${po!.id}`).toHaveLength(0)
      expect(await tx`select id from po_line_items where id=${line!.id}`).toHaveLength(0)
      await tx.unsafe('reset role')
      await becomeAuthenticated(tx, userB)
      expect(await tx`select id from purchase_orders where id=${po!.id}`).toHaveLength(0)
      expect(await tx`select id from po_line_items where id=${line!.id}`).toHaveLength(0)
      await tx.unsafe('reset role')
      await tx`update purchase_orders set status='issued' where id=${po!.id}`
      expect(await tx`select status,issuer_legal_profile->>'legal_name' as legal_name from purchase_orders where id=${po!.id}`).toEqual([{status:'issued',legal_name:'Synthetic legal company'}])
    })
  })

  it('does not grant public or authenticated mutation privileges on either purchase-order table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['purchase_orders', 'po_line_items']) {
        const [result] = await sql<{insert:boolean;update:boolean;delete:boolean}[]>`select
          has_table_privilege(${role},${`public.${table}`},'INSERT') as insert,
          has_table_privilege(${role},${`public.${table}`},'UPDATE') as update,
          has_table_privilege(${role},${`public.${table}`},'DELETE') as delete`
        expect(result).toEqual({insert:false,update:false,delete:false})
      }
    }
  })
})
