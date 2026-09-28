import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasCapability } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  health: vi.fn(),
  queue: vi.fn(),
  awards: vi.fn(),
}))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile, can: roleHasCapability }))
vi.mock('@/lib/erp-core-client', () => ({
  getProcessHealthThroughCoreApi: mocks.health,
  getProcessTaskQueueThroughCoreApi: mocks.queue,
  getAwardTaskQueueThroughCoreApi: mocks.awards,
  getApprovalRoutePreviewThroughCoreApi: vi.fn(),
}))
vi.mock('./retry', () => ({ ProcessRetry: () => null }))
vi.mock('./actions', () => ({ completeAwardTask: vi.fn(), updateProcessTaskStatus: vi.fn() }))
import ProcessHealthPage from './page'

const row = {
  id: '44444444-4444-4444-8444-444444444444',
  processStepCode: 'AW-AR', processStepName: 'AR project code', responsibleBu: 'Finance',
  subjectType: 'project', subjectId: '33333333-3333-4333-8333-333333333333',
  status: 'in_progress', assignedTo: null, blockedReason: null, clock: null,
}

describe('Process role queue', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
    vi.clearAllMocks()
    mocks.health.mockResolvedValue({ ok: false, error: 'Health unavailable' })
    mocks.queue.mockResolvedValue({ ok: true, data: { rows: [row], total: 1, page: 1, limit: 25, totalPages: 1 } })
    mocks.awards.mockResolvedValue({ ok: true, data: { rows: [row], total: 1, page: 1, limit: 25, totalPages: 1 } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(['finance', 'cx'])('uses scoped queue and only completion for %s', async (role) => {
    mocks.profile.mockResolvedValue({ role })
    const html = renderToStaticMarkup(await ProcessHealthPage({}))
    expect(mocks.awards).toHaveBeenCalledOnce()
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(html).toContain('Complete</button>')
    expect(html).not.toContain('Cancel</button>')
    expect(html).not.toContain('Block</button>')
  })

  it('keeps CX blocked pending NTP without resume or completion', async () => {
    mocks.profile.mockResolvedValue({ role: 'cx' })
    mocks.awards.mockResolvedValue({ ok: true, data: { rows: [{ ...row, status: 'blocked', blockedReason: 'Awaiting NTP' }], total: 1, page: 1, limit: 25, totalPages: 1 } })
    const html = renderToStaticMarkup(await ProcessHealthPage({}))
    expect(html).toContain('Awaiting NTP')
    expect(html).toContain('No actions')
    expect(html).not.toContain('Complete</button>')
    expect(html).not.toContain('Resume</button>')
  })

  it('retains manager actions and generic queue', async () => {
    mocks.profile.mockResolvedValue({ role: 'pm' })
    const html = renderToStaticMarkup(await ProcessHealthPage({}))
    expect(mocks.queue).toHaveBeenCalledOnce()
    expect(mocks.awards).not.toHaveBeenCalled()
    expect(html).toContain('Block</button>')
    expect(html).toContain('Cancel</button>')
  })

  it('keeps unsupported roles out of both queues', async () => {
    mocks.profile.mockResolvedValue({ role: 'sales' })
    const html = renderToStaticMarkup(await ProcessHealthPage({}))
    expect(html).toContain('You do not have permission to view the process task queue.')
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(mocks.awards).not.toHaveBeenCalled()
  })

  it('shows scoped Core failure without falling back to generic reads', async () => {
    mocks.profile.mockResolvedValue({ role: 'finance' })
    mocks.awards.mockResolvedValue({ ok: false, error: 'Award queue unavailable' })
    const html = renderToStaticMarkup(await ProcessHealthPage({}))
    expect(html).toContain('Award queue unavailable')
    expect(mocks.queue).not.toHaveBeenCalled()
  })
})
