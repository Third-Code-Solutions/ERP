import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  getUserProfile: vi.fn(),
  can: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))
vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile, can: mocks.can }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog, writeAuditLogInTransaction: mocks.writeAuditLogInTransaction }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('@/lib/erp-core-client', () => ({
  createProjectWeeklyProgressThroughCoreApi: vi.fn(),
  lockProjectWeeklyProgressThroughCoreApi: vi.fn(),
  projectWeeklyProgressWritesUseCoreApi: vi.fn(() => false),
}))
import { importMasterSchedule } from './actions'
import { parseMasterScheduleCsv } from './master-schedule-parser'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const SCHEDULE_ID = '66666666-6666-4666-8666-666666666666'
const PROFILE = { tenantId: TENANT_ID, user: { id: USER_ID }, role: 'pm', email: 'pm@example.test', fullName: 'PM' }

const VALID_IMPORT = [
  'name,start_date,finish_date,predecessor_index,planned_pct_curve',
  'Mobilize,2026-09-10,2026-09-12,,"[0,25,50]"',
].join('\n')

function selectBuilder(rows: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => rows),
  }
  return builder
}

function transactionSelectBuilder(rows: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => ({ for: vi.fn(async () => rows) })),
  }
  return builder
}

function setupTransaction() {
  const tx = {
    select: vi.fn(() => transactionSelectBuilder([{ id: PROJECT_ID }])),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: SCHEDULE_ID }]) })) })),
  }
  mocks.db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  return tx
}

const VALID = [
  'name,start_date,finish_date,predecessor_index,planned_pct_curve',
  'Mobilize,2026-09-10,2026-09-12,,"[0,25,50]"',
  'Procure materials,2026-09-13,2026-09-20,0,"0|25|75"',
].join('\n')

describe('master schedule CSV validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.db.select.mockReturnValue(selectBuilder([{ id: PROJECT_ID }]))
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('builds a preview without mutating data', () => {
    expect(parseMasterScheduleCsv(VALID)).toEqual({
      totalRows: 2,
      headerDetected: true,
      tasks: [
        { name: 'Mobilize', start_date: '2026-09-10', finish_date: '2026-09-12', predecessor_index: null, planned_pct_curve: [0, 25, 50] },
        { name: 'Procure materials', start_date: '2026-09-13', finish_date: '2026-09-20', predecessor_index: 0, planned_pct_curve: [0, 25, 75] },
      ],
      rejectedRows: [],
    })
  })

  it('reports malformed rows instead of silently dropping them', () => {
    const preview = parseMasterScheduleCsv([
      'name,start_date,finish_date,predecessor_index,planned_pct_curve',
      'Missing columns,2026-09-10,2026-09-12',
      'Bad date,2026-02-30,2026-03-01,,"[0,20]"',
      'Backwards,2026-04-10,2026-04-01,,"[0,20]"',
    ].join('\n'))
    expect(preview.tasks).toHaveLength(0)
    expect(preview.rejectedRows).toEqual([
      { row: 2, reason: 'Expected exactly 5 columns: name, start_date, finish_date, predecessor_index, planned_pct_curve.' },
      { row: 3, reason: 'Start date must be a real YYYY-MM-DD calendar date.' },
      { row: 4, reason: 'Finish date must be on or after start date.' },
    ])
  })

  it('rejects invalid predecessor graphs and non-cumulative curves', () => {
    const preview = parseMasterScheduleCsv([
      'A,2026-09-10,2026-09-12,1,"[0,50,40]"',
      'B,2026-09-13,2026-09-15,0,"[0,20,40]"',
    ].join('\n'))
    expect(preview.tasks).toHaveLength(0)
    expect(preview.rejectedRows).toEqual([
      { row: 1, reason: 'planned_pct_curve must be cumulative and non-decreasing.' },
      { row: 2, reason: 'Predecessor dependencies contain a cycle.' },
    ])
  })

  it('rejects unterminated quoted cells', () => {
    const preview = parseMasterScheduleCsv('Task,2026-09-10,2026-09-12,,"[0,20]')
    expect(preview.rejectedRows).toEqual([{ row: 1, reason: 'CSV contains an unterminated quoted cell.' }])
  })

  it('replaces and audits inside one transaction after validation', async () => {
    const tx = setupTransaction()
    await expect(importMasterSchedule(PROJECT_ID, VALID_IMPORT)).resolves.toMatchObject({ taskCount: 1 })
    expect(mocks.db.transaction).toHaveBeenCalledOnce()
    expect(tx.delete).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityType: 'master_schedule',
      entityId: SCHEDULE_ID,
      diff: { task_count: 1, replaced: true },
    }))
  })

  it('does not mutate when preview contains rejected rows', async () => {
    const tx = setupTransaction()
    const result = await importMasterSchedule(PROJECT_ID, 'Only two columns,2026-09-10')
    expect(result.error).toContain('Expected exactly 5 columns')
    expect(mocks.db.transaction).not.toHaveBeenCalled()
    expect(tx.delete).not.toHaveBeenCalled()
  })

  it('reports replacement failure without claiming success', async () => {
    setupTransaction()
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(importMasterSchedule(PROJECT_ID, VALID_IMPORT)).resolves.toMatchObject({
      error: 'Schedule replacement failed. Existing schedule was preserved.',
    })
  })
})
