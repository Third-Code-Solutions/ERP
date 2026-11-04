import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  createSignedUrl: vi.fn(),
}))

vi.mock('@/lib/operations/customer-portal', () => ({
  findActiveCustomerSession: vi.fn().mockResolvedValue({
    id: 'session-1',
    tenant_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
  }),
  logCustomerView: vi.fn(),
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: () => {
      const result = mocks.results.shift() ?? []
      const chain = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => result,
      }
      return chain
    },
  },
}))

import PortalProjectPhotosPage from './page'

function photo(fileName: string, storagePath: string) {
  return {
    id: fileName,
    file_name: fileName,
    storage_path: storagePath,
    created_at: new Date('2026-08-01T00:00:00Z'),
  }
}

describe('portal project photos', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/s' } })
  })

  it('omits documents whose storage path leaves the project tenant', async () => {
    const ownPath = `${TENANT_ID}/${PROJECT_ID}/own-photo.jpg`
    mocks.results = [
      [{ id: PROJECT_ID, name: 'Fixture project', account_name: null }],
      [
        photo('own-photo.jpg', ownPath),
        photo('foreign-photo.jpg', `99999999-9999-4999-8999-999999999999/${PROJECT_ID}/x.jpg`),
        photo('climb-photo.jpg', `${TENANT_ID}/../99999999-9999-4999-8999-999999999999/x.jpg`),
      ],
    ]

    const html = renderToStaticMarkup(
      await PortalProjectPhotosPage({ params: Promise.resolve({ token: 'fixture-token' }) })
    )

    expect(html).toContain('own-photo.jpg')
    expect(html).not.toContain('foreign-photo.jpg')
    expect(html).not.toContain('climb-photo.jpg')
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(ownPath, 60)
  })
})
