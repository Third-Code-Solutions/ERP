import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  bomLineItems,
  boms,
  projectBudgetLines,
  projectBudgets,
  projects,
  users,
  tenants,
  auditLog,
} from '@third-code-erp/database/schema'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txFrom: vi.fn(),
  txExecute: vi.fn(),
  txDelete: vi.fn(),
  txDeleteWhere: vi.fn(),
  txDeleteReturning: vi.fn(),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
  txUpdateWhere: vi.fn(),
  txUpdateReturning: vi.fn(),
  txInsert: vi.fn(),
  txValues: vi.fn(),
  txInsertReturning: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  stampActorInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
  stampActorInTransaction: mocks.stampActorInTransaction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  approveProjectBudget,
  createProjectBudget,
  saveProjectBudget,
  submitProjectBudget,
  reviseProjectBudget,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BUDGET_ID = '44444444-4444-4444-8444-444444444444'
const BUDGET_LINE_ID = '55555555-5555-4555-8555-555555555555'
const COST_CODE_ID = '66666666-6666-4666-8666-666666666666'
const SOURCE_BOM_ID = '77777777-7777-4777-8777-777777777777'
const BOM_LINE_ID = '88888888-8888-4888-8888-888888888888'
const REPLACEMENT_BOM_LINE_ID = '99999999-9999-4999-8999-999999999999'
const SECOND_BUDGET_LINE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SECOND_COST_CODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SECOND_BOM_LINE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REQUEST_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const DRAFT_VERSION = '100:1780000000.000000'
const NEW_BUDGET_LINE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CLIENT_LINE_KEY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const FIRST_CREATED_AT = new Date('2026-08-01T00:00:00.000Z')
const SECOND_CREATED_AT = new Date('2026-08-02T00:00:00.000Z')

function budgetQuery(rows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function saveForm(lines: unknown, sourceBomId?: string): FormData {
  const form = new FormData()
  form.set('project_id', PROJECT_ID)
  form.set('budget_id', BUDGET_ID)
  form.set('request_id', REQUEST_ID)
  form.set('expected_version', DRAFT_VERSION)
  form.set('control_mode', 'warn')
  form.set('tolerance_bps', '0')
  form.set('currency', 'PHP')
  form.set('effective_from', '2026-09-02')
  form.set('revision_reason', 'Update controlled baseline')
  form.set('lines', JSON.stringify(lines))
  if (sourceBomId !== undefined) form.set('source_bom_id', sourceBomId)
  return form
}

function createForm(sourceBomId?: string): FormData {
  const form = new FormData()
  form.set('project_id', PROJECT_ID)
  form.set('control_mode', 'warn')
  form.set('tolerance_bps', '0')
  form.set('currency', 'PHP')
  form.set('effective_from', '2026-09-02')
  form.set('revision_reason', 'Initial controlled baseline')
  if (sourceBomId !== undefined) form.set('source_bom_id', sourceBomId)
  return form
}

describe('Project Budget workflow actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
    mocks.execute.mockResolvedValue([])
    mocks.writeAuditLog.mockResolvedValue(undefined)
    const query = budgetQuery([{ id: BUDGET_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.txSelect.mockImplementation((selection?: unknown) => ({ from: (table: unknown) => {
      if (table === users) return { where: () => ({ limit: () => ({ for: async () => [{ role: (await mocks.requireUserProfile()).role }] }) }) }
      if (table === tenants || table === projects) return { where: () => ({ limit: () => ({ for: async () => [{ id: table === tenants ? PROFILE.tenantId : PROJECT_ID }] }) }) }
      if (table === projectBudgets && selection === undefined) return { where: () => ({ limit: () => ({ for: async () => [{ id: BUDGET_ID, status: 'pending_approval', submitted_by: null, submitted_at: null }] }) }) }
      if (table === auditLog) return { where: () => ({ limit: async () => [] }) }
      return mocks.txFrom(table)
    } }))
    mocks.txFrom.mockImplementation((table: unknown) => ({ where: () => ({ limit: () => ({ for: async () => {
      if (table === users) return [{ role: PROFILE.role }]
      if (table === tenants) return [{ id: PROFILE.tenantId }]
      if (table === projectBudgets) return [{ id: BUDGET_ID, status: 'pending_approval', submitted_by: null, submitted_at: null }]
      throw new Error('Unexpected workflow query')
    } }) }) }))
    mocks.txExecute.mockImplementation(async statement => {
      const query = new PgDialect().sqlToQuery(statement).sql
      return query.includes('extract(epoch from updated_at)') ? [{ version: DRAFT_VERSION }] : []
    })
    mocks.txDelete.mockReturnValue({ where: mocks.txDeleteWhere })
    mocks.txDeleteWhere.mockReturnValue({
      returning: mocks.txDeleteReturning,
    })
    mocks.txDeleteReturning.mockResolvedValue([{ id: BUDGET_LINE_ID }])
    mocks.txUpdate.mockReturnValue({ set: mocks.txSet })
    mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere })
    mocks.txUpdateWhere.mockReturnValue({
      returning: mocks.txUpdateReturning,
    })
    mocks.txUpdateReturning.mockResolvedValue([{ id: BUDGET_LINE_ID }])
    mocks.txInsert.mockReturnValue({ values: mocks.txValues })
    mocks.txValues.mockReturnValue({ returning: mocks.txInsertReturning })
    mocks.txInsertReturning.mockResolvedValue([])
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          select: typeof mocks.txSelect
          execute: typeof mocks.txExecute
          delete: typeof mocks.txDelete
          update: typeof mocks.txUpdate
          insert: typeof mocks.txInsert
        }) => Promise<unknown>,
      ) =>
        callback({
          select: mocks.txSelect,
          execute: mocks.txExecute,
          delete: mocks.txDelete,
          update: mocks.txUpdate,
          insert: mocks.txInsert,
        })
    )
  })

  it('submits only through the trusted workflow after a tenant lookup', async () => {
    const result = await submitProjectBudget(PROJECT_ID, BUDGET_ID)

    expect(result).toMatchObject({ ok: true, id: BUDGET_ID, receipt: { projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, operation: 'submit', resultBudgetId: BUDGET_ID, status: 'pending_approval' } })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.stampActorInTransaction).toHaveBeenCalledWith(expect.any(Object), PROFILE.user.id)
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        entityId: BUDGET_ID,
        action: 'status_change',
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/cost/budget`
    )
  })

  it('uses the independent Finance approval capability', async () => {
    const result = await approveProjectBudget(
      PROJECT_ID,
      BUDGET_ID,
      'finance'
    )

    expect(result).toMatchObject({ ok: true, id: BUDGET_ID, receipt: { operation: 'finance' } })
    expect(mocks.execute).not.toHaveBeenCalled()
    const denied = await approveProjectBudget(PROJECT_ID, BUDGET_ID, 'commercial')
    expect(denied).toMatchObject({ error: 'Your current account cannot perform this Project Budget workflow.' })
  })

  it('rejects a forged submit operation passed as an approval lane', async () => {
    // Reflect exercises the runtime boundary without pretending the input is typed.
    const result: unknown = await Reflect.apply(approveProjectBudget, undefined, [PROJECT_ID, BUDGET_ID, 'submit'])
    expect(result).toMatchObject({ error: 'Project Budget approval lane is invalid.' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('does not promise a safe retry for an unkeyed revision with unknown outcome', async () => {
    mocks.txExecute.mockRejectedValueOnce(new Error('Synthetic connection loss'))
    expect(await reviseProjectBudget(PROJECT_ID, BUDGET_ID, 'Revised allocation')).toEqual({
      error: 'Project Budget outcome could not be confirmed. Refresh and inspect revisions before starting another revision.',
      unconfirmed: true,
    })
  })

  it('uses PostgreSQL canonical UUID text for the workflow advisory key', async () => {
    await submitProjectBudget(PROJECT_ID, BUDGET_ID)
    const dialect = new PgDialect()
    const statements = mocks.txExecute.mock.calls.map(([statement]) => dialect.sqlToQuery(statement).sql)
    expect(statements.find(statement => statement.includes('pg_advisory_xact_lock'))).toContain("::uuid::text || ':' ||")
  })

  it('fails closed when a legacy save lacks its request and version preconditions', async () => {
    const form = saveForm([])
    form.delete('request_id')
    form.delete('expected_version')
    expect(await saveProjectBudget(form)).toEqual({ error: 'Reload this draft before saving; a request key and current version are required.' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a stale draft version before any data write', async () => {
    const form = saveForm([{ costCodeId: COST_CODE_ID, description: 'Stale edit', amountPhp: '1.00' }])
    form.set('expected_version', '99:1779999999.000000')
    expect(await saveProjectBudget(form)).toEqual({ error: 'This draft changed after you loaded it. Reload before saving; your edits were not applied.' })
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
    expect(mocks.txDelete).not.toHaveBeenCalled()
  })

  it('returns a safe database control message without audit or revalidation', async () => {
    mocks.txExecute.mockRejectedValueOnce(
      new Error(
        'Project Budget creator cannot approve their own revision: internal detail'
      )
    )

    const result = await approveProjectBudget(
      PROJECT_ID,
      BUDGET_ID,
      'commercial'
    )

    expect(result).toEqual({
      error: 'Project Budget creator cannot approve their own revision',
    })
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('preserves a hidden BOM-line association for a non-BOM budget manager', async () => {
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: SOURCE_BOM_ID,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return {
          where: async () => [
            {
              id: BUDGET_LINE_ID,
              costCodeId: COST_CODE_ID,
              bomLineItemId: BOM_LINE_ID,
              lineNumber: 1,
              createdAt: FIRST_CREATED_AT,
            },
            {
              id: SECOND_BUDGET_LINE_ID,
              costCodeId: SECOND_COST_CODE_ID,
              bomLineItemId: SECOND_BOM_LINE_ID,
              lineNumber: 2,
              createdAt: SECOND_CREATED_AT,
            },
          ],
        }
      }
      throw new Error('Unexpected BOM query for a non-BOM reader')
    })

    const form = saveForm([
      {
        id: BUDGET_LINE_ID,
        costCodeId: COST_CODE_ID,
        description: 'Updated amount without hidden BOM data',
        amountPhp: '125.00',
      },
      {
        id: SECOND_BUDGET_LINE_ID,
        costCodeId: SECOND_COST_CODE_ID,
        description: 'Second retained line',
        amountPhp: '250.00',
      },
    ])
    const firstResult = await saveProjectBudget(form)
    const secondResult = await saveProjectBudget(form)

    const expectedLines = [
      { id: BUDGET_LINE_ID, costCodeId: COST_CODE_ID },
      { id: SECOND_BUDGET_LINE_ID, costCodeId: SECOND_COST_CODE_ID },
    ]
    expect(firstResult).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: expectedLines,
    })
    expect(secondResult).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: expectedLines,
    })
    expect(mocks.txFrom).not.toHaveBeenCalledWith(boms)
    expect(mocks.txFrom).not.toHaveBeenCalledWith(bomLineItems)
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ source_bom_id: SOURCE_BOM_ID })
    )
    expect(mocks.txSet).toHaveBeenCalledTimes(10)
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_code_id: COST_CODE_ID,
        bom_line_item_id: BOM_LINE_ID,
        line_number: 1,
      })
    )
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_code_id: SECOND_COST_CODE_ID,
        bom_line_item_id: SECOND_BOM_LINE_ID,
        line_number: 2,
      })
    )
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })

  it('returns a new line identity that makes the next save update it in place', async () => {
    let lineSnapshot = 0
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: null,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        lineSnapshot += 1
        return {
          where: async () =>
            lineSnapshot === 1
              ? []
              : [
                  {
                    id: NEW_BUDGET_LINE_ID,
                    costCodeId: COST_CODE_ID,
                    bomLineItemId: null,
                    lineNumber: 1,
                    createdAt: FIRST_CREATED_AT,
                  },
                ],
        }
      }
      throw new Error('Unexpected query')
    })
    mocks.txInsertReturning.mockResolvedValue([
      { id: NEW_BUDGET_LINE_ID, costCodeId: COST_CODE_ID },
    ])

    const firstResult = await saveProjectBudget(
      saveForm([
        {
          clientKey: CLIENT_LINE_KEY,
          costCodeId: COST_CODE_ID,
          description: 'New persisted line',
          amountPhp: '125.00',
        },
      ])
    )
    expect(firstResult).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [
        {
          id: NEW_BUDGET_LINE_ID,
          costCodeId: COST_CODE_ID,
          clientKey: CLIENT_LINE_KEY,
        },
      ],
    })
    if (!firstResult.ok) throw new Error('Expected the first save to succeed')

    const secondResult = await saveProjectBudget(
      saveForm([
        {
          clientKey: CLIENT_LINE_KEY,
          id: firstResult.lines[0]?.id,
          costCodeId: COST_CODE_ID,
          description: 'Updated persisted line',
          amountPhp: '150.00',
        },
      ])
    )

    expect(secondResult).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [
        {
          id: NEW_BUDGET_LINE_ID,
          costCodeId: COST_CODE_ID,
          clientKey: CLIENT_LINE_KEY,
        },
      ],
    })
    expect(mocks.txInsert).toHaveBeenCalledOnce()
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.txValues).toHaveBeenCalledWith([
      expect.not.objectContaining({ id: expect.anything() }),
    ])
    expect(mocks.txValues).toHaveBeenCalledWith([
      expect.not.objectContaining({ created_at: expect.anything() }),
    ])
  })

  it('sets scoped transaction-local guard context before an empty draft metadata save', async () => {
    const events: string[] = []
    mocks.requireUserProfile.mockResolvedValue({
      ...PROFILE,
      role: 'commercial',
    })
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => {
              events.push('locked')
              return [
                {
                  id: BUDGET_ID,
                  status: 'draft',
                  projectId: PROJECT_ID,
                  sourceBomId: null,
                },
              ]
            },
          }),
        }
      }
      if (table === projectBudgetLines) {
        return {
          where: async () => {
            events.push('snapshotted')
            return []
          },
        }
      }
      if (table === boms) {
        return {
          where: () => ({
            limit: async () => {
              events.push('bom-validated')
              return [{ id: SOURCE_BOM_ID }]
            },
          }),
        }
      }
      throw new Error('Unexpected query')
    })
    mocks.txExecute.mockImplementation(async statement => {
      const query = new PgDialect().sqlToQuery(statement)
      if (query.sql.includes('extract(epoch from updated_at)')) return [{ version: DRAFT_VERSION }]
      if (query.sql.includes('app.project_budget_write') && query.params.includes(BUDGET_ID)) events.push('context')
      return []
    })
    mocks.txUpdate.mockImplementation((table: unknown) => {
      if (table === projectBudgets) events.push('metadata')
      return { set: mocks.txSet }
    })
    mocks.txInsertReturning.mockResolvedValue([
      { id: NEW_BUDGET_LINE_ID, costCodeId: COST_CODE_ID },
    ])

    const result = await saveProjectBudget(
      saveForm(
        [
          {
            costCodeId: COST_CODE_ID,
            bomLineItemId: null,
            description: 'First controlled line',
            amountPhp: '125.00',
          },
        ],
        SOURCE_BOM_ID
      )
    )

    expect(result).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [{ id: NEW_BUDGET_LINE_ID, costCodeId: COST_CODE_ID }],
    })
    expect(events).toEqual([
      'locked',
      'snapshotted',
      'bom-validated',
      'context',
      'metadata',
    ])
    const contextQuery = mocks.txExecute.mock.calls.map(([statement]) => new PgDialect().sqlToQuery(statement))
      .find(query => query.sql.includes('app.project_budget_write') && query.params.includes(BUDGET_ID))!
    expect(contextQuery.sql).toMatch(
      /pg_catalog\.set_config\(\s*'app\.project_budget_write'/
    )
    expect(contextQuery.sql).toContain('true')
    expect(contextQuery.params).toEqual([BUDGET_ID])
  })

  it('fails closed before writes when transaction-local guard context cannot be set', async () => {
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: null,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return { where: async () => [] }
      }
      throw new Error('Unexpected query')
    })
    mocks.txExecute.mockImplementation(async statement => {
      const query = new PgDialect().sqlToQuery(statement)
      if (query.sql.includes('extract(epoch from updated_at)')) return [{ version: DRAFT_VERSION }]
      if (query.sql.includes('app.project_budget_write')) throw new Error('provider context failure')
      return []
    })

    const result = await saveProjectBudget(
      saveForm([
        {
          costCodeId: COST_CODE_ID,
          description: 'First controlled line',
          amountPhp: '125.00',
        },
      ])
    )

    expect(result).toEqual({
      error: 'Project Budget outcome could not be confirmed. Retry the unchanged request to reconcile it.',
      unconfirmed: true,
    })
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('locks the scoped draft before snapshotting and aborts a zero-row retained update', async () => {
    const events: string[] = []
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async (mode: string) => {
              expect(mode).toBe('update')
              events.push('locked')
              return [
                {
                  id: BUDGET_ID,
                  status: 'draft',
                  projectId: PROJECT_ID,
                  sourceBomId: null,
                },
              ]
            },
          }),
        }
      }
      if (table === projectBudgetLines) {
        events.push('snapshotted')
        return {
          where: async () => [
            {
              id: BUDGET_LINE_ID,
              costCodeId: COST_CODE_ID,
              bomLineItemId: null,
              lineNumber: 1,
              createdAt: FIRST_CREATED_AT,
            },
          ],
        }
      }
      throw new Error('Unexpected query')
    })
    mocks.txUpdateReturning.mockResolvedValueOnce([])

    const result = await saveProjectBudget(
      saveForm([
        {
          id: BUDGET_LINE_ID,
          costCodeId: COST_CODE_ID,
          description: 'Concurrent retained line',
          amountPhp: '125.00',
        },
      ])
    )

    expect(events).toEqual(['locked', 'snapshotted'])
    expect(result).toEqual({
      error: 'Project Budget changed during save. Please retry.',
    })
    expect(mocks.txSet).toHaveBeenCalledOnce()
    expect(mocks.txInsert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('recreates both retained identities safely for an immediate-index cost-code swap', async () => {
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: null,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return {
          where: async () => [
            {
              id: BUDGET_LINE_ID,
              costCodeId: COST_CODE_ID,
              bomLineItemId: null,
              lineNumber: 1,
              createdAt: FIRST_CREATED_AT,
            },
            {
              id: SECOND_BUDGET_LINE_ID,
              costCodeId: SECOND_COST_CODE_ID,
              bomLineItemId: null,
              lineNumber: 2,
              createdAt: SECOND_CREATED_AT,
            },
          ],
        }
      }
      throw new Error('Unexpected query')
    })
    mocks.txDeleteReturning.mockResolvedValue([
      { id: BUDGET_LINE_ID },
      { id: SECOND_BUDGET_LINE_ID },
    ])
    mocks.txInsertReturning.mockResolvedValue([
      { id: BUDGET_LINE_ID, costCodeId: SECOND_COST_CODE_ID },
      { id: SECOND_BUDGET_LINE_ID, costCodeId: COST_CODE_ID },
    ])

    const result = await saveProjectBudget(
      saveForm([
        {
          id: BUDGET_LINE_ID,
          costCodeId: SECOND_COST_CODE_ID,
          description: 'Former A now B',
          amountPhp: '125.00',
        },
        {
          id: SECOND_BUDGET_LINE_ID,
          costCodeId: COST_CODE_ID,
          description: 'Former B now A',
          amountPhp: '250.00',
        },
      ])
    )

    expect(result).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [
        { id: BUDGET_LINE_ID, costCodeId: SECOND_COST_CODE_ID },
        { id: SECOND_BUDGET_LINE_ID, costCodeId: COST_CODE_ID },
      ],
    })
    expect(mocks.txDelete).toHaveBeenCalledOnce()
    expect(mocks.txSet).toHaveBeenCalledOnce()
    expect(mocks.txValues).toHaveBeenCalledWith([
      expect.objectContaining({
        id: BUDGET_LINE_ID,
        created_at: FIRST_CREATED_AT,
        cost_code_id: SECOND_COST_CODE_ID,
        line_number: 1,
      }),
      expect.objectContaining({
        id: SECOND_BUDGET_LINE_ID,
        created_at: SECOND_CREATED_AT,
        cost_code_id: COST_CODE_ID,
        line_number: 2,
      }),
    ])
  })

  it('allows an authorized BOM reader to explicitly clear associations', async () => {
    mocks.requireUserProfile.mockResolvedValue({
      ...PROFILE,
      role: 'commercial',
    })
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: SOURCE_BOM_ID,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return {
          where: async () => [
            {
              id: BUDGET_LINE_ID,
              costCodeId: COST_CODE_ID,
              bomLineItemId: BOM_LINE_ID,
              lineNumber: 1,
              createdAt: FIRST_CREATED_AT,
            },
          ],
        }
      }
      throw new Error('Explicit clear must not query a cleared BOM association')
    })

    const result = await saveProjectBudget(
      saveForm(
        [
          {
            id: BUDGET_LINE_ID,
            costCodeId: COST_CODE_ID,
            bomLineItemId: null,
            description: 'Explicitly unlinked line',
            amountPhp: '125.00',
          },
        ],
        ''
      )
    )

    expect(result).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [{ id: BUDGET_LINE_ID, costCodeId: COST_CODE_ID }],
    })
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ source_bom_id: null })
    )
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_code_id: COST_CODE_ID,
        bom_line_item_id: null,
        line_number: 1,
      })
    )
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })

  it('inserts a new no-ID line without inheriting a removed line association', async () => {
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: SOURCE_BOM_ID,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return {
          where: async () => [
            {
              id: BUDGET_LINE_ID,
              costCodeId: COST_CODE_ID,
              bomLineItemId: BOM_LINE_ID,
              lineNumber: 1,
              createdAt: FIRST_CREATED_AT,
            },
          ],
        }
      }
      throw new Error('Unexpected BOM query for a non-BOM reader')
    })

    mocks.txInsertReturning.mockResolvedValue([
      { id: NEW_BUDGET_LINE_ID, costCodeId: COST_CODE_ID },
    ])

    const result = await saveProjectBudget(
      saveForm([
        {
          costCodeId: COST_CODE_ID,
          description: 'Replacement line without persisted identity',
          amountPhp: '125.00',
        },
      ])
    )

    expect(result).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [{ id: NEW_BUDGET_LINE_ID, costCodeId: COST_CODE_ID }],
    })
    expect(mocks.txDelete).toHaveBeenCalledWith(projectBudgetLines)
    expect(mocks.txValues).toHaveBeenCalledWith([
      expect.objectContaining({
        cost_code_id: COST_CODE_ID,
        bom_line_item_id: null,
        line_number: 1,
      }),
    ])
  })

  it('allows an authorized BOM reader to replace a validated association', async () => {
    mocks.requireUserProfile.mockResolvedValue({
      ...PROFILE,
      role: 'commercial',
    })
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: SOURCE_BOM_ID,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return {
          where: async () => [
            {
              id: BUDGET_LINE_ID,
              costCodeId: COST_CODE_ID,
              bomLineItemId: BOM_LINE_ID,
              lineNumber: 1,
              createdAt: FIRST_CREATED_AT,
            },
          ],
        }
      }
      if (table === boms) {
        return { where: () => ({ limit: async () => [{ id: SOURCE_BOM_ID }] }) }
      }
      if (table === bomLineItems) {
        return {
          where: async () => [
            { id: REPLACEMENT_BOM_LINE_ID, bomId: SOURCE_BOM_ID },
          ],
        }
      }
      throw new Error('Unexpected query')
    })

    const result = await saveProjectBudget(
      saveForm(
        [
          {
            id: BUDGET_LINE_ID,
            costCodeId: COST_CODE_ID,
            bomLineItemId: REPLACEMENT_BOM_LINE_ID,
            description: 'Validated replacement association',
            amountPhp: '125.00',
          },
        ],
        SOURCE_BOM_ID
      )
    )

    expect(result).toEqual({
      ok: true,
      id: BUDGET_ID,
      receipt: expect.objectContaining({ operation: 'save_draft', projectId: PROJECT_ID, sourceBudgetId: BUDGET_ID, resultId: BUDGET_ID, requestId: REQUEST_ID, expectedVersion: DRAFT_VERSION, resultVersion: DRAFT_VERSION }),
      lines: [{ id: BUDGET_LINE_ID, costCodeId: COST_CODE_ID }],
    })
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_code_id: COST_CODE_ID,
        bom_line_item_id: REPLACEMENT_BOM_LINE_ID,
        line_number: 1,
      })
    )
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })

  it('rejects a persisted line ID outside the tenant-scoped draft', async () => {
    const otherLineId = '99999999-9999-4999-8999-999999999999'
    mocks.txFrom.mockImplementation((table: unknown) => {
      if (table === projectBudgets) {
        return {
          where: () => ({
            for: async () => [
              {
                id: BUDGET_ID,
                status: 'draft',
                projectId: PROJECT_ID,
                sourceBomId: SOURCE_BOM_ID,
              },
            ],
          }),
        }
      }
      if (table === projectBudgetLines) {
        return { where: async () => [] }
      }
      throw new Error('Unexpected query')
    })

    const result = await saveProjectBudget(
      saveForm([
        {
          id: otherLineId,
          costCodeId: COST_CODE_ID,
          description: 'Cross-draft line',
          amountPhp: '125.00',
        },
      ])
    )

    expect(result).toEqual({
      error: 'Project Budget line does not belong to this draft',
    })
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })

  it('rejects BOM association input forged by a non-BOM reader', async () => {
    const result = await saveProjectBudget(
      saveForm([
        {
          id: BUDGET_LINE_ID,
          costCodeId: COST_CODE_ID,
          bomLineItemId: BOM_LINE_ID,
          description: 'Forged association',
          amountPhp: '125.00',
        },
      ])
    )

    expect(result).toEqual({
      error: 'You do not have permission to manage this Project Budget.',
    })
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })

  it('rejects a source BOM forged during creation by a Finance caller', async () => {
    const result = await createProjectBudget(createForm(SOURCE_BOM_ID))

    expect(result).toEqual({
      error: 'You do not have permission to manage this Project Budget.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })

  it('rejects an authorized source BOM from another project', async () => {
    mocks.requireUserProfile.mockResolvedValue({
      ...PROFILE,
      role: 'commercial',
    })
    const from = vi.fn((table: unknown) => {
      if (table === projects) {
        return { where: () => ({ limit: async () => [{ id: PROJECT_ID }] }) }
      }
      if (table === boms) {
        return { where: () => ({ limit: async () => [] }) }
      }
      throw new Error('Unexpected query')
    })
    mocks.txFrom.mockImplementation(from)

    const result = await createProjectBudget(createForm(SOURCE_BOM_ID))

    expect(result).toEqual({
      error: 'Project Budget source BOM must belong to its project',
    })
    expect(from).toHaveBeenCalledWith(boms)
    expect(mocks.txInsert).not.toHaveBeenCalled()
  })
})
