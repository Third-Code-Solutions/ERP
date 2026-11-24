import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, inRollback, makeSql, seedTwoTenants } from './_db-harness'

// S9a: ux_progress_claims_tenant_invoice_live. One invoice backs at most one
// live (not rejected / cancelled) progress claim in a tenant.
const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface Scope {
  tenantId: string
  projectId: string
  invoiceId: string
}

async function seedScope(tx: postgres.TransactionSql): Promise<Scope> {
  const fixture = await seedTwoTenants(tx)
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client)
       values ('${fixture.tenantA}', 'S9a project', 'S9a client') returning id`,
    )) as Rows
  )[0]!.id as string
  const invoiceId = await insertInvoice(tx, fixture.tenantA, projectId, 'INV-S9A-1')
  return { tenantId: fixture.tenantA, projectId, invoiceId }
}

async function insertInvoice(
  tx: postgres.TransactionSql,
  tenantId: string,
  projectId: string,
  number: string,
): Promise<string> {
  return (
    (await tx.unsafe(
      `insert into invoices(tenant_id, project_id, invoice_number, status)
       values ('${tenantId}', '${projectId}', '${number}', 'draft') returning id`,
    )) as Rows
  )[0]!.id as string
}

async function insertClaim(
  tx: postgres.TransactionSql,
  scope: Scope,
  number: string,
  status: string,
  invoiceId: string | null,
): Promise<string> {
  return (
    (await tx.unsafe(
      `insert into progress_claims(tenant_id, project_id, claim_number, milestone_pct, status, invoice_id)
       values ('${scope.tenantId}', '${scope.projectId}', '${number}', 10, '${status}',
               ${invoiceId ? `'${invoiceId}'` : 'null'}) returning id`,
    )) as Rows
  )[0]!.id as string
}

runtimeSuite('S9a one live claim per invoice', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('refuses a second live claim on the same invoice', async () => {
    const outcome = await inRollback(sql, async (tx) => {
      const scope = await seedScope(tx)
      await insertClaim(tx, scope, 'PC-S9A-1', 'invoiced', scope.invoiceId)
      try {
        await tx.savepoint(async (savepoint) => {
          await insertClaim(savepoint, scope, 'PC-S9A-2', 'invoiced', scope.invoiceId)
        })
        return 'inserted'
      } catch (error) {
        // Core maps only this constraint name to "already linked".
        const { code, constraint_name } = error as { code?: string; constraint_name?: string }
        return `${code}:${constraint_name}`
      }
    })

    expect(outcome).toBe('23505:ux_progress_claims_tenant_invoice_live')
  })

  it('refuses reviving a rejected claim onto an invoice another live claim holds', async () => {
    const outcome = await inRollback(sql, async (tx) => {
      const scope = await seedScope(tx)
      await insertClaim(tx, scope, 'PC-S9A-1', 'invoiced', scope.invoiceId)
      const second = await insertClaim(tx, scope, 'PC-S9A-2', 'rejected', scope.invoiceId)
      try {
        await tx.savepoint(async (savepoint) => {
          await savepoint.unsafe(`update progress_claims set status = 'invoiced' where id = '${second}'`)
        })
        return 'updated'
      } catch (error) {
        return (error as { code?: string }).code ?? 'unknown'
      }
    })

    expect(outcome).toBe('23505')
  })

  it('lets a rejected or cancelled claim share the invoice with one live claim', async () => {
    const count = await inRollback(sql, async (tx) => {
      const scope = await seedScope(tx)
      await insertClaim(tx, scope, 'PC-S9A-1', 'rejected', scope.invoiceId)
      await insertClaim(tx, scope, 'PC-S9A-2', 'cancelled', scope.invoiceId)
      await insertClaim(tx, scope, 'PC-S9A-3', 'invoiced', scope.invoiceId)
      return (
        (await tx.unsafe(
          `select count(*)::int as n from progress_claims where invoice_id = '${scope.invoiceId}'`,
        )) as Rows
      )[0]!.n
    })

    expect(count).toBe(3)
  })

  it('ignores claims without an invoice and different invoices', async () => {
    const count = await inRollback(sql, async (tx) => {
      const scope = await seedScope(tx)
      const otherInvoice = await insertInvoice(tx, scope.tenantId, scope.projectId, 'INV-S9A-2')
      await insertClaim(tx, scope, 'PC-S9A-1', 'draft', null)
      await insertClaim(tx, scope, 'PC-S9A-2', 'draft', null)
      await insertClaim(tx, scope, 'PC-S9A-3', 'invoiced', scope.invoiceId)
      await insertClaim(tx, scope, 'PC-S9A-4', 'invoiced', otherInvoice)
      return (
        (await tx.unsafe(
          `select count(*)::int as n from progress_claims where tenant_id = '${scope.tenantId}'`,
        )) as Rows
      )[0]!.n
    })

    expect(count).toBe(4)
  })
})
