import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { auditLog, bomLineItems, boms, costCodes, db, projectBudgetLines, projectBudgets, projects, tenants, users } from '@third-code-erp/database'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ profile: vi.fn(), refresh: vi.fn() }))
vi.mock('@third-code-erp/auth', async original => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: boundary.profile,
}))
vi.mock('next/cache', () => ({ revalidatePath: boundary.refresh }))
vi.mock('../../web/node_modules/next/cache.js', () => ({ revalidatePath: boundary.refresh }))

import {
  approveProjectBudget,
  rejectProjectBudget,
  reviseProjectBudget,
  submitProjectBudget,
  type BudgetWorkflowResult,
} from '../../web/src/app/(dashboard)/projects/[id]/cost/budget/actions'
import * as audit from '../../web/src/lib/audit'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'

beforeAll(() => {
  if (
    enabled &&
    (!process.env.DATABASE_URL ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(
        new URL(process.env.DATABASE_URL).hostname,
      ))
  ) {
    throw new Error('Budget workflow proof requires synthetic loopback PostgreSQL')
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  boundary.profile.mockReset()
  boundary.refresh.mockReset()
})

interface Fixture {
  tenantId: string
  creatorId: string
  commercialId: string
  financeId: string
  ownerId: string
  viewerId: string
  projectId: string
  otherProjectId: string
  budgetId: string
  profile: {
    user: { id: string }
    tenantId: string
    role: 'commercial'
    email: string
    fullName: string
  }
  snapshot: () => Promise<{
    budgets: (typeof projectBudgets)['$inferSelect'][]
    lines: (typeof projectBudgetLines)['$inferSelect'][]
    audit: (typeof auditLog)['$inferSelect'][]
  }>
}

async function seedFixture(): Promise<Fixture> {
  const tenantId = randomUUID()
  const creatorId = randomUUID()
  const commercialId = randomUUID()
  const financeId = randomUUID()
  const ownerId = randomUUID()
  const viewerId = randomUUID()
  const projectId = randomUUID()
  const otherProjectId = randomUUID()
  const bomId = randomUUID()
  const bomLineItemId = randomUUID()
  const costCodeId = randomUUID()
  const budgetId = randomUUID()

  await db.transaction(async tx => {
    await tx.insert(tenants).values({
      id: tenantId,
      name: 'Synthetic budget workflow tenant',
      slug: `budget-workflow-${tenantId}`,
    })
    await tx.insert(users).values([
      {
        id: creatorId,
        tenant_id: tenantId,
        full_name: 'Synthetic budget creator',
        email: `${creatorId}@integration.test`,
        role: 'commercial',
      },
      {
        id: commercialId,
        tenant_id: tenantId,
        full_name: 'Synthetic commercial reviewer',
        email: `${commercialId}@integration.test`,
        role: 'commercial',
      },
      {
        id: financeId,
        tenant_id: tenantId,
        full_name: 'Synthetic finance reviewer',
        email: `${financeId}@integration.test`,
        role: 'finance',
      },
      {
        id: ownerId,
        tenant_id: tenantId,
        full_name: 'Synthetic owner reviewer',
        email: `${ownerId}@integration.test`,
        role: 'owner',
      },
      {
        id: viewerId,
        tenant_id: tenantId,
        full_name: 'Synthetic viewer',
        email: `${viewerId}@integration.test`,
        role: 'viewer',
      },
    ])
    await tx.insert(projects).values([
      {
        id: projectId,
        tenant_id: tenantId,
        name: 'Synthetic budget project',
        client: 'Synthetic client',
        created_by: creatorId,
      },
      {
        id: otherProjectId,
        tenant_id: tenantId,
        name: 'Synthetic other project',
        client: 'Synthetic client',
        created_by: creatorId,
      },
    ])
    await tx.insert(boms).values({
      id: bomId,
      tenant_id: tenantId,
      project_id: projectId,
      created_by: creatorId,
      label: 'Synthetic approved BOQ source',
      tcv_cents: 1_000_000,
      gp_cents: 220_000,
      gp_margin_bps: 2_200,
    })
    await tx.insert(bomLineItems).values({
      id: bomLineItemId,
      tenant_id: tenantId,
      bom_id: bomId,
      description: 'Synthetic materials baseline',
      unit: 'lot',
      quantity: 1,
      unit_cost_cents: 100_000,
      line_total_cents: 100_000,
    })
    await tx.insert(costCodes).values({
      id: costCodeId,
      tenant_id: tenantId,
      code: 'MAT-SYNTHETIC',
      name: 'Synthetic materials',
      category: 'material',
      created_by: creatorId,
    })
    await tx.insert(projectBudgets).values({
      id: budgetId,
      tenant_id: tenantId,
      project_id: projectId,
      source_bom_id: bomId,
      revision: 1,
      status: 'draft',
      control_mode: 'block',
      commitment_tolerance_bps: 0,
      currency: 'PHP',
      effective_from: '2026-09-13',
      revision_reason: 'Synthetic initial controlled baseline',
      created_by: creatorId,
    })
    await tx.insert(projectBudgetLines).values({
      tenant_id: tenantId,
      project_budget_id: budgetId,
      cost_code_id: costCodeId,
      bom_line_item_id: bomLineItemId,
      line_number: 1,
      description: 'Synthetic materials baseline',
      amount_cents: 100_000,
    })
  })

  const profile = {
    user: { id: creatorId },
    tenantId,
    role: 'commercial' as const,
    email: `${creatorId}@integration.test`,
    fullName: 'Synthetic budget creator',
  }
  boundary.profile.mockResolvedValue(profile)

  const snapshot = async () => ({
    budgets: await db
      .select()
      .from(projectBudgets)
      .where(eq(projectBudgets.tenant_id, tenantId))
      .orderBy(asc(projectBudgets.revision)),
    lines: await db
      .select()
      .from(projectBudgetLines)
      .where(eq(projectBudgetLines.tenant_id, tenantId))
      .orderBy(asc(projectBudgetLines.id)),
    audit: await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tenant_id, tenantId))
      .orderBy(asc(auditLog.id)),
  })

  return {
    tenantId,
    creatorId,
    commercialId,
    financeId,
    ownerId,
    viewerId,
    projectId,
    otherProjectId,
    budgetId,
    profile,
    snapshot,
  }
}

async function approveBaseline(fixture: Fixture): Promise<void> {
  await db.execute(sql`
    select *
    from public.submit_project_budget(
      ${fixture.budgetId}::uuid,
      ${fixture.creatorId}::uuid
    )
  `)
  await db.execute(sql`
    select *
    from public.review_project_budget(
      ${fixture.budgetId}::uuid,
      ${fixture.commercialId}::uuid,
      'commercial'
    )
  `)
  await db.execute(sql`
    select *
    from public.review_project_budget(
      ${fixture.budgetId}::uuid,
      ${fixture.financeId}::uuid,
      'finance'
    )
  `)
}

async function submitBaseline(fixture: Fixture): Promise<void> {
  await db.execute(sql`
    select *
    from public.submit_project_budget(
      ${fixture.budgetId}::uuid,
      ${fixture.creatorId}::uuid
    )
  `)
}

type Actor = 'creator' | 'commercial' | 'finance' | 'owner' | 'viewer'

const actorRole: Record<Actor, Fixture['profile']['role'] | 'finance' | 'owner' | 'viewer'> = {
  creator: 'commercial',
  commercial: 'commercial',
  finance: 'finance',
  owner: 'owner',
  viewer: 'viewer',
}

function actorId(fixture: Fixture, actor: Actor): string {
  switch (actor) {
    case 'creator':
      return fixture.creatorId
    case 'commercial':
      return fixture.commercialId
    case 'finance':
      return fixture.financeId
    case 'owner':
      return fixture.ownerId
    case 'viewer':
      return fixture.viewerId
  }
}

function useActor(fixture: Fixture, actor: Actor): void {
  const id = actorId(fixture, actor)
  const role = actorRole[actor]
  boundary.profile.mockResolvedValue({
    user: { id },
    tenantId: fixture.tenantId,
    role,
    email: `${id}@integration.test`,
    fullName: `Synthetic ${actor}`,
  })
}

type WorkflowOperation = 'submit' | 'commercial' | 'finance' | 'reject' | 'revise'

function actorForOperation(operation: WorkflowOperation): Actor {
  if (operation === 'finance') return 'finance'
  if (operation === 'commercial' || operation === 'reject') return 'commercial'
  return 'creator'
}

async function prepareWorkflow(
  fixture: Fixture,
  operation: WorkflowOperation,
): Promise<void> {
  if (operation === 'commercial' || operation === 'finance' || operation === 'reject') {
    await submitBaseline(fixture)
  } else if (operation === 'revise') {
    await approveBaseline(fixture)
  }
  useActor(fixture, actorForOperation(operation))
}

async function invokeWorkflow(
  fixture: Fixture,
  operation: WorkflowOperation,
  requestId?: string,
): Promise<BudgetWorkflowResult> {
  if (operation === 'submit') {
    return submitProjectBudget(fixture.projectId, fixture.budgetId)
  }
  if (operation === 'commercial') {
    return approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')
  }
  if (operation === 'finance') {
    return approveProjectBudget(fixture.projectId, fixture.budgetId, 'finance')
  }
  if (operation === 'reject') {
    return rejectProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic workflow rejection')
  }
  return requestId
    ? reviseProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic workflow revision', requestId)
    : reviseProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic workflow revision')
}

async function markAuthorityInactive(
  fixture: Fixture,
  actor: Actor,
  state: 'suspended' | 'demoted' | 'inactive-tenant',
): Promise<void> {
  const id = actorId(fixture, actor)
  const changed = {
    status_reason: `Synthetic ${state} authority`,
    status_changed_at: new Date(),
    status_changed_by: fixture.ownerId,
  }
  if (state === 'demoted') {
    await db
      .update(users)
      .set({ role: 'viewer', ...changed })
      .where(eq(users.id, id))
  } else if (state === 'suspended') {
    await db
      .update(users)
      .set({ account_status: 'suspended', ...changed })
      .where(eq(users.id, id))
  } else {
    await db
      .update(tenants)
      .set({ status: 'suspended', ...changed })
      .where(eq(tenants.id, fixture.tenantId))
  }
}

function holdFirstSemanticAudit() {
  const write = audit.writeAuditLogInTransaction
  let release: () => void = () => undefined
  let entered: () => void = () => undefined
  let first = true
  let pid = 0
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementation(async (tx, params) => {
    if (first) {
      first = false
      pid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))[0]!.pid
      entered()
      await gate
    }
    await write(tx, params)
  })
  return { ready, release, pid: () => pid }
}

function holdProjectAdvisoryLock(tenantId: string, projectId: string) {
  let release: () => void = () => undefined
  let entered: () => void = () => undefined
  let pid = 0
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  const done = db.transaction(async tx => {
    pid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))[0]!.pid
    await tx.execute(sql`
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(${`${tenantId}:${projectId}`}, 0)
      )
    `)
    entered()
    await gate
  })
  return { ready, release, pid: () => pid, done }
}

async function expectBlockedBy(pid: number): Promise<void> {
  await vi.waitFor(async () => {
    const rows = await db.execute<{ pid: number }>(sql`
      select pid
      from pg_stat_activity
      where datname = current_database()
        and ${pid} = any(pg_blocking_pids(pid))
    `)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.pid).not.toBe(pid)
  }, { timeout: 2_000 })
}

function failSemanticAuditOnce(): void {
  vi.spyOn(audit, 'writeAuditLog').mockImplementationOnce(async () => {
    throw new Error('Synthetic semantic audit failure')
  })
  vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementationOnce(async () => {
    throw new Error('Synthetic semantic audit failure')
  })
}

function failSemanticAuditAfterInsertOnce(): void {
  const write = audit.writeAuditLog
  const writeInTransaction = audit.writeAuditLogInTransaction
  vi.spyOn(audit, 'writeAuditLog').mockImplementationOnce(async params => {
    await write(params)
    throw new Error('Synthetic semantic audit failure after insert')
  })
  vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementationOnce(async (tx, params) => {
    await writeInTransaction(tx, params)
    throw new Error('Synthetic semantic audit failure after insert')
  })
}

(enabled ? describe : describe.skip)('Mounted budget workflow actions with real PostgreSQL and audit', () => {
  it('rolls back SQL submit when the semantic audit write fails', async () => {
    const fixture = await seedFixture()
    const before = await fixture.snapshot()
    failSemanticAuditOnce()

    const result = await submitProjectBudget(fixture.projectId, fixture.budgetId)
    const after = await fixture.snapshot()

    expect.soft(result).toMatchObject({ error: expect.any(String), unconfirmed: true })
    expect.soft(after).toEqual(before)
  })

  it('rolls back SQL submit when the inserted semantic audit then rejects', async () => {
    const fixture = await seedFixture()
    const before = await fixture.snapshot()
    failSemanticAuditAfterInsertOnce()

    const result = await submitProjectBudget(fixture.projectId, fixture.budgetId)
    const after = await fixture.snapshot()

    expect.soft(result).toMatchObject({ error: expect.any(String), unconfirmed: true })
    expect.soft(after).toEqual(before)
  })

  it('returns the committed submit receipt with a warning when refresh fails', async () => {
    const fixture = await seedFixture()
    boundary.refresh.mockImplementationOnce(() => {
      throw new Error('Synthetic refresh failure')
    })

    const result = await submitProjectBudget(fixture.projectId, fixture.budgetId)

    expect(result).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'submit',
        resultBudgetId: fixture.budgetId,
        status: 'pending_approval',
      },
      refreshWarning: expect.any(String),
    })
    expect(result).not.toHaveProperty('error')
    expect((await fixture.snapshot()).budgets[0]).toMatchObject({
      id: fixture.budgetId,
      status: 'pending_approval',
    })
  })

  it('returns exact scoped receipts through both approval lanes and a revision', async () => {
    const fixture = await seedFixture()

    const submitted = await submitProjectBudget(fixture.projectId, fixture.budgetId)
    expect(submitted).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'submit',
        resultBudgetId: fixture.budgetId,
        status: 'pending_approval',
      },
    })

    useActor(fixture, 'commercial')
    const commercial = await approveProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      'commercial',
    )
    expect(commercial).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'commercial',
        resultBudgetId: fixture.budgetId,
        status: 'pending_approval',
      },
    })

    useActor(fixture, 'finance')
    const finance = await approveProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      'finance',
    )
    expect(finance).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'finance',
        resultBudgetId: fixture.budgetId,
        status: 'approved',
      },
    })

    useActor(fixture, 'creator')
    const requestId = randomUUID()
    const revised = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      'Synthetic approved scope revision',
      requestId,
    )
    expect(revised).toMatchObject({
      ok: true,
      id: expect.any(String),
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'revise',
        resultBudgetId: expect.any(String),
        status: 'draft',
        requestId,
      },
    })
    if (!revised.ok) throw new Error('Expected revision receipt')
    expect(revised.receipt.resultBudgetId).toBe(revised.id)
    const state = await fixture.snapshot()
    expect(state.budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.budgetId, status: 'approved' }),
        expect.objectContaining({ id: revised.id, status: 'draft', supersedes_budget_id: fixture.budgetId }),
      ]),
    )
  })

  it('rejects a revision when the supplied project does not own the budget', async () => {
    const fixture = await seedFixture()
    await approveBaseline(fixture)
    const before = await fixture.snapshot()

    const result = await reviseProjectBudget(
      fixture.otherProjectId,
      fixture.budgetId,
      'Synthetic wrong-project revision',
    )

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(await fixture.snapshot()).toEqual(before)
  })

  it('returns a scoped rejection receipt and persists the reviewer reason', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    useActor(fixture, 'commercial')

    const result = await rejectProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      'Synthetic missing cost evidence',
    )

    expect(result).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'reject',
        resultBudgetId: fixture.budgetId,
        status: 'rejected',
      },
    })
    expect((await fixture.snapshot()).budgets[0]).toMatchObject({
      id: fixture.budgetId,
      status: 'rejected',
      rejected_by: fixture.commercialId,
      rejection_reason: 'Synthetic missing cost evidence',
    })
  })

  it.each(['submit', 'commercial', 'finance', 'reject', 'revise'] as const)(
    'rejects %s when the current actor or tenant authority is stale',
    async operation => {
      for (const state of ['suspended', 'demoted', 'inactive-tenant'] as const) {
        const fixture = await seedFixture()
        await prepareWorkflow(fixture, operation)
        await markAuthorityInactive(fixture, actorForOperation(operation), state)
        const before = await fixture.snapshot()

        const result = await invokeWorkflow(fixture, operation, randomUUID())

        expect.soft(result).toMatchObject({ error: expect.any(String) })
        expect.soft(result).not.toHaveProperty('unconfirmed')
        expect.soft(await fixture.snapshot()).toEqual(before)
      }
    },
  )

  it.each(['submit', 'commercial', 'finance', 'reject', 'revise'] as const)(
    'rejects %s when the budget belongs to a foreign tenant',
    async operation => {
      const caller = await seedFixture()
      const target = await seedFixture()
      await prepareWorkflow(target, operation)
      useActor(caller, actorForOperation(operation))
      const before = await target.snapshot()

      const result = await invokeWorkflow(target, operation, randomUUID())

      expect.soft(result).toMatchObject({ error: expect.any(String) })
      expect.soft(result).not.toHaveProperty('unconfirmed')
      expect.soft(await target.snapshot()).toEqual(before)
    },
  )

  it('rejects malformed runtime inputs before any database workflow write', async () => {
    const fixture = await seedFixture()
    const before = await fixture.snapshot()
    const invalidLane = 'invalid' as 'commercial'

    const results = [
      await submitProjectBudget('not-a-uuid', fixture.budgetId),
      await approveProjectBudget(fixture.projectId, fixture.budgetId, invalidLane),
      await rejectProjectBudget(fixture.projectId, fixture.budgetId, ' '),
      await reviseProjectBudget(fixture.projectId, fixture.budgetId, 'Valid reason', 'not-a-uuid'),
    ]

    for (const result of results) {
      expect.soft(result).toMatchObject({ error: expect.any(String) })
      expect.soft(result).not.toHaveProperty('unconfirmed')
    }
    expect(await fixture.snapshot()).toEqual(before)
  })

  it('preserves separation of duties when one non-owner actor attempts both lanes', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    useActor(fixture, 'commercial')
    const first = await approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')
    expect(first).toMatchObject({ ok: true, receipt: { operation: 'commercial', status: 'pending_approval' } })
    const beforeSecondLane = await fixture.snapshot()

    const second = await approveProjectBudget(fixture.projectId, fixture.budgetId, 'finance')

    expect(second).toMatchObject({ error: expect.any(String) })
    expect(second).not.toHaveProperty('unconfirmed')
    expect(await fixture.snapshot()).toEqual(beforeSecondLane)
  })

  it('allows explicit Owner override to complete both approval lanes', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    useActor(fixture, 'owner')

    const result = await approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')

    expect(result).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'commercial',
        resultBudgetId: fixture.budgetId,
        status: 'approved',
      },
    })
    expect((await fixture.snapshot()).budgets[0]).toMatchObject({
      status: 'approved',
      commercial_approved_by: fixture.ownerId,
      finance_approved_by: fixture.ownerId,
    })
    const semantic = (await fixture.snapshot()).audit.filter(
      row => row.entity_type === 'project_budget' && row.action === 'approve',
    )
    expect(semantic).toHaveLength(1)
    expect(semantic[0]?.diff).toMatchObject({ owner_override: true })
  })

  it('rejects creator self-approval without changing the submitted budget', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    useActor(fixture, 'creator')
    const before = await fixture.snapshot()

    const result = await approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')

    expect(result).toMatchObject({ error: expect.stringContaining('creator cannot approve') })
    expect(result).not.toHaveProperty('unconfirmed')
    expect(await fixture.snapshot()).toEqual(before)
  })

  it('enforces separate lane actors from current DB role, not a cached profile role', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    // Keep the mocked profile as Commercial, but grant this current DB user
    // both lane capabilities so the SQL separation rule is exercised.
    await db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.id, fixture.commercialId))
    useActor(fixture, 'commercial')
    const first = await approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')
    expect(first).toMatchObject({ ok: true, receipt: { status: 'pending_approval' } })
    const beforeSecondLane = await fixture.snapshot()

    const second = await approveProjectBudget(fixture.projectId, fixture.budgetId, 'finance')

    expect(second).toMatchObject({ error: expect.stringContaining('separate actors') })
    expect(second).not.toHaveProperty('unconfirmed')
    expect(await fixture.snapshot()).toEqual(beforeSecondLane)
  })

  it('replays a keyed revision after the child is edited and rejects changed payloads', async () => {
    const fixture = await seedFixture()
    await approveBaseline(fixture)
    useActor(fixture, 'creator')
    const requestId = randomUUID()
    const reason = 'Synthetic keyed revision'

    const first = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      reason,
      requestId,
    )
    expect(first).toMatchObject({ ok: true, receipt: { requestId, resultBudgetId: expect.any(String) } })
    if (!first.ok) throw new Error('Expected keyed revision receipt')

    await db.transaction(async tx => {
      await tx.execute(sql`
        select pg_catalog.set_config(
          'app.project_budget_write',
          ${first.id}::text,
          true
        )
      `)
      await tx.execute(sql`
        update public.project_budgets
        set revision_reason = 'Synthetic edited child'
        where id = ${first.id}::uuid
      `)
    })
    const edited = await fixture.snapshot()

    const replay = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      reason,
      requestId,
    )
    expect(replay).toEqual(first)
    expect(await fixture.snapshot()).toEqual(edited)

    const changedReason = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      'Synthetic changed keyed revision',
      requestId,
    )
    expect(changedReason).toMatchObject({ error: expect.any(String) })
    expect(changedReason).not.toHaveProperty('unconfirmed')
    expect(await fixture.snapshot()).toEqual(edited)

    const changedProject = await reviseProjectBudget(
      fixture.otherProjectId,
      fixture.budgetId,
      reason,
      requestId,
    )
    expect(changedProject).toMatchObject({ error: expect.any(String) })
    expect(changedProject).not.toHaveProperty('unconfirmed')
    expect(await fixture.snapshot()).toEqual(edited)
  })

  it('rolls back final Finance approval and baseline supersession on audit failure', async () => {
    const fixture = await seedFixture()
    await approveBaseline(fixture)
    useActor(fixture, 'creator')
    const revision = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      'Synthetic final-finance revision',
      randomUUID(),
    )
    expect(revision).toMatchObject({ ok: true, receipt: { status: 'draft' } })
    if (!revision.ok) throw new Error('Expected revision receipt')
    await submitProjectBudget(fixture.projectId, revision.id)
    useActor(fixture, 'commercial')
    await approveProjectBudget(fixture.projectId, revision.id, 'commercial')
    const before = await fixture.snapshot()
    useActor(fixture, 'finance')
    failSemanticAuditOnce()

    const result = await approveProjectBudget(fixture.projectId, revision.id, 'finance')
    const after = await fixture.snapshot()

    expect.soft(result).toMatchObject({ error: expect.any(String), unconfirmed: true })
    expect.soft(after).toEqual(before)
    expect(after.budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.budgetId, status: 'approved' }),
        expect.objectContaining({ id: revision.id, status: 'pending_approval', finance_approved_by: null }),
      ]),
    )
  })

  it('allows a distinct keyed revision after the first child is rejected', async () => {
    const fixture = await seedFixture()
    await approveBaseline(fixture)
    const firstRequestId = randomUUID()
    const secondRequestId = randomUUID()
    const reason = 'Synthetic repeatable revision reason'
    useActor(fixture, 'creator')

    const first = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      reason,
      firstRequestId,
    )
    expect(first).toMatchObject({ ok: true, receipt: { requestId: firstRequestId, status: 'draft' } })
    if (!first.ok) throw new Error('Expected first keyed revision receipt')

    const submittedChild = await submitProjectBudget(fixture.projectId, first.id)
    expect(submittedChild).toMatchObject({ ok: true, receipt: { resultBudgetId: first.id, status: 'pending_approval' } })
    useActor(fixture, 'commercial')
    const rejectedChild = await rejectProjectBudget(
      fixture.projectId,
      first.id,
      'Synthetic child rejected for rework',
    )
    expect(rejectedChild).toMatchObject({ ok: true, receipt: { resultBudgetId: first.id, status: 'rejected' } })

    useActor(fixture, 'creator')
    const second = await reviseProjectBudget(
      fixture.projectId,
      fixture.budgetId,
      reason,
      secondRequestId,
    )
    expect(second).toMatchObject({
      ok: true,
      receipt: {
        projectId: fixture.projectId,
        sourceBudgetId: fixture.budgetId,
        operation: 'revise',
        resultBudgetId: expect.any(String),
        status: 'draft',
        requestId: secondRequestId,
      },
    })
    if (!second.ok) throw new Error('Expected second keyed revision receipt')
    expect(second.id).not.toBe(first.id)
    expect((await fixture.snapshot()).budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: 'rejected' }),
        expect.objectContaining({ id: second.id, status: 'draft' }),
      ]),
    )
  })

  it('keeps legacy unkeyed revisions free of reason-only deduplication', async () => {
    const fixture = await seedFixture()
    await approveBaseline(fixture)
    const reason = 'Synthetic legacy revision reason'
    useActor(fixture, 'creator')

    const first = await reviseProjectBudget(fixture.projectId, fixture.budgetId, reason)
    expect(first).toMatchObject({ ok: true, receipt: { operation: 'revise', status: 'draft' } })
    if (!first.ok) throw new Error('Expected first unkeyed revision receipt')
    await submitProjectBudget(fixture.projectId, first.id)
    useActor(fixture, 'commercial')
    await rejectProjectBudget(fixture.projectId, first.id, 'Synthetic legacy child rejected')

    useActor(fixture, 'creator')
    const second = await reviseProjectBudget(fixture.projectId, fixture.budgetId, reason)
    expect(second).toMatchObject({ ok: true, receipt: { operation: 'revise', status: 'draft' } })
    if (!second.ok) throw new Error('Expected second unkeyed revision receipt')
    expect(second.id).not.toBe(first.id)
    expect(second.receipt).not.toHaveProperty('requestId')
  })

  it('serializes concurrent Commercial and Finance reviews behind the project barrier', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    const commercialProfile = {
      ...fixture.profile,
      user: { id: fixture.commercialId },
      fullName: 'Synthetic commercial reviewer',
      role: 'commercial' as const,
    }
    const financeProfile = {
      ...fixture.profile,
      user: { id: fixture.financeId },
      fullName: 'Synthetic finance reviewer',
      role: 'finance' as const,
    }
    boundary.profile.mockReset()
    boundary.profile
      .mockResolvedValueOnce(commercialProfile)
      .mockResolvedValueOnce(financeProfile)
    const barrier = holdFirstSemanticAudit()
    const commercial = approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')
    await barrier.ready
    const finance = approveProjectBudget(fixture.projectId, fixture.budgetId, 'finance')
    try {
      await expectBlockedBy(barrier.pid())
    } finally {
      barrier.release()
    }

    const results = await Promise.all([commercial, finance])
    expect(results[0]).toMatchObject({
      ok: true,
      receipt: { operation: 'commercial', status: 'pending_approval' },
    })
    expect(results[1]).toMatchObject({
      ok: true,
      receipt: { operation: 'finance', status: 'approved' },
    })
    const state = await fixture.snapshot()
    expect(state.budgets[0]).toMatchObject({
      status: 'approved',
      commercial_approved_by: fixture.commercialId,
      finance_approved_by: fixture.financeId,
    })
    expect(state.audit.filter(row => row.entity_type === 'project_budget' && row.action === 'approve')).toHaveLength(2)
  })

  it('uses one canonical advisory lock for uppercase and lowercase project UUIDs', async () => {
    const fixture = await seedFixture()
    await submitBaseline(fixture)
    useActor(fixture, 'commercial')
    const holder = holdProjectAdvisoryLock(fixture.tenantId, fixture.projectId)
    await holder.ready
    const before = await fixture.snapshot()
    const pending = approveProjectBudget(
      fixture.projectId.toUpperCase(),
      fixture.budgetId,
      'commercial',
    )
    try {
      await expectBlockedBy(holder.pid())
      // A canonical project barrier must be acquired before the budget row.
      // A third connection can therefore lock the row while the action waits
      // on the holder; this distinguishes the intended ordering from a
      // wrapper that takes the row lock before the advisory lock.
      await db.transaction(async tx => {
        const rows = await tx.execute<{ id: string }>(sql`
          select id
          from public.project_budgets
          where tenant_id = ${fixture.tenantId}::uuid
            and id = ${fixture.budgetId}::uuid
          for update nowait
        `)
        expect(rows).toHaveLength(1)
      })
      expect(await fixture.snapshot()).toEqual(before)
    } finally {
      holder.release()
    }
    await holder.done

    const result = await pending
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        projectId: fixture.projectId,
        operation: 'commercial',
        status: 'pending_approval',
      },
    })
  })

  it.each(['submit', 'commercial', 'finance', 'reject', 'revise'] as const)(
    'rolls back %s workflow state when semantic audit fails',
    async operation => {
      const fixture = await seedFixture()
      if (operation === 'commercial' || operation === 'finance' || operation === 'reject') {
        await submitBaseline(fixture)
      } else if (operation === 'revise') {
        await approveBaseline(fixture)
      }
      useActor(fixture, operation === 'finance' ? 'finance' : operation === 'commercial' || operation === 'reject' ? 'commercial' : 'creator')
      const before = await fixture.snapshot()
      failSemanticAuditOnce()

      const result = operation === 'submit'
        ? await submitProjectBudget(fixture.projectId, fixture.budgetId)
        : operation === 'commercial'
          ? await approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')
          : operation === 'finance'
            ? await approveProjectBudget(fixture.projectId, fixture.budgetId, 'finance')
            : operation === 'reject'
              ? await rejectProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic audit rollback')
              : await reviseProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic audit rollback revision', randomUUID())
      const after = await fixture.snapshot()

      expect.soft(result).toMatchObject({ error: expect.any(String), unconfirmed: true })
      expect.soft(after).toEqual(before)
    },
  )

  it.each(['submit', 'commercial', 'finance', 'reject', 'revise'] as const)(
    'returns committed %s receipt when cache refresh fails',
    async operation => {
      const fixture = await seedFixture()
      if (operation === 'commercial' || operation === 'finance' || operation === 'reject') {
        await submitBaseline(fixture)
      } else if (operation === 'revise') {
        await approveBaseline(fixture)
      }
      useActor(fixture, operation === 'finance' ? 'finance' : operation === 'commercial' || operation === 'reject' ? 'commercial' : 'creator')
      boundary.refresh.mockImplementationOnce(() => {
        throw new Error('Synthetic refresh failure')
      })
      const requestId = operation === 'revise' ? randomUUID() : undefined
      const result = operation === 'submit'
        ? await submitProjectBudget(fixture.projectId, fixture.budgetId)
        : operation === 'commercial'
          ? await approveProjectBudget(fixture.projectId, fixture.budgetId, 'commercial')
          : operation === 'finance'
            ? await approveProjectBudget(fixture.projectId, fixture.budgetId, 'finance')
            : operation === 'reject'
              ? await rejectProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic refresh warning')
              : await reviseProjectBudget(fixture.projectId, fixture.budgetId, 'Synthetic refresh warning revision', requestId!)

      expect(result).toMatchObject({
        ok: true,
        id: expect.any(String),
        receipt: {
          projectId: fixture.projectId,
          sourceBudgetId: fixture.budgetId,
          operation,
          resultBudgetId: expect.any(String),
          status: operation === 'reject' ? 'rejected' : operation === 'revise' ? 'draft' : 'pending_approval',
        },
        refreshWarning: expect.any(String),
      })
      expect(result).not.toHaveProperty('error')
    },
  )
})
