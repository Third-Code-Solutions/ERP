import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), project: vi.fn(), schedule: vi.fn(), importer: vi.fn(() => null), register: vi.fn(() => null) }))
vi.mock('@third-code-erp/auth', async original => ({ ...(await original<typeof import('@third-code-erp/auth')>()), requireUserProfile: mocks.profile }))
vi.mock('@/lib/erp-core-client', () => ({
  getProjectThroughCoreApi: mocks.project, getProjectScheduleThroughCoreApi: mocks.schedule,
  projectLabourReconciliationReadsUseCoreApi: () => true,
  getProjectLabourReconciliationThroughCoreApi: async () => ({ ok: false, error: 'Unavailable' }),
}))
vi.mock('@/lib/operations/project-labour-reconciliation', () => ({ readProjectLabourReconciliationForTenant: vi.fn() }))
vi.mock('@/components/schedule/project-labour-reconciliation-card', () => ({ ProjectLabourReconciliationCard: () => null }))
vi.mock('@/components/schedule/ms-project-xml-importer', () => ({ MsProjectXmlImporter: mocks.importer }))
vi.mock('./project-schedule-register', () => ({ ProjectScheduleRegister: mocks.register }))

import ProjectSchedulePage from './page'

const projectId = '33333333-3333-4333-8333-333333333333'
const tenantId = '22222222-2222-4222-8222-222222222222'
const actorId = '11111111-1111-4111-8111-111111111111'
describe('schedule page XML import access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.profile.mockResolvedValue({ user: { id: actorId }, tenantId, role: 'pm' })
    mocks.project.mockResolvedValue({ ok: true, data: { id: projectId, tenantId, name: 'Synthetic project' } })
    mocks.schedule.mockResolvedValue({ ok: false, error: 'Unavailable' })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('mounts importer with verified actor tenant project scope for managers', async () => {
    renderToStaticMarkup(await ProjectSchedulePage({ params: Promise.resolve({ id: projectId }) }))
    expect(mocks.importer).toHaveBeenCalledWith(expect.objectContaining({ projectId, tenantId, actorId, canManage: true }), undefined)
    expect(mocks.register).toHaveBeenCalled()
  })
  it('preserves the scoped client lifetime with management disabled for viewer', async () => {
    mocks.profile.mockResolvedValue({ user: { id: actorId }, tenantId, role: 'viewer' })
    renderToStaticMarkup(await ProjectSchedulePage({ params: Promise.resolve({ id: projectId }) }))
    expect(mocks.importer).toHaveBeenCalledWith(expect.objectContaining({ projectId, tenantId, actorId, canManage: false }), undefined)
  })
  it('does not mount importer when project scope is invalid', async () => {
    mocks.project.mockResolvedValue({ ok: true, data: { id: projectId, tenantId: actorId, name: 'Invalid scope' } })
    renderToStaticMarkup(await ProjectSchedulePage({ params: Promise.resolve({ id: projectId }) }))
    expect(mocks.importer).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
})
