import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  bomLineItems,
  boms,
  projectBudgetLines,
  projectBudgets,
  projects,
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
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  approveProjectBudget,
  createProjectBudget,
  saveProjectBudget,
  submitProjectBudget,
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
    mocks.txSelect.mockReturnValue({ from: mocks.txFrom })
    mocks.txExecute.mockResolvedValue([])
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

    expect(result).toEqual({ ok: true, id: BUDGET_ID })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'budget.manage'
    )
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
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

    expect(result).toEqual({ ok: true, id: BUDGET_ID })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'budget.approve_finance'
    )
    expect(mocks.execute).toHaveBeenCalledOnce()
  })

  it('returns a safe database control message without audit or revalidation', async () => {
    mocks.execute.mockRejectedValue(
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
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
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
      lines: expectedLines,
    })
    expect(secondResult).toEqual({
      ok: true,
      id: BUDGET_ID,
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
    mocks.txExecute.mockImplementation(async () => {
      events.push('context')
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
      lines: [{ id: NEW_BUDGET_LINE_ID, costCodeId: COST_CODE_ID }],
    })
    expect(events).toEqual([
      'locked',
      'snapshotted',
      'bom-validated',
      'context',
      'metadata',
    ])
    expect(mocks.txExecute).toHaveBeenCalledOnce()
    const contextQuery = new PgDialect().sqlToQuery(
      mocks.txExecute.mock.calls[0]?.[0]
    )
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
    mocks.txExecute.mockRejectedValue(new Error('provider context failure'))

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
      error: 'Project Budget action failed. No changes were saved.',
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
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a source BOM forged during creation by a Finance caller', async () => {
    const result = await createProjectBudget(createForm(SOURCE_BOM_ID))

    expect(result).toEqual({
      error: 'You do not have permission to manage this Project Budget.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
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
    mocks.select.mockReturnValue({ from })

    const result = await createProjectBudget(createForm(SOURCE_BOM_ID))

    expect(result).toEqual({
      error: 'Project Budget source BOM must belong to its project',
    })
    expect(from).toHaveBeenCalledWith(projects)
    expect(from).toHaveBeenCalledWith(boms)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
