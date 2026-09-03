import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), projects: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile }))
vi.mock('@/lib/erp-core-client', () => ({ getProjectsThroughCoreApi: mocks.projects }))
import { ProjectFeatureEntry, PROJECT_FEATURES, type ProjectFeature } from './_project-entry'

describe('project feature entry selectors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile.mockResolvedValue({ role: 'owner', tenantId: 'tenant-fixture' })
    mocks.projects.mockResolvedValue({ ok: true, data: { rows: [{ id: 'project-fixture', name: 'Example project', client: 'Example client', status: 'active' }], total: 1, page: 1, totalPages: 1 } })
  })
  it.each(Object.keys(PROJECT_FEATURES) as ProjectFeature[])('links %s only to its selected project workspace', async (feature) => {
    const html = renderToStaticMarkup(await ProjectFeatureEntry({ feature, searchParams: Promise.resolve({ q: 'Example' }) }))
    expect(html).toContain(`/projects/project-fixture/${feature}`)
    expect(mocks.projects).toHaveBeenCalledWith(expect.objectContaining({ q: 'Example', page: 1, limit: 20 }))
  })
  it('denies restricted finance selectors before reading data', async () => {
    mocks.profile.mockResolvedValue({ role: 'sales' })
    const html = renderToStaticMarkup(await ProjectFeatureEntry({ feature: 'billing', searchParams: Promise.resolve({}) }))
    expect(html).toContain('Access unavailable')
    expect(mocks.projects).not.toHaveBeenCalled()
  })
  it('rejects malformed pagination without calling Core', async () => {
    const html = renderToStaticMarkup(await ProjectFeatureEntry({ feature: 'scope', searchParams: Promise.resolve({ page: '-2' }) }))
    expect(html).toContain('Invalid project filter')
    expect(mocks.projects).not.toHaveBeenCalled()
  })
  it('distinguishes a failed dependency from a real empty result', async () => {
    mocks.projects.mockResolvedValue({ ok: false, error: 'Core unavailable' })
    const failed = renderToStaticMarkup(await ProjectFeatureEntry({ feature: 'scope', searchParams: Promise.resolve({}) }))
    expect(failed).toContain('Projects unavailable')
    expect(failed).not.toContain('No projects found')
    mocks.projects.mockResolvedValue({ ok: true, data: { rows: [], total: 0, page: 1, totalPages: 1 } })
    const empty = renderToStaticMarkup(await ProjectFeatureEntry({ feature: 'scope', searchParams: Promise.resolve({}) }))
    expect(empty).toContain('No projects found')
  })
})
