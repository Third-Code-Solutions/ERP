import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  revalidatePath: vi.fn(),
  stampActorInTransaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))

vi.mock('@third-code-erp/database/schema', () => ({
  documents: {},
  opportunities: {},
  tenderDeviations: {},
  tenderEvaluationCriteria: {},
  tenderEvaluationScores: {},
  tenderPackages: {},
  tenderVendorProfiles: {},
  vendors: {},
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({
  stampActorInTransaction: mocks.stampActorInTransaction,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

import { addTenderCriterion, addTenderDeviation, createTenderPackage, scoreTender, transitionTender } from './tender-actions'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const TENDER_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
  fullName: 'Commercial',
} as const

function form(values: Record<string, string>): FormData {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) result.set(key, value)
  return result
}

function query<T>(rows: T[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder)
  builder.innerJoin = vi.fn().mockReturnValue(builder)
  builder.where = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.orderBy = vi.fn().mockReturnValue(builder)
  builder.for = vi.fn().mockResolvedValue(rows)
  builder.then = (onFulfilled?: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(rows).then(onFulfilled, onRejected)
  return builder
}

describe('tender proposal actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
  })

  it('fails closed before touching the database when the actor lacks tender management', async () => {
    mocks.can.mockReturnValue(false)

    await expect(createTenderPackage(form({
      opportunityId: OPPORTUNITY_ID,
      title: 'MNHPI tender',
      reference: 'TOR-001',
      sourceMode: 'client_issued_boq',
    }))).resolves.toEqual({ error: 'Forbidden: role "commercial" lacks "tender.manage"' })

    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('rejects malformed nested-record identifiers before any query', async () => {
    await expect(addTenderDeviation(form({
      opportunityId: OPPORTUNITY_ID,
      tenderId: 'not-a-uuid',
      category: 'scope',
      title: 'Missing drawing',
      description: 'The client issue set omits the reflected ceiling plan.',
      sourceReference: 'TOR §4.2',
    }))).resolves.toEqual({ error: 'Tender must be a valid UUID' })

    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('requires evaluation capability before accepting a score', async () => {
    mocks.can.mockReturnValue(false)

    await expect(scoreTender(form({
      opportunityId: OPPORTUNITY_ID,
      tenderId: TENDER_ID,
      vendorProfileId: TENDER_ID,
      criterionId: TENDER_ID,
      scoreBps: '8500',
      notes: 'Strong technical submission',
    }))).resolves.toEqual({ error: 'Forbidden: role "commercial" lacks "tender.evaluate"' })

    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('rejects a reused request token when the payload differs', async () => {
    mocks.db.select.mockReturnValue(query([{ id: OPPORTUNITY_ID }]))
    mocks.db.transaction.mockImplementation(async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx: Record<string, unknown> = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue(query([{
          id: TENDER_ID,
          opportunityId: OPPORTUNITY_ID,
          title: 'Original tender',
          reference: 'TOR-001',
          sourceMode: 'abi_generated_bom',
          torDocumentId: null,
          boqDocumentId: null,
          closingAt: null,
        }])),
      }
      return callback(tx)
    })

    await expect(createTenderPackage(form({
      opportunityId: OPPORTUNITY_ID,
      clientRequestId: '55555555-5555-4555-8555-555555555555',
      title: 'Changed tender',
      reference: 'TOR-001',
      sourceMode: 'abi_generated_bom',
    }))).resolves.toEqual({ error: 'Client request id was already used for a different tender' })
    expect(mocks.stampActorInTransaction).toHaveBeenCalledOnce()
  })

  it('rejects a stale score instead of overwriting a newer evaluation', async () => {
    const rows: unknown[][] = [
      [{ id: TENDER_ID }],
      [{ id: TENDER_ID }],
      [{ id: TENDER_ID }],
      [{ id: TENDER_ID, version: 2 }],
    ]
    const tx: Record<string, unknown> = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => query(rows.shift() ?? [])),
      update: vi.fn(),
      insert: vi.fn(),
    }
    mocks.db.transaction.mockImplementation(async (callback: (client: Record<string, unknown>) => Promise<unknown>) => callback(tx))

    await expect(scoreTender(form({
      opportunityId: OPPORTUNITY_ID,
      tenderId: TENDER_ID,
      vendorProfileId: TENDER_ID,
      criterionId: TENDER_ID,
      expectedVersion: '1',
      scoreBps: '8500',
      notes: 'Stale browser tab',
    }))).resolves.toEqual({ error: 'Evaluation score changed; refresh before trying again.' })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it('persists required evaluation criteria from the proposal form', async () => {
    let insertedValues: Record<string, unknown> | undefined
    mocks.db.transaction.mockImplementation(async (callback: (client: Record<string, unknown>) => Promise<unknown>) => {
      const insert = vi.fn().mockReturnValue({
        values: vi.fn((values: Record<string, unknown>) => { insertedValues = values; return { returning: vi.fn().mockResolvedValue([{ id: '66666666-6666-4666-8666-666666666666' }]) } }),
      })
      const tx: Record<string, unknown> = {
        select: vi.fn()
          .mockReturnValueOnce(query([{ id: TENDER_ID }]))
          .mockReturnValueOnce(query([{ weight: 0 }])),
        insert,
      }
      return callback(tx)
    })

    await expect(addTenderCriterion(form({
      opportunityId: OPPORTUNITY_ID,
      tenderId: TENDER_ID,
      name: 'Technical approach',
      criterionType: 'technical',
      weightBps: '2500',
      description: 'Method statement quality',
      isRequired: 'on',
    }))).resolves.toEqual({})

    expect(insertedValues).toMatchObject({ is_required: true, weight_bps: 2500, tender_id: TENDER_ID })
  })

  it('blocks submission when a required criterion is unscored', async () => {
    const rows: unknown[][] = [
      [{ status: 'evaluating', version: 1 }],
      [{ id: '77777777-7777-4777-8777-777777777777', isRequired: true }],
      [{ id: '88888888-8888-4888-8888-888888888888' }],
      [],
    ]
    const tx: Record<string, unknown> = {
      select: vi.fn(() => query(rows.shift() ?? [])),
      update: vi.fn(),
    }
    mocks.db.transaction.mockImplementation(async (callback: (client: Record<string, unknown>) => Promise<unknown>) => callback(tx))

    await expect(transitionTender(form({
      opportunityId: OPPORTUNITY_ID,
      tenderId: TENDER_ID,
      expectedVersion: '1',
      status: 'submitted',
    }))).resolves.toEqual({ error: 'Every vendor profile needs a score for each required criterion' })
    expect(tx.update).not.toHaveBeenCalled()
  })
})
