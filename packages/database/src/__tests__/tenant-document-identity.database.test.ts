import { afterAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, inRollback, makeSql } from './_db-harness'

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_DOCUMENT_IDENTITY_EXPECTED === '1'
    ? describe
    : describe.skip

runtimeSuite('tenant document identity database contract', () => {
  const sql = makeSql()

  afterAll(async () => {
    await sql.end()
  })

  it('blocks incomplete issuance and keeps the captured legal identity immutable', async () => {
    const result = await inRollback(sql, async (tx) => {
      const [tenant] = await tx<{ tenant_id: string }[]>`
        insert into tenants(name, slug)
        values ('Document identity probe', 'document-identity-' || substr(md5(random()::text), 1, 10))
        returning id as tenant_id
      `
      if (!tenant) throw new Error('Synthetic tenant was not created')
      const tenantId = tenant.tenant_id
      const [project] = await tx<{ project_id: string }[]>`
        insert into projects(tenant_id, name, client)
        values (${tenantId}, 'Synthetic project', 'Synthetic client')
        returning id as project_id
      `
      if (!project) throw new Error('Synthetic project was not created')
      const projectId = project.project_id
      const [purchaseOrder] = await tx<{ po_id: string }[]>`
        insert into purchase_orders(tenant_id, project_id, po_number, status)
        values (${tenantId}, ${projectId}, 'PO-IDENTITY-PROBE', 'pending_scm_issuance')
        returning id as po_id
      `
      if (!purchaseOrder) throw new Error('Synthetic purchase order was not created')
      const purchaseOrderId = purchaseOrder.po_id

      let incompleteRejected = false
      try {
        await tx.savepoint(async (probe) => {
          await probe`update purchase_orders set status = 'issued' where id = ${purchaseOrderId}`
        })
      } catch (error) {
        incompleteRejected = String(error).includes('Company legal document identity is incomplete')
      }

      await tx`
        update tenants
        set legal_name = 'Original Synthetic Legal Company',
            registered_address = 'Synthetic fixture address',
            bir_tin = 'TEST-TIN-SNAPSHOT'
        where id = ${tenantId}
      `
      await tx`update purchase_orders set status = 'issued' where id = ${purchaseOrderId}`
      let snapshotWriteRejected = false
      try {
        await tx.savepoint(async (probe) => {
          await probe`update purchase_orders set issuer_legal_profile = '{"legal_name":"Forged company"}'::jsonb where id = ${purchaseOrderId}`
        })
      } catch (error) {
        snapshotWriteRejected = String(error).includes('Issuer legal profile is controlled by issuance')
      }
      await tx`update tenants set legal_name = 'Changed Synthetic Legal Company' where id = ${tenantId}`
      const [row] = await tx<{ legal_name: string | null }[]>`
        select issuer_legal_profile ->> 'legal_name' as legal_name
        from purchase_orders
        where id = ${purchaseOrderId}
      `

      return { incompleteRejected, snapshotWriteRejected, capturedLegalName: row?.legal_name }
    })

    expect(result).toEqual({
      incompleteRejected: true,
      snapshotWriteRejected: true,
      capturedLegalName: 'Original Synthetic Legal Company',
    })
  })

  it('rejects a caller-provided issuer snapshot instead of bypassing incomplete company setup', async () => {
    await inRollback(sql, async tx => {
      const [tenant] = await tx<{id:string}[]>`insert into tenants(name,slug) values('Identity forgery probe','identity-forgery-'||gen_random_uuid()) returning id`
      const [project] = await tx<{id:string}[]>`insert into projects(tenant_id,name,client) values(${tenant!.id},'Synthetic project','Synthetic client') returning id`
      const [po] = await tx<{id:string}[]>`insert into purchase_orders(tenant_id,project_id,po_number,status) values(${tenant!.id},${project!.id},'PO-FORGERY','pending_scm_issuance') returning id`
      await expect(tx.savepoint(async probe => {
        await probe`update purchase_orders set status='issued',issuer_legal_profile='{"legal_name":"Forged company","registered_address":"Forged","bir_tin":"Forged"}'::jsonb where id=${po!.id}`
      })).rejects.toThrow('Issuer legal profile is controlled by issuance')
      expect(await tx`select status,issuer_legal_profile from purchase_orders where id=${po!.id}`).toEqual([{status:'pending_scm_issuance',issuer_legal_profile:null}])
    })
  })
})
