import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { normalizeBudgetWorkflowUuid } from './budget-workflow-receipts'
import {
  hasUnsavedDraftEdits,
  mergeBudgetEditorLines,
  reconcileSavedLineIdentities,
  validateBudgetWorkflowReceipt,
} from './budget-workspace'

const CLIENT_KEY = '11111111-1111-4111-8111-111111111111'
const SERVER_ID = '22222222-2222-4222-8222-222222222222'
const COST_CODE_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const BUDGET_ID = '55555555-5555-4555-8555-555555555555'
const REVISION_ID = '66666666-6666-4666-8666-666666666666'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'

describe('BudgetWorkspace saved-line reconciliation', () => {
  it('collapses a refreshed server row and its just-confirmed local row into one identity', () => {
    const common = { costCodeId: COST_CODE_ID, bomLineItemId: '', description: 'Saved scope', amountPhp: '125.00' }
    expect(reconcileSavedLineIdentities([
      { ...common, key: SERVER_ID, persistedId: SERVER_ID },
      { ...common, key: CLIENT_KEY, persistedId: null },
    ], [{ id: SERVER_ID, clientKey: CLIENT_KEY }])).toEqual([
      { ...common, key: CLIENT_KEY, persistedId: SERVER_ID },
    ])
  })
  it('uses the same UUID acceptance as the action boundary and normalizes case', () => {
    for (const value of [
      PROJECT_ID,
      'AAAAAAAA-AAAA-7AAA-8AAA-AAAAAAAAAAAA',
      '00000000-0000-0000-0000-000000000000',
      'aaaaaaaa-aaaa-4aaa-1aaa-aaaaaaaaaaaa',
      'not-a-uuid',
    ]) {
      expect(normalizeBudgetWorkflowUuid(value)).toBe(
        z.string().uuid().safeParse(value).success ? value.toLowerCase() : null
      )
    }
  })
  it('binds a newly inserted server identity to its stable client row key', () => {
    const reconciled = reconcileSavedLineIdentities(
      [
        {
          key: CLIENT_KEY,
          persistedId: null,
          costCodeId: COST_CODE_ID,
          bomLineItemId: '',
          description: 'New line',
          amountPhp: '125.00',
        },
      ],
      [{ id: SERVER_ID, clientKey: CLIENT_KEY }]
    )

    expect(reconciled).toEqual([
      {
        key: CLIENT_KEY,
        persistedId: SERVER_ID,
        costCodeId: COST_CODE_ID,
        bomLineItemId: '',
        description: 'New line',
        amountPhp: '125.00',
      },
    ])
  })

  it('does not attach an unbound returned identity to another editor row', () => {
    const reconciled = reconcileSavedLineIdentities(
      [
        {
          key: CLIENT_KEY,
          persistedId: null,
          costCodeId: COST_CODE_ID,
          bomLineItemId: '',
          description: 'New line',
          amountPhp: '125.00',
        },
      ],
      [{ id: SERVER_ID }]
    )

    expect(reconciled[0]?.persistedId).toBeNull()
  })
})

describe('BudgetWorkspace unsaved-edit detection after a save', () => {
  const savedDraft = {
    version: 'v1',
    id: BUDGET_ID,
    revision: 1,
    sourceBomId: null,
    controlMode: 'warn' as const,
    toleranceBps: 50,
    currency: 'PHP',
    effectiveFrom: '2026-11-01',
    reason: 'Initial baseline',
    lines: [
      {
        id: SERVER_ID,
        costCodeId: COST_CODE_ID,
        bomLineItemId: null,
        description: 'Saved scope',
        amountCents: 150_000,
      },
    ],
  }
  const savedSettings = {
    controlMode: 'warn' as const,
    toleranceBps: '50',
    currency: 'PHP',
    effectiveFrom: '2026-11-01',
    reason: 'Initial baseline',
  }
  const savedLine = {
    key: CLIENT_KEY,
    persistedId: SERVER_ID,
    costCodeId: COST_CODE_ID,
    bomLineItemId: '',
    description: 'Saved scope',
    amountPhp: '1500.00',
  }

  it('treats the freshly loaded draft as saved', () => {
    expect(hasUnsavedDraftEdits(savedDraft, [savedLine], '', savedSettings)).toBe(false)
  })

  it.each(['1500', '1500.0', '01500.00', ' 1500 '])(
    'treats amount %s as the same saved amount as 1500.00',
    (amountPhp) => {
      expect(
        hasUnsavedDraftEdits(savedDraft, [{ ...savedLine, amountPhp }], '', savedSettings)
      ).toBe(false)
    }
  )

  it.each(['1500.01', '1499', '1,500', '', 'abc'])(
    'still reports amount %s as an unsaved change',
    (amountPhp) => {
      expect(
        hasUnsavedDraftEdits(savedDraft, [{ ...savedLine, amountPhp }], '', savedSettings)
      ).toBe(true)
    }
  )

  it('ignores whitespace, currency case and tolerance padding the server normalises', () => {
    expect(
      hasUnsavedDraftEdits(
        savedDraft,
        [{ ...savedLine, description: '  Saved scope ' }],
        '',
        {
          ...savedSettings,
          toleranceBps: '050',
          currency: ' php ',
          reason: ' Initial baseline  ',
        }
      )
    ).toBe(false)
  })

  it('still reports real text, setting, line-count and source changes', () => {
    expect(
      hasUnsavedDraftEdits(savedDraft, [{ ...savedLine, description: 'Other scope' }], '', savedSettings)
    ).toBe(true)
    expect(
      hasUnsavedDraftEdits(savedDraft, [savedLine], '', { ...savedSettings, reason: 'Changed reason' })
    ).toBe(true)
    expect(
      hasUnsavedDraftEdits(savedDraft, [savedLine], '', { ...savedSettings, toleranceBps: '75' })
    ).toBe(true)
    expect(hasUnsavedDraftEdits(savedDraft, [savedLine, { ...savedLine, key: SERVER_ID, persistedId: null }], '', savedSettings)).toBe(true)
    expect(hasUnsavedDraftEdits(savedDraft, [savedLine], REVISION_ID, savedSettings)).toBe(true)
  })

  it('does not keep a typed-but-equal line when the server removed it', () => {
    const typed = { ...savedLine, amountPhp: '1500' }
    expect(mergeBudgetEditorLines([typed], [savedLine], [])).toEqual([])
  })
})

describe('BudgetWorkspace workflow receipt validation', () => {
  it('accepts a scoped lane receipt only when id and persisted status agree', () => {
    const result = validateBudgetWorkflowReceipt(
      {
        ok: true,
        id: BUDGET_ID,
        receipt: {
          projectId: PROJECT_ID,
          sourceBudgetId: BUDGET_ID,
          operation: 'commercial',
          resultBudgetId: BUDGET_ID,
          status: 'pending_approval',
        },
      },
      {
        projectId: PROJECT_ID,
        sourceBudgetId: BUDGET_ID,
        operation: 'commercial',
      }
    )

    expect(result).toEqual({
      projectId: PROJECT_ID,
      sourceBudgetId: BUDGET_ID,
      operation: 'commercial',
      resultBudgetId: BUDGET_ID,
      status: 'pending_approval',
    })
  })

  it('rejects malformed or wrong-project receipts before showing success', () => {
    expect(
      validateBudgetWorkflowReceipt(
        {
          ok: true,
          id: BUDGET_ID,
          receipt: {
            projectId: '88888888-8888-4888-8888-888888888888',
            sourceBudgetId: BUDGET_ID,
            operation: 'commercial',
            resultBudgetId: BUDGET_ID,
            status: 'pending_approval',
          },
        },
        {
          projectId: PROJECT_ID,
          sourceBudgetId: BUDGET_ID,
          operation: 'commercial',
        }
      )
    ).toBeNull()

    expect(
      validateBudgetWorkflowReceipt(
        {
          ok: true,
          id: REVISION_ID,
          receipt: {
            projectId: PROJECT_ID,
            sourceBudgetId: BUDGET_ID,
            operation: 'revise',
            resultBudgetId: REVISION_ID,
            status: 'approved',
          },
        },
        {
          projectId: PROJECT_ID,
          sourceBudgetId: BUDGET_ID,
          operation: 'revise',
          requestId: REQUEST_ID,
        }
      )
    ).toBeNull()
  })

  it('requires the same revision request id on a replayed receipt', () => {
    const command = {
      projectId: PROJECT_ID,
      sourceBudgetId: BUDGET_ID,
      operation: 'revise' as const,
      requestId: REQUEST_ID,
    }
    const receipt = {
      ok: true,
      id: REVISION_ID,
      receipt: {
        projectId: PROJECT_ID,
        sourceBudgetId: BUDGET_ID,
        operation: 'revise',
        resultBudgetId: REVISION_ID,
        status: 'draft',
        requestId: REQUEST_ID,
      },
    }

    expect(validateBudgetWorkflowReceipt(receipt, command)?.requestId).toBe(
      REQUEST_ID
    )
    expect(
      validateBudgetWorkflowReceipt(receipt, {
        ...command,
        requestId: '99999999-9999-4999-8999-999999999999',
      })
    ).toBeNull()
  })

  it('accepts durable replay statuses and compares UUIDs case-insensitively', () => {
    for (const status of ['approved', 'rejected', 'superseded'] as const) {
      expect(
        validateBudgetWorkflowReceipt(
          {
            ok: true,
            id: BUDGET_ID,
            receipt: {
              projectId: PROJECT_ID,
              sourceBudgetId: BUDGET_ID,
              operation: 'submit',
              resultBudgetId: BUDGET_ID,
              status,
            },
          },
          {
            projectId: PROJECT_ID.toUpperCase(),
            sourceBudgetId: BUDGET_ID.toUpperCase(),
            operation: 'submit',
          }
        )?.status
      ).toBe(status)
    }

    expect(
      validateBudgetWorkflowReceipt(
        {
          ok: true,
          id: REVISION_ID,
          receipt: {
            projectId: PROJECT_ID,
            sourceBudgetId: BUDGET_ID,
            operation: 'revise',
            resultBudgetId: REVISION_ID,
            status: 'superseded',
            requestId: REQUEST_ID,
          },
        },
        {
          projectId: PROJECT_ID,
          sourceBudgetId: BUDGET_ID,
          operation: 'revise',
          requestId: REQUEST_ID.toUpperCase(),
        }
      )?.resultBudgetId
    ).toBe(REVISION_ID)

    expect(
      validateBudgetWorkflowReceipt(
        {
          ok: true,
          id: REVISION_ID,
          receipt: {
            projectId: PROJECT_ID,
            sourceBudgetId: BUDGET_ID,
            operation: 'submit',
            resultBudgetId: REVISION_ID,
            status: 'approved',
          },
        },
        {
          projectId: PROJECT_ID,
          sourceBudgetId: BUDGET_ID,
          operation: 'submit',
        }
      )
    ).toBeNull()
  })

  it('keeps a locally dirty field while applying an unrelated saved refresh', () => {
    const current = [
      {
        key: SERVER_ID,
        persistedId: SERVER_ID,
        costCodeId: COST_CODE_ID,
        bomLineItemId: '',
        description: 'Local unsaved scope note',
        amountPhp: '100.00',
      },
    ]
    const previous = [
      {
        ...current[0]!,
        description: 'Original description',
      },
    ]
    const next = [
      {
        ...previous[0]!,
        description: 'Server refreshed description',
        amountPhp: '200.00',
      },
    ]

    expect(
      mergeBudgetEditorLines(current, previous, next, new Map([
        [SERVER_ID, new Set(['description' as const])],
      ]))
    ).toEqual([
      {
        ...current[0],
        amountPhp: '200.00',
      },
    ])
  })
})
