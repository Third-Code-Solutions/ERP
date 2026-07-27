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
    '../../../../supabase/migrations/20260726242000_project_budget_schema.sql'
  ),
  'utf8'
).toLowerCase()
const controlSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726243000_project_budget_controls.sql'
  ),
  'utf8'
).toLowerCase()

describe('Project Budget migration contract', () => {
  it('creates versioned tenant-safe budget and Cost Code evidence', () => {
    for (const table of [
      'cost_codes',
      'project_budgets',
      'project_budget_lines',
    ]) {
      expect(schemaSql).toContain(`create table if not exists public.${table}`)
    }
    for (const constraint of [
      'project_budgets_project_tenant_fk',
      'project_budgets_supersedes_tenant_fk',
      'project_budget_lines_budget_tenant_fk',
      'project_budget_lines_cost_code_tenant_fk',
      'po_line_items_cost_code_tenant_fk',
      'supplier_bill_lines_cost_code_tenant_fk',
      'cost_entries_cost_code_tenant_fk',
    ]) {
      expect(schemaSql).toContain(constraint)
    }
  })

  it('permits one current approved baseline per tenant project', () => {
    expect(schemaSql).toMatch(
      /create unique index if not exists ux_project_budgets_current_approved[\s\S]*?where status = 'approved'/
    )
    expect(schemaSql).toContain('ux_project_budgets_project_revision')
  })

  it('requires independent Commercial and Finance evidence', () => {
    expect(controlSql).toContain(
      'project budget creator cannot approve their own revision'
    )
    expect(controlSql).toContain(
      'commercial and finance approvals require separate actors'
    )
    expect(controlSql).toContain("v_actor_role = 'owner'")
  })

  it('serializes revision and commitment decisions', () => {
    expect(controlSql).toMatch(
      /from public\.project_budgets budget[\s\S]*?budget\.status = 'approved'[\s\S]*?for update/
    )
    expect(controlSql).toContain('pg_advisory')
  })

  it('blocks missing, unbudgeted, and over-limit Cost Codes', () => {
    expect(controlSql).toContain(
      'blocked budget requires a cost code on every po line'
    )
    expect(controlSql).toContain(
      'blocked budget does not contain po cost code'
    )
    expect(controlSql).toContain(
      'purchase order commitment exceeds blocked cost code budget'
    )
  })

  it('forces RLS and narrows workflow execution', () => {
    for (const table of [
      'cost_codes',
      'project_budgets',
      'project_budget_lines',
    ]) {
      expect(controlSql).toContain(
        `alter table public.${table} force row level security`
      )
    }
    expect(controlSql).toMatch(
      /revoke execute on function public\.review_project_budget\(uuid, uuid, text\)[\s\S]*?from public, anon, authenticated/
    )
    expect(controlSql).toContain('create trigger cortex_mirror_project_budget')
    expect(controlSql).toContain(
      'project budget source bom must belong to its project'
    )
    expect(controlSql).toMatch(
      /create trigger guard_project_budget[\s\S]*?before insert or update or delete/
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_BUDGET_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface BudgetFixture {
  tenantId: string
  creatorId: string
  commercialId: string
  financeId: string
  viewerId: string
  ownerId: string
  projectId: string
  costCodeId: string
  budgetId: string
}

async function seedBudgetFixture(
  tx: postgres.TransactionSql,
  controlMode: 'monitor' | 'warn' | 'block' = 'block',
  amountCents = 10_000
): Promise<BudgetFixture> {
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Budget probe', 'budget-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string

  async function user(role: string, label: string): Promise<string> {
    return (
      (await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(
           gen_random_uuid(),
           '${tenantId}',
           '${label}-${suffix}@probe.test',
           '${label}',
           '${role}'
         )
         returning id`
      )) as Rows
    )[0]!.id as string
  }

  const creatorId = await user('commercial', 'Creator')
  const commercialId = await user('commercial', 'Commercial')
  const financeId = await user('finance', 'Finance')
  const viewerId = await user('viewer', 'Viewer')
  const ownerId = await user('owner', 'Owner')
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client, created_by)
       values('${tenantId}', 'Budget project', 'Probe', '${creatorId}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const costCodeId = (
    (await tx.unsafe(
      `insert into cost_codes(
         tenant_id, code, name, category, created_by
       )
       values(
         '${tenantId}', 'MAT-${suffix}', 'Materials', 'material',
         '${creatorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const budgetId = (
    (await tx.unsafe(
      `insert into project_budgets(
         tenant_id,
         project_id,
         revision,
         status,
         control_mode,
         commitment_tolerance_bps,
         currency,
         effective_from,
         revision_reason,
         created_by
       )
       values(
         '${tenantId}',
         '${projectId}',
         1,
         'draft',
         '${controlMode}',
         0,
         'PHP',
         current_date,
         'Initial controlled baseline',
         '${creatorId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into project_budget_lines(
       tenant_id,
       project_budget_id,
       cost_code_id,
       line_number,
       description,
       amount_cents
     )
     values(
       '${tenantId}',
       '${budgetId}',
       '${costCodeId}',
       1,
       'Materials baseline',
       ${amountCents}
     )`
  )

  return {
    tenantId,
    creatorId,
    commercialId,
    financeId,
    viewerId,
    ownerId,
    projectId,
    costCodeId,
    budgetId,
  }
}

async function approveBudget(
  tx: postgres.TransactionSql,
  fixture: BudgetFixture
): Promise<void> {
  await tx.unsafe(
    `select * from submit_project_budget(
       '${fixture.budgetId}',
       '${fixture.creatorId}'
     )`
  )
  await tx.unsafe(
    `select * from review_project_budget(
       '${fixture.budgetId}',
       '${fixture.commercialId}',
       'commercial'
     )`
  )
  await tx.unsafe(
    `select * from review_project_budget(
       '${fixture.budgetId}',
       '${fixture.financeId}',
       'finance'
     )`
  )
}

runtimeSuite('Project Budget runtime controls', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('approves a dual-lane baseline and preserves one current revision', async () => {
    const state = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      await approveBudget(tx, fixture)
      return (
        (await tx.unsafe(
          `select status, commercial_approved_by, finance_approved_by,
             total_budget_cents
           from project_budgets
           where id = '${fixture.budgetId}'`
        )) as Rows
      )[0]!
    })

    expect(state.status).toBe('approved')
    expect(state.commercial_approved_by).toBeTruthy()
    expect(state.finance_approved_by).toBeTruthy()
    expect(Number(state.total_budget_cents)).toBe(10_000)
  })

  it('rejects creator self-approval', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      await tx.unsafe(
        `select * from submit_project_budget(
           '${fixture.budgetId}',
           '${fixture.creatorId}'
         )`
      )
      try {
        await tx.unsafe(
          `select * from review_project_budget(
             '${fixture.budgetId}',
             '${fixture.creatorId}',
             'commercial'
           )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('clones a revision and supersedes the old baseline only after approval', async () => {
    const state = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      await approveBudget(tx, fixture)
      const revised = (
        (await tx.unsafe(
          `select * from create_project_budget_revision(
             '${fixture.budgetId}',
             '${fixture.creatorId}',
             'Supplier scope changed'
           )`
        )) as Rows
      )[0]!
      const revisedId = revised.budget_id as string
      await tx.unsafe(
        `select * from submit_project_budget(
           '${revisedId}',
           '${fixture.creatorId}'
         )`
      )
      await tx.unsafe(
        `select * from review_project_budget(
           '${revisedId}',
           '${fixture.commercialId}',
           'commercial'
         )`
      )
      await tx.unsafe(
        `select * from review_project_budget(
           '${revisedId}',
           '${fixture.financeId}',
           'finance'
         )`
      )
      return (await tx.unsafe(
        `select revision, status
         from project_budgets
         where project_id = '${fixture.projectId}'
         order by revision`
      )) as Rows
    })

    expect(state).toEqual([
      expect.objectContaining({ revision: 1, status: 'superseded' }),
      expect.objectContaining({ revision: 2, status: 'approved' }),
    ])
  })

  it('blocks cumulative PO commitments above a Cost Code baseline', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx, 'block', 10_000)
      await approveBudget(tx, fixture)

      async function createPo(number: string, amount: number): Promise<string> {
        const poId = (
          (await tx.unsafe(
            `insert into purchase_orders(
               tenant_id,
               project_id,
               created_by,
               po_number,
               status,
               subtotal_cents,
               total_cents
             )
             values(
               '${fixture.tenantId}',
               '${fixture.projectId}',
               '${fixture.creatorId}',
               '${number}',
               'draft',
               ${amount},
               ${amount}
             )
             returning id`
          )) as Rows
        )[0]!.id as string
        await tx.unsafe(
          `insert into po_line_items(
             tenant_id,
             po_id,
             description,
             cost_code_id,
             quantity,
             unit_cost_cents,
             line_total_cents
           )
           values(
             '${fixture.tenantId}',
             '${poId}',
             'Budgeted commitment',
             '${fixture.costCodeId}',
             1,
             ${amount},
             ${amount}
           )`
        )
        return poId
      }

      const firstId = await createPo(`PO-A-${Date.now()}`, 9_000)
      await tx.unsafe(
        `update purchase_orders set status = 'issued' where id = '${firstId}'`
      )
      const secondId = await createPo(`PO-B-${Date.now()}`, 2_000)
      try {
        await tx.unsafe(
          `update purchase_orders set status = 'issued' where id = '${secondId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('blocks issuance when a line has no Cost Code', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      await approveBudget(tx, fixture)
      const poId = (
        (await tx.unsafe(
          `insert into purchase_orders(
             tenant_id, project_id, created_by, po_number, status,
             subtotal_cents, total_cents
           )
           values(
             '${fixture.tenantId}', '${fixture.projectId}',
             '${fixture.creatorId}', 'PO-MISSING-${Date.now()}', 'draft',
             100, 100
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      await tx.unsafe(
        `insert into po_line_items(
           tenant_id, po_id, description, quantity, unit_cost_cents,
           line_total_cents
         )
         values(
           '${fixture.tenantId}', '${poId}', 'Missing code', 1, 100, 100
         )`
      )
      try {
        await tx.unsafe(
          `update purchase_orders set status = 'issued' where id = '${poId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects cross-tenant Cost Code references', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      const otherTenantId = (
        (await tx.unsafe(
          `insert into tenants(name, slug)
           values('Other budget tenant', 'other-${Date.now()}')
           returning id`
        )) as Rows
      )[0]!.id as string
      const otherCodeId = (
        (await tx.unsafe(
          `insert into cost_codes(tenant_id, code, name, category)
           values('${otherTenantId}', 'OTH', 'Other', 'other')
           returning id`
        )) as Rows
      )[0]!.id as string
      try {
        await tx.unsafe(
          `update project_budget_lines
           set cost_code_id = '${otherCodeId}'
           where project_budget_id = '${fixture.budgetId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects a source BOM from another project', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      const otherProjectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client, created_by)
           values(
             '${fixture.tenantId}',
             'Other budget project',
             'Probe',
             '${fixture.creatorId}'
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      const otherBomId = (
        (await tx.unsafe(
          `insert into boms(tenant_id, project_id, created_by, label)
           values(
             '${fixture.tenantId}',
             '${otherProjectId}',
             '${fixture.creatorId}',
             'Other project BOM'
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      try {
        await tx.unsafe(
          `update project_budgets
           set source_bom_id = '${otherBomId}'
           where id = '${fixture.budgetId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('denies budget reads to Viewer while permitting Commercial', async () => {
    const counts = await inRollback(sql, async (tx) => {
      const fixture = await seedBudgetFixture(tx)
      await becomeAuthenticated(tx, fixture.viewerId)
      const viewerRows = (await tx.unsafe(
        `select count(*)::int as count
         from project_budgets
         where id = '${fixture.budgetId}'`
      )) as Rows
      await tx.unsafe('reset role')
      await becomeAuthenticated(tx, fixture.commercialId)
      const commercialRows = (await tx.unsafe(
        `select count(*)::int as count
         from project_budgets
         where id = '${fixture.budgetId}'`
      )) as Rows
      await tx.unsafe('reset role')
      return {
        viewer: Number(viewerRows[0]!.count),
        commercial: Number(commercialRows[0]!.count),
      }
    })

    expect(counts).toEqual({ viewer: 0, commercial: 1 })
  })
})
