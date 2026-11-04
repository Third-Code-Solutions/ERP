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

import PortalProjectDocumentsPage from './page'

function doc(fileName: string, storagePath: string) {
  return {
    id: fileName,
    file_name: fileName,
    document_type: 'contract',
    storage_path: storagePath,
    size_bytes: 10,
    created_at: new Date('2026-08-01T00:00:00Z'),
  }
}

describe('portal project documents', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/s' } })
  })

  it('omits documents whose storage path leaves the project tenant', async () => {
    const ownPath = `${TENANT_ID}/${PROJECT_ID}/own-contract.pdf`
    mocks.results = [
      [{ id: PROJECT_ID, name: 'Fixture project', account_name: null }],
      [
        doc('own-contract.pdf', ownPath),
        doc('foreign-contract.pdf', `99999999-9999-4999-8999-999999999999/${PROJECT_ID}/x.pdf`),
        doc('climb-contract.pdf', `${TENANT_ID}/../99999999-9999-4999-8999-999999999999/x.pdf`),
      ],
    ]

    const html = renderToStaticMarkup(
      await PortalProjectDocumentsPage({ params: Promise.resolve({ token: 'fixture-token' }) })
    )

    expect(html).toContain('own-contract.pdf')
    expect(html).not.toContain('foreign-contract.pdf')
    expect(html).not.toContain('climb-contract.pdf')
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(ownPath, 60)
  })
})
