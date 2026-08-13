import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
  }),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

function requestWithFile(file: Blob, fileName: string) {
  const body = new FormData()
  body.set('file', file, fileName)
  return new Request(`http://localhost/api/crm/opportunities/${OPPORTUNITY_ID}/inspection-photos`, {
    method: 'POST',
    body,
  })
}

describe('inspection photo upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'pm',
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ limit: mocks.limit })
    mocks.limit.mockResolvedValue([{ id: OPPORTUNITY_ID, project_id: null }])
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ returning: mocks.returning })
    mocks.returning.mockResolvedValue([{ id: DOCUMENT_ID }])
    mocks.transaction.mockImplementation(
      async (callback: (tx: { insert: typeof mocks.insert }) => unknown) =>
        callback({ insert: mocks.insert }),
    )
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('fails before touching data for an unauthenticated caller', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await POST(
      requestWithFile(new Blob(['image']), 'site.jpg'),
      context(OPPORTUNITY_ID),
    )

    expect(response.status).toBe(401)
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects a role without site-inspection capability', async () => {
    mocks.can.mockReturnValue(false)

    const response = await POST(
      requestWithFile(new Blob(['image'], { type: 'image/jpeg' }), 'site.jpg'),
      context(OPPORTUNITY_ID),
    )

    expect(response.status).toBe(403)
    expect(mocks.can).toHaveBeenCalledWith('pm', 'site_inspection.submit')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('rejects non-image files before Storage upload', async () => {
    const response = await POST(
      requestWithFile(new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt'),
      context(OPPORTUNITY_ID),
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({ error: 'Only image files are accepted' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('records a same-tenant opportunity photo and its audit entry', async () => {
    const response = await POST(
      requestWithFile(new Blob(['image'], { type: 'image/jpeg' }), 'front elevation.jpg'),
      context(OPPORTUNITY_ID),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      fileName: 'front elevation.jpg',
    })
    expect(mocks.upload).toHaveBeenCalledOnce()
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ insert: mocks.insert }),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'document',
        entityId: DOCUMENT_ID,
        action: 'create',
      }),
    )
  })
})
