import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  rows: [] as Array<{ id: string; file_name: string; storage_path: string }>,
  createSignedUrl: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mocks.rows }) }),
  },
}))

import { GET } from './route'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

function open(storagePath: string) {
  mocks.rows = [{ id: DOCUMENT_ID, file_name: 'plan.pdf', storage_path: storagePath }]
  return GET(new NextRequest(`http://localhost/api/documents/${DOCUMENT_ID}`), {
    params: Promise.resolve({ id: DOCUMENT_ID }),
  })
}

describe('GET /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID })
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/signed' },
      error: null,
    })
  })

  it('signs a storage path inside the caller tenant', async () => {
    const path = `${TENANT_ID}/33333333-3333-4333-8333-333333333333/abc-plan.pdf`
    const response = await open(path)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://storage.example.test/signed')
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(path, 300, undefined)
  })

  it('returns 404 without signing when the row points at another tenant', async () => {
    const response = await open(`${OTHER_TENANT_ID}/33333333-3333-4333-8333-333333333333/x.pdf`)

    expect(response.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it.each([
    `${TENANT_ID}/../${OTHER_TENANT_ID}/x.pdf`,
    `${TENANT_ID}/%2e%2e/${OTHER_TENANT_ID}/x.pdf`,
  ])('returns 404 without signing for a traversal path: %s', async (path) => {
    const response = await open(path)

    expect(response.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })
})
