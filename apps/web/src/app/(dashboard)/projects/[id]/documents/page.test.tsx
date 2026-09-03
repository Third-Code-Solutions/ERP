import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), select: vi.fn() }))
vi.mock('@third-code-erp/auth', async (original) => ({
  ...await original<typeof import('@third-code-erp/auth')>(), requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/components/documents/upload-button', () => ({ UploadButton: () => <button>Upload fixture</button> }))
vi.mock('@/components/documents/delete-document-button', () => ({ DeleteDocumentButton: () => <button>Delete fixture</button> }))
vi.mock('@/components/documents/quota-bar', () => ({ QuotaBar: () => <p>Quota fixture</p> }))
import ProjectDocumentsPage from './page'
const projectId = '33333333-3333-4333-8333-333333333333'

describe('project document action visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: projectId, name: 'Fixture project' }] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [{
        id: 'document-fixture', file_name: 'evidence.pdf', document_type: 'pdf', size_bytes: 200,
        description: null, created_at: new Date('2026-09-01'),
      }] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ total: '200' }] }) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(ERP_ROLES)('matches server document.manage policy for %s', async (role) => {
    mocks.profile.mockResolvedValue({ role, tenantId: 'tenant-fixture' })
    const markup = renderToStaticMarkup(await ProjectDocumentsPage({ params: Promise.resolve({ id: projectId }) }))
    expect(markup.includes('Upload fixture')).toBe(role !== 'viewer')
    expect(markup.includes('Delete fixture')).toBe(role !== 'viewer')
    expect(markup).toContain('/api/documents/document-fixture?download=1')
    expect(markup).not.toContain('parses instantly')
    expect(markup).not.toContain('Phase 3')
    expect(markup).toContain('aria-current="page"')
    if (role === 'sales') expect(markup).not.toContain(`/${projectId}/billing`)
  })
})
