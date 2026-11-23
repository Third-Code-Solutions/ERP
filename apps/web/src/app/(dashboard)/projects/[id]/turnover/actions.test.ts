import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  whereArgs: [] as unknown[],
  select: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, update: mocks.update },
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { attachTurnoverDocument, markTurnoverCompiled } from './actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'

function collectColumnNames(value: unknown, seen = new WeakSet<object>()): string[] {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const record = value as Record<string, unknown>
  const ownName = typeof record.name === 'string' && record.table ? [record.name] : []
  return ownName.concat(
    Object.values(record).flatMap((child) => collectColumnNames(child, seen))
  )
}

describe('turnover actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.whereArgs.length = 0
    mocks.requireUserProfile.mockResolvedValue({
      role: 'pm',
      tenantId: TENANT_ID,
      user: { id: '44444444-4444-4444-8444-444444444444' },
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.whereArgs.push(condition)
          return { limit: () => Promise.resolve(mocks.selectResults.shift() ?? []) }
        },
      }),
    }))
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it('tells a role without the capability so in plain language', async () => {
    mocks.can.mockReturnValue(false)

    await expect(
      attachTurnoverDocument(PROJECT_ID, 'as_built', DOCUMENT_ID)
    ).resolves.toEqual({
      error: 'You do not have permission to change the turnover package.',
    })
    await expect(markTurnoverCompiled(PROJECT_ID)).resolves.toEqual({
      error: 'You do not have permission to change the turnover package.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('refuses a document that does not belong to this project', async () => {
    mocks.selectResults.push([{ id: PROJECT_ID }], [])

    const result = await attachTurnoverDocument(PROJECT_ID, 'as_built', DOCUMENT_ID)

    expect(result).toEqual({ error: 'That document was not found in this project.' })
    expect(collectColumnNames(mocks.whereArgs[1])).toEqual(
      expect.arrayContaining(['id', 'tenant_id', 'project_id'])
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('asks for a document instead of exposing validation internals', async () => {
    await expect(
      attachTurnoverDocument(PROJECT_ID, 'as_built', '')
    ).resolves.toEqual({ error: 'Choose a document to attach.' })
  })

  it('will not compile until all four documents are attached', async () => {
    mocks.selectResults.push([
      {
        id: 'package-1',
        compiled_at: null,
        as_built_document_id: DOCUMENT_ID,
        om_manual_document_id: null,
        warranty_cert_document_id: DOCUMENT_ID,
        keys_log_document_id: DOCUMENT_ID,
      },
    ])

    await expect(markTurnoverCompiled(PROJECT_ID)).resolves.toEqual({
      error: 'All four documents must be attached before compiling',
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
