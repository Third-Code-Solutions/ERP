import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('not found') }) }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile, can: mocks.can }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@third-code-erp/database/schema', () => ({
  projects: { id: {}, name: {}, tenant_id: {} },
  scopeItems: { project_id: {}, tenant_id: {}, sort_order: {}, description: {} },
  documents: { id: {}, file_name: {}, created_at: {}, project_id: {}, tenant_id: {} },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), asc: vi.fn(() => ({})), eq: vi.fn(() => ({})) }))
vi.mock('@/components/scope/scope-item-controls', () => ({
  AddScopeItemForm: () => <span>ADD_SCOPE_CONTROL</span>,
  DeleteScopeItemButton: () => <span>DELETE_SCOPE_CONTROL</span>,
  EditableUnitCost: () => <span>EDIT_SCOPE_COST_CONTROL</span>,
}))
vi.mock('@/components/cad/cad-dropzone', () => ({ CadDropZone: () => <span>UPLOAD_CAD_CONTROL</span> }))

import ProjectScopePage from './page'

function selectResult(value: unknown[]) {
  const result = Promise.resolve(value) as Promise<unknown[]> & { orderBy: ReturnType<typeof vi.fn> }
  result.orderBy = vi.fn(() => Promise.resolve(value))
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => result)
  return chain
}

const ITEM = {
  id: 'item-1', code: 'S-1', description: 'Concrete', quantity: 2, unit: 'sqm',
  unit_cost_cents: 1000, line_total_cents: 2000, notes: null, sort_order: 0,
}

describe('project scope read-only rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({ tenantId: 'tenant-1', role: 'viewer', user: { id: 'user-1' } })
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: 'project-1', name: 'Demo project' }]))
      .mockReturnValueOnce(selectResult([ITEM]))
      .mockReturnValueOnce(selectResult([]))
  })

  it('renders tenant-safe scope data for Viewer without mutation controls', async () => {
    mocks.can.mockReturnValue(false)
    const html = renderToStaticMarkup(await ProjectScopePage({ params: Promise.resolve({ id: 'project-1' }) }))

    expect(html).toContain('Concrete')
    expect(html).toContain('₱10.00')
    expect(html).not.toMatch(/ADD_SCOPE_CONTROL|DELETE_SCOPE_CONTROL|EDIT_SCOPE_COST_CONTROL|UPLOAD_CAD_CONTROL/)
    expect(mocks.can).toHaveBeenCalledWith('viewer', 'project.update')
  })

  it('keeps scope controls visible for a role with project.update', async () => {
    mocks.requireUserProfile.mockResolvedValue({ tenantId: 'tenant-1', role: 'commercial', user: { id: 'user-1' } })
    mocks.can.mockReturnValue(true)
    const html = renderToStaticMarkup(await ProjectScopePage({ params: Promise.resolve({ id: 'project-1' }) }))

    expect(html).toMatch(/ADD_SCOPE_CONTROL/)
    expect(html).toMatch(/DELETE_SCOPE_CONTROL/)
    expect(html).toMatch(/EDIT_SCOPE_COST_CONTROL/)
    expect(html).toMatch(/UPLOAD_CAD_CONTROL/)
  })
})
