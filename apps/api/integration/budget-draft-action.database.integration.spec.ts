import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import {
  auditLog,
  bomLineItems,
  boms,
  costCodes,
  db,
  projectBudgetLines,
  projectBudgets,
  projects,
  tenants,
  users,
} from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ profile: vi.fn(), refresh: vi.fn() }))
vi.mock('@third-code-erp/auth', async original => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: boundary.profile,
}))
vi.mock('next/cache', () => ({ revalidatePath: boundary.refresh }))
vi.mock('../../web/node_modules/next/cache.js', () => ({ revalidatePath: boundary.refresh }))

import {
  createCostCode,
  createProjectBudget,
  saveProjectBudget,
  submitProjectBudget,
} from '../../web/src/app/(dashboard)/projects/[id]/cost/budget/actions'
import { loadBudgetDraft } from '../../web/src/app/(dashboard)/projects/[id]/cost/budget/draft-query'
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
    throw new Error('Budget draft proof requires synthetic loopback PostgreSQL')
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  boundary.profile.mockReset()
  boundary.refresh.mockReset()
})

interface Fixture {
  tenantId: string
  userId: string
  projectId: string
  otherProjectId: string
  bomId: string
  bomLineItemId: string
  secondBomLineItemId: string
  costCodeId: string
  secondCostCodeId: string
  budgetId?: string
  budgetLineId?: string
  secondBudgetLineId?: string
  loadDraft: (canReadBom: boolean) => ReturnType<typeof loadBudgetDraft>
  snapshot: () => Promise<{
    costCodes: (typeof costCodes)['$inferSelect'][]
    budgets: (typeof projectBudgets)['$inferSelect'][]
    lines: (typeof projectBudgetLines)['$inferSelect'][]
    audit: (typeof auditLog)['$inferSelect'][]
  }>
}

async function seedFixture(
  options: { withBudget?: boolean; withSecondLine?: boolean } = {},
): Promise<Fixture> {
  const withBudget = options.withBudget ?? false
  const withSecondLine = options.withSecondLine ?? false
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const otherProjectId = randomUUID()
  const bomId = randomUUID()
  const bomLineItemId = randomUUID()
  const secondBomLineItemId = randomUUID()
  const costCodeId = randomUUID()
  const secondCostCodeId = randomUUID()
  const budgetId = withBudget ? randomUUID() : undefined
  const budgetLineId = withBudget ? randomUUID() : undefined
  const secondBudgetLineId = withBudget && withSecondLine ? randomUUID() : undefined

  await db.transaction(async tx => {
    await tx.insert(tenants).values({
      id: tenantId,
      name: 'Synthetic budget draft tenant',
      slug: `budget-draft-${tenantId}`,
    })
    await tx.insert(users).values({
      id: userId,
      tenant_id: tenantId,
      full_name: 'Synthetic budget editor',
      email: `${userId}@integration.test`,
      role: 'admin',
    })
    await tx.insert(projects).values({
      id: projectId,
      tenant_id: tenantId,
      name: 'Synthetic budget draft project',
      client: 'Synthetic client',
      created_by: userId,
    })
    await tx.insert(projects).values({
      id: otherProjectId,
      tenant_id: tenantId,
      name: 'Synthetic second draft project',
      client: 'Synthetic client',
      created_by: userId,
    })
    await tx.insert(boms).values({
      id: bomId,
      tenant_id: tenantId,
      project_id: projectId,
      created_by: userId,
      approved_by: userId,
      approved_at: new Date('2026-09-13T00:00:00.000Z'),
      label: 'Synthetic approved BOQ source',
      status: 'approved',
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
    await tx.insert(bomLineItems).values({
      id: secondBomLineItemId,
      tenant_id: tenantId,
      bom_id: bomId,
      description: 'Synthetic labour baseline',
      unit: 'lot',
      quantity: 1,
      unit_cost_cents: 50_000,
      line_total_cents: 50_000,
    })
    await tx.insert(costCodes).values([
      {
        id: costCodeId,
        tenant_id: tenantId,
        code: 'MAT-SYNTHETIC',
        name: 'Synthetic materials',
        category: 'material',
        created_by: userId,
      },
      {
        id: secondCostCodeId,
        tenant_id: tenantId,
        code: 'LAB-SYNTHETIC-SECOND',
        name: 'Synthetic labour second',
        category: 'labour',
        created_by: userId,
      },
    ])
    if (budgetId && budgetLineId) {
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
        revision_reason: 'Synthetic initial controlled draft',
        created_by: userId,
      })
      await tx.insert(projectBudgetLines).values({
        id: budgetLineId,
        tenant_id: tenantId,
        project_budget_id: budgetId,
        cost_code_id: costCodeId,
        bom_line_item_id: bomLineItemId,
        line_number: 1,
        description: 'Synthetic materials baseline',
        amount_cents: 100_000,
      })
      if (secondBudgetLineId) {
        await tx.insert(projectBudgetLines).values({
          id: secondBudgetLineId,
          tenant_id: tenantId,
          project_budget_id: budgetId,
          cost_code_id: secondCostCodeId,
          bom_line_item_id: secondBomLineItemId,
          line_number: 2,
          description: 'Synthetic labour baseline',
          amount_cents: 50_000,
        })
      }
    }
  })

  boundary.profile.mockResolvedValue({
    user: { id: userId },
    tenantId,
    role: 'admin',
    email: `${userId}@integration.test`,
    fullName: 'Synthetic budget editor',
  })

  const snapshot = async () => ({
    costCodes: await db
      .select()
      .from(costCodes)
      .where(eq(costCodes.tenant_id, tenantId))
      .orderBy(asc(costCodes.id)),
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
    userId,
    projectId,
    otherProjectId,
    bomId,
    bomLineItemId,
    secondBomLineItemId,
    costCodeId,
    secondCostCodeId,
    budgetId,
    budgetLineId,
    secondBudgetLineId,
    loadDraft: (canReadBom: boolean) =>
      loadBudgetDraft(tenantId, projectId, budgetId ?? '', canReadBom),
    snapshot,
  }
}

function failSemanticAuditOnce(): void {
  vi.spyOn(audit, 'writeAuditLog').mockImplementationOnce(async () => {
    throw new Error('Synthetic budget draft semantic audit failure')
  })
  vi.spyOn(audit, 'writeAuditLogInTransaction').mockImplementationOnce(async () => {
    throw new Error('Synthetic budget draft semantic audit failure')
  })
}

function costCodeForm(fixture: Fixture): FormData {
  return costCodeFormWith(fixture)
}

function costCodeFormWith(
  fixture: Fixture,
  options: { projectId?: string; requestId?: string; code?: string; name?: string } = {},
): FormData {
  const form = new FormData()
  form.set('project_id', options.projectId ?? fixture.projectId)
  form.set('code', options.code ?? 'LAB-SYNTHETIC')
  form.set('name', options.name ?? 'Synthetic labour')
  form.set('category', 'labour')
  form.set('request_id', options.requestId ?? randomUUID())
  return form
}

function createBudgetForm(fixture: Fixture): FormData {
  const form = new FormData()
  form.set('project_id', fixture.projectId)
  form.set('source_bom_id', fixture.bomId)
  form.set('control_mode', 'block')
  form.set('tolerance_bps', '0')
  form.set('currency', 'PHP')
  form.set('effective_from', '2026-09-13')
  form.set('revision_reason', 'Synthetic draft creation')
  form.set('request_id', randomUUID())
  return form
}

async function expectedVersion(fixture: Fixture): Promise<string> {
  const draft = await fixture.loadDraft(true)
  if (!draft) throw new Error('Budget fixture row is missing its draft version')
  return draft.version
}

async function saveBudgetForm(
  fixture: Fixture,
  options: {
    requestId?: string
    projectId?: string
    includeSecondLine?: boolean
    secondLineClientKey?: string
    secondLineId?: string
    amountPhp?: string
    description?: string
    expectedVersion?: string
    omitExpectedVersion?: boolean
    omitBomAssociation?: boolean
  } = {},
): Promise<FormData> {
  if (!fixture.budgetId || !fixture.budgetLineId) {
    throw new Error('Budget fixture is missing its draft line')
  }
  const lines: Array<Record<string, string | null>> = [
    {
      id: fixture.budgetLineId,
      costCodeId: fixture.costCodeId,
      description: options.description ?? 'Synthetic edited materials',
      amountPhp: options.amountPhp ?? '125.00',
    },
  ]
  if (!options.omitBomAssociation) {
    lines[0]!.bomLineItemId = fixture.bomLineItemId
  }
  if (options.includeSecondLine) {
    const secondLine: Record<string, string | null> = {
      clientKey: options.secondLineClientKey ?? randomUUID(),
      costCodeId: fixture.secondCostCodeId,
      description: 'Synthetic newly inserted labour',
      amountPhp: '75.00',
    }
    if (!options.omitBomAssociation) {
      secondLine.bomLineItemId = fixture.secondBomLineItemId
    }
    if (options.secondLineId) secondLine.id = options.secondLineId
    lines.push(secondLine)
  }
  const form = new FormData()
  form.set('project_id', options.projectId ?? fixture.projectId)
  form.set('budget_id', fixture.budgetId)
  form.set('control_mode', 'warn')
  form.set('tolerance_bps', '100')
  form.set('currency', 'PHP')
  form.set('effective_from', '2026-09-14')
  form.set('revision_reason', 'Synthetic draft edit')
  form.set('request_id', options.requestId ?? randomUUID())
  if (!options.omitExpectedVersion) {
    form.set(
      'expected_version',
      options.expectedVersion ?? (await expectedVersion(fixture)),
    )
  }
  form.set('lines', JSON.stringify(lines))
  if (!options.omitBomAssociation) form.set('source_bom_id', fixture.bomId)
  return form
}

type DraftCommand = 'cost-code' | 'create-budget' | 'save'
type StaleAuthority = 'suspended' | 'demoted' | 'inactive-tenant'

async function invokeDraftCommand(
  fixture: Fixture,
  command: DraftCommand,
): Promise<unknown> {
  if (command === 'cost-code') return createCostCode(costCodeForm(fixture))
  if (command === 'create-budget') {
    return createProjectBudget(createBudgetForm(fixture))
  }
  return saveProjectBudget(await saveBudgetForm(fixture))
}

async function markAuthorityStale(
  fixture: Fixture,
  state: StaleAuthority,
): Promise<void> {
  const changed = {
    status_reason: `Synthetic ${state} draft authority`,
    status_changed_at: new Date(),
    status_changed_by: fixture.userId,
  }
  if (state === 'suspended') {
    await db
      .update(users)
      .set({ account_status: 'suspended', ...changed })
      .where(eq(users.id, fixture.userId))
  } else if (state === 'demoted') {
    await db
      .update(users)
      .set({ role: 'viewer', ...changed })
      .where(eq(users.id, fixture.userId))
  } else {
    await db
      .update(tenants)
      .set({ status: 'suspended', ...changed })
      .where(eq(tenants.id, fixture.tenantId))
  }
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
        pg_catalog.hashtextextended(
          ${tenantId}::uuid::text || ':' || ${projectId}::uuid::text,
          0
        )
      )
    `)
    entered()
    await gate
  })
  return { ready, release, pid: () => pid, done }
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

(enabled ? describe : describe.skip)('Mounted budget draft actions with real PostgreSQL and audit', () => {
  it.each(['cost-code', 'create-budget'] as const)(
    'replays the exact keyed %s creation and rejects changed data under the same key',
    async operation => {
      const fixture = await seedFixture()
      const form = operation === 'cost-code' ? costCodeForm(fixture) : createBudgetForm(fixture)
      const invoke = operation === 'cost-code' ? createCostCode : createProjectBudget
      const first = await invoke(form)
      expect(first).toMatchObject({ ok: true })
      const committed = await fixture.snapshot()
      expect(await invoke(form)).toEqual(first)
      expect(await fixture.snapshot()).toEqual(committed)
      form.set(operation === 'cost-code' ? 'name' : 'revision_reason', 'Changed request payload')
      const mismatch = await invoke(form)
      expect(mismatch).toMatchObject({ error: expect.stringContaining('different draft data') })
      expect(mismatch).not.toHaveProperty('unconfirmed')
      expect(await fixture.snapshot()).toEqual(committed)
    },
  )

  it('rolls back a cost-code insert when semantic audit fails', async () => {
    const fixture = await seedFixture()
    const before = await fixture.snapshot()
    failSemanticAuditOnce()

    const result = await createCostCode(costCodeForm(fixture))

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(await fixture.snapshot()).toEqual(before)
  })

  it('rolls back a new budget when semantic audit fails', async () => {
    const fixture = await seedFixture()
    const before = await fixture.snapshot()
    failSemanticAuditOnce()

    const result = await createProjectBudget(createBudgetForm(fixture))

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(await fixture.snapshot()).toEqual(before)
  })

  it('rolls back draft header and line changes when semantic audit fails', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const before = await fixture.snapshot()
    failSemanticAuditOnce()

    const result = await saveProjectBudget(await saveBudgetForm(fixture))

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(await fixture.snapshot()).toEqual(before)
  })

  it.each(['cost-code', 'create-budget', 'save'] as const)(
    'returns a committed success with a refresh warning for %s',
    async command => {
      const fixture = await seedFixture({ withBudget: command === 'save' })
      boundary.refresh.mockImplementationOnce(() => {
        throw new Error('Synthetic draft refresh failure')
      })

      const result = await invokeDraftCommand(fixture, command)

      expect(result).toMatchObject({
        ok: true,
        id: expect.any(String),
        refreshWarning: expect.any(String),
      })
    },
  )

  it.each([
    ['cost-code', 'suspended'],
    ['cost-code', 'demoted'],
    ['cost-code', 'inactive-tenant'],
    ['create-budget', 'suspended'],
    ['create-budget', 'demoted'],
    ['create-budget', 'inactive-tenant'],
    ['save', 'suspended'],
    ['save', 'demoted'],
    ['save', 'inactive-tenant'],
  ] as const)(
    'rejects %s when current %s authority is stale',
    async (command, state) => {
      const fixture = await seedFixture({ withBudget: command === 'save' })
      await markAuthorityStale(fixture, state)
      const before = await fixture.snapshot()

      const result = await invokeDraftCommand(fixture, command)

      expect(result).toMatchObject({ error: expect.any(String) })
      expect(await fixture.snapshot()).toEqual(before)
      expect(boundary.refresh).not.toHaveBeenCalled()
    },
  )

  it.each(['cost-code', 'create-budget', 'save'] as const)(
    'rejects a foreign-tenant/project %s command without mutation',
    async command => {
      const fixture = await seedFixture({ withBudget: command === 'save' })
      const foreign = await seedFixture({ withBudget: command === 'save' })
      const before = await foreign.snapshot()
      boundary.profile.mockResolvedValue({
        user: { id: fixture.userId },
        tenantId: fixture.tenantId,
        role: 'admin',
        email: `${fixture.userId}@integration.test`,
        fullName: 'Synthetic foreign-scope actor',
      })

      const result = command === 'cost-code'
        ? await createCostCode(costCodeForm(foreign))
        : command === 'create-budget'
          ? await createProjectBudget(createBudgetForm(foreign))
          : await saveProjectBudget(await saveBudgetForm(foreign))

      expect(result).toMatchObject({ error: expect.any(String) })
      expect(await foreign.snapshot()).toEqual(before)
      expect(await fixture.snapshot()).not.toEqual(before)
    },
  )

  it('rejects a legacy save that omits the optimistic concurrency version', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const before = await fixture.snapshot()
    const form = await saveBudgetForm(fixture)
    form.delete('expected_version')

    const result = await saveProjectBudget(form)

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(await fixture.snapshot()).toEqual(before)
  })

  it('replays a keyed save after a later save without regenerating line identities', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const requestId = randomUUID()
    const clientKey = randomUUID()
    const loadedVersion = await expectedVersion(fixture)
    const firstForm = await saveBudgetForm(fixture, {
      requestId,
      expectedVersion: loadedVersion,
      includeSecondLine: true,
      secondLineClientKey: clientKey,
    })

    // Treat the first response as lost by retaining only the command for
    // reconciliation after a later editor command commits.
    const first = await saveProjectBudget(firstForm)
    expect(first).toMatchObject({
      ok: true,
      id: fixture.budgetId,
      receipt: {
        operation: 'save_draft',
        requestId,
        expectedVersion: loadedVersion,
        resultVersion: expect.any(String),
        lines: expect.arrayContaining([
          expect.objectContaining({ clientKey, id: expect.any(String) }),
        ]),
      },
    })
    if (!first.ok) throw new Error('Expected the first keyed save to succeed')
    const afterFirst = await fixture.snapshot()
    const insertedAfterFirst = afterFirst.lines.find(
      line => line.cost_code_id === fixture.secondCostCodeId,
    )
    if (!insertedAfterFirst) throw new Error('Expected the first save to insert a second line')

    const later = await saveProjectBudget(
      await saveBudgetForm(fixture, {
        requestId: randomUUID(),
        includeSecondLine: true,
        secondLineId: insertedAfterFirst.id,
        secondLineClientKey: clientKey,
        amountPhp: '130.00',
        description: 'Synthetic later editor change',
      }),
    )
    expect(later).toMatchObject({ ok: true })
    const afterLater = await fixture.snapshot()

    const replay = await saveProjectBudget(firstForm)

    expect(replay).toEqual(first)
    expect(await fixture.snapshot()).toEqual(afterLater)
    const insertedAfterReplay = afterLater.lines.find(
      line => line.id === insertedAfterFirst.id,
    )
    expect(insertedAfterReplay).toMatchObject({
      id: insertedAfterFirst.id,
      created_at: insertedAfterFirst.created_at,
    })
    expect(afterLater.audit.length).toBeGreaterThan(afterFirst.audit.length)
  })

  it('replays a keyed save after submission without reapplying stale draft data', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const requestId = randomUUID()
    const firstForm = await saveBudgetForm(fixture, {
      requestId,
      includeSecondLine: true,
    })
    const first = await saveProjectBudget(firstForm)
    expect(first).toMatchObject({ ok: true, receipt: { requestId } })
    if (!first.ok) throw new Error('Expected the keyed save to succeed')

    const submitted = await submitProjectBudget(fixture.projectId, fixture.budgetId!)
    expect(submitted).toMatchObject({
      ok: true,
      receipt: { operation: 'submit', status: 'pending_approval' },
    })
    const afterSubmit = await fixture.snapshot()

    const replay = await saveProjectBudget(firstForm)

    expect(replay).toEqual(first)
    expect(await fixture.snapshot()).toEqual(afterSubmit)
  })

  it('rejects a changed save payload under an already-used request key', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const requestId = randomUUID()
    const loadedVersion = await expectedVersion(fixture)
    const firstForm = await saveBudgetForm(fixture, {
      requestId,
      expectedVersion: loadedVersion,
    })
    const first = await saveProjectBudget(firstForm)
    expect(first).toMatchObject({ ok: true, receipt: { requestId } })
    const afterFirst = await fixture.snapshot()

    const changed = await saveProjectBudget(
      await saveBudgetForm(fixture, {
        requestId,
        expectedVersion: loadedVersion,
        description: 'Synthetic changed keyed payload',
      }),
    )

    expect(changed).toMatchObject({
      error: expect.stringContaining('already used with different draft data'),
    })
    expect(await fixture.snapshot()).toEqual(afterFirst)
  })

  it('keeps BOM fields hidden for Finance and rejects a stale hidden-BOM editor', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const hiddenDraft = await fixture.loadDraft(false)
    const visibleDraft = await fixture.loadDraft(true)
    expect(hiddenDraft).toMatchObject({
      id: fixture.budgetId,
      sourceBomId: null,
      lines: [{ id: fixture.budgetLineId, bomLineItemId: null }],
    })
    expect(visibleDraft).toMatchObject({
      id: fixture.budgetId,
      sourceBomId: fixture.bomId,
      lines: [{ id: fixture.budgetLineId, bomLineItemId: fixture.bomLineItemId }],
    })
    expect(hiddenDraft?.version).toBe(visibleDraft?.version)
    if (!hiddenDraft) throw new Error('Expected a hidden draft snapshot')

    await db
      .update(users)
      .set({ role: 'finance' })
      .where(eq(users.id, fixture.userId))
    boundary.profile.mockResolvedValue({
      user: { id: fixture.userId },
      tenantId: fixture.tenantId,
      role: 'finance',
      email: `${fixture.userId}@integration.test`,
      fullName: 'Synthetic Finance editor',
    })
    const staleForm = await saveBudgetForm(fixture, {
      requestId: randomUUID(),
      expectedVersion: hiddenDraft.version,
      omitBomAssociation: true,
      description: 'Synthetic stale hidden-BOM edit',
    })
    await db.transaction(async tx => {
      await tx.execute(sql`
        select pg_catalog.set_config(
          'app.project_budget_write',
          ${fixture.budgetId}::text,
          true
        )
      `)
      await tx
        .update(projectBudgets)
        .set({
          revision_reason: 'Synthetic concurrent Finance edit',
          updated_at: new Date(),
        })
        .where(eq(projectBudgets.id, fixture.budgetId!))
    })
    const beforeRejectedSave = await fixture.snapshot()

    const result = await saveProjectBudget(staleForm)

    expect(result).toMatchObject({
      error: expect.stringContaining('changed after you loaded it'),
    })
    expect(await fixture.snapshot()).toEqual(beforeRejectedSave)
    expect((await fixture.loadDraft(false))?.sourceBomId).toBeNull()
    expect((await fixture.loadDraft(true))?.sourceBomId).toBe(fixture.bomId)
  })

  it('preserves existing line IDs and created_at values when cost codes are swapped', async () => {
    const fixture = await seedFixture({ withBudget: true, withSecondLine: true })
    if (!fixture.budgetId || !fixture.budgetLineId || !fixture.secondBudgetLineId) {
      throw new Error('Expected a two-line draft fixture')
    }
    const before = await fixture.snapshot()
    const firstBefore = before.lines.find(line => line.id === fixture.budgetLineId)
    const secondBefore = before.lines.find(line => line.id === fixture.secondBudgetLineId)
    if (!firstBefore || !secondBefore) throw new Error('Expected both persisted draft lines')
    const form = new FormData()
    form.set('project_id', fixture.projectId)
    form.set('budget_id', fixture.budgetId)
    form.set('source_bom_id', fixture.bomId)
    form.set('control_mode', 'block')
    form.set('tolerance_bps', '0')
    form.set('currency', 'PHP')
    form.set('effective_from', '2026-09-13')
    form.set('revision_reason', 'Synthetic cost-code swap')
    form.set('request_id', randomUUID())
    form.set('expected_version', await expectedVersion(fixture))
    form.set(
      'lines',
      JSON.stringify([
        {
          id: fixture.budgetLineId,
          costCodeId: fixture.secondCostCodeId,
          bomLineItemId: fixture.bomLineItemId,
          description: 'Synthetic materials now labour code',
          amountPhp: '100.00',
        },
        {
          id: fixture.secondBudgetLineId,
          costCodeId: fixture.costCodeId,
          bomLineItemId: fixture.secondBomLineItemId,
          description: 'Synthetic labour now materials code',
          amountPhp: '50.00',
        },
      ]),
    )

    const result = await saveProjectBudget(form)

    expect(result).toMatchObject({
      ok: true,
      lines: [
        { id: fixture.budgetLineId, costCodeId: fixture.secondCostCodeId },
        { id: fixture.secondBudgetLineId, costCodeId: fixture.costCodeId },
      ],
    })
    const after = await fixture.snapshot()
    expect(after.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstBefore.id,
          cost_code_id: fixture.secondCostCodeId,
          created_at: firstBefore.created_at,
        }),
        expect.objectContaining({
          id: secondBefore.id,
          cost_code_id: fixture.costCodeId,
          created_at: secondBefore.created_at,
        }),
      ]),
    )
  })

  it('rejects a tenant-wide duplicate Cost Code on another project instead of replaying it', async () => {
    const fixture = await seedFixture()
    const requestId = randomUUID()
    const first = await createCostCode(
      costCodeFormWith(fixture, { requestId, code: 'DUPLICATE-TENANT-CODE' }),
    )
    expect(first).toMatchObject({ ok: true, id: expect.any(String) })
    const afterFirst = await fixture.snapshot()

    const duplicate = await createCostCode(
      costCodeFormWith(fixture, {
        projectId: fixture.otherProjectId,
        requestId: randomUUID(),
        code: 'DUPLICATE-TENANT-CODE',
        name: 'Synthetic duplicate on another project',
      }),
    )

    expect(duplicate).toMatchObject({ error: expect.any(String) })
    expect(duplicate).not.toHaveProperty('ok')
    expect(duplicate).not.toHaveProperty('unconfirmed')
    expect(await fixture.snapshot()).toEqual(afterFirst)
  })

  it('takes the canonical advisory lock before the budget row for an uppercase save', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const holder = holdProjectAdvisoryLock(fixture.tenantId, fixture.projectId)
    await holder.ready
    const before = await fixture.snapshot()
    const form = await saveBudgetForm(fixture, {
      projectId: fixture.projectId.toUpperCase(),
    })
    const pending = saveProjectBudget(form)
    try {
      await expectBlockedBy(holder.pid())
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
        sourceBudgetId: fixture.budgetId,
        operation: 'save_draft',
      },
    })
  })

  it('serializes a save before submit so submit cannot observe a partial draft', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const form = await saveBudgetForm(fixture, {
      description: 'Synthetic committed save before submit',
      amountPhp: '140.00',
    })
    const barrier = holdFirstSemanticAudit()
    const save = saveProjectBudget(form)
    await barrier.ready
    const submit = submitProjectBudget(fixture.projectId, fixture.budgetId!)
    try {
      await expectBlockedBy(barrier.pid())
    } finally {
      barrier.release()
    }

    const [saved, submitted] = await Promise.all([save, submit])

    expect(saved).toMatchObject({ ok: true, receipt: { operation: 'save_draft' } })
    expect(submitted).toMatchObject({
      ok: true,
      receipt: { operation: 'submit', status: 'pending_approval' },
    })
    const state = await fixture.snapshot()
    expect(state.budgets[0]).toMatchObject({
      status: 'pending_approval',
      revision_reason: 'Synthetic draft edit',
      submitted_by: fixture.userId,
    })
    expect(state.lines[0]).toMatchObject({
      description: 'Synthetic committed save before submit',
      amount_cents: 14_000,
    })
  })

  it('rejects the second concurrent editor after the first stale save commits', async () => {
    const fixture = await seedFixture({ withBudget: true })
    const loadedVersion = await expectedVersion(fixture)
    const firstForm = await saveBudgetForm(fixture, {
      requestId: randomUUID(),
      expectedVersion: loadedVersion,
      description: 'Synthetic first concurrent editor',
      amountPhp: '131.00',
    })
    const secondForm = await saveBudgetForm(fixture, {
      requestId: randomUUID(),
      expectedVersion: loadedVersion,
      description: 'Synthetic stale second editor',
      amountPhp: '132.00',
    })
    const barrier = holdFirstSemanticAudit()
    const first = saveProjectBudget(firstForm)
    await barrier.ready
    const second = saveProjectBudget(secondForm)
    try {
      await expectBlockedBy(barrier.pid())
    } finally {
      barrier.release()
    }

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult).toMatchObject({
      ok: true,
      receipt: {
        requestId: expect.any(String),
        expectedVersion: loadedVersion,
        operation: 'save_draft',
      },
    })
    expect(secondResult).toMatchObject({
      error: expect.stringContaining('changed after you loaded it'),
    })
    expect(secondResult).not.toHaveProperty('unconfirmed')
    const state = await fixture.snapshot()
    expect(state.budgets[0]).toMatchObject({
      revision_reason: 'Synthetic draft edit',
      status: 'draft',
    })
    expect(state.lines[0]).toMatchObject({
      description: 'Synthetic first concurrent editor',
      amount_cents: 13_100,
    })
  })
})
