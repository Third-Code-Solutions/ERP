import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
  health: vi.fn(),
  queue: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/erp-core-client', () => ({ getProcessHealthThroughCoreApi: mocks.health }))
vi.mock('@/lib/account-queries', () => ({ getKycQueue: mocks.queue }))
vi.mock('./tasks/generation-control', () => ({ GenerationControl: () => <div>Daily task generation control</div> }))
vi.mock('./process/retry', () => ({
  ProcessRetry: ({ label = 'Try again' }: { label?: string }) => <button>{label}</button>,
}))

import TasksPage from './tasks/page'
import PunchlistPage from './punchlist/page'
import AdminPage from './admin/page'
import ProcessPage from './process/page'
import KycPage from './crm/kyc-queue/page'

describe('route QA workflow entry points', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.profile.mockResolvedValue({ role: 'admin', tenantId: 'qa-tenant', user: { id: 'qa-user' }, fullName: 'QA Admin' })
    const query = {
      from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
      then: (resolve: (rows: never[]) => unknown) => Promise.resolve(resolve([])),
    }
    for (const method of [query.from, query.innerJoin, query.leftJoin, query.where, query.orderBy, query.limit]) method.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.queue.mockResolvedValue([])
  })
  afterEach(() => vi.unstubAllGlobals())

  for (const role of ['owner', 'admin', 'sd_pm_pe', 'viewer']) {
    it(`shows only authorized task generation controls for ${role}`, async () => {
      mocks.profile.mockResolvedValue({ role, tenantId: 'qa-tenant', user: { id: 'qa-user' }, fullName: 'QA User' })
      const html = renderToStaticMarkup(await TasksPage({ searchParams: Promise.resolve({}) }))
      expect(html.includes('Daily task generation control')).toBe(['admin', 'owner'].includes(role))
      expect(html).not.toContain('Generate them from /admin')
      expect(html).toContain('href="/projects"')
      expect(html).toContain('aria-current="page"')
      expect(html).toContain('Next 7 days')
    })
  }

  for (const role of ['admin', 'viewer']) {
    it(`gates the punchlist creation entry for ${role}`, async () => {
      mocks.profile.mockResolvedValue({ role, tenantId: 'qa-tenant' })
      const html = renderToStaticMarkup(await PunchlistPage())
      expect(html.includes('href="/punchlist/new"')).toBe(role === 'admin')
    })
  }

  it('gives administrators a working task generation entry', async () => {
    const html = renderToStaticMarkup(await AdminPage())
    expect(html).toContain('href="/tasks"')
    expect(html).not.toContain('href="#"')
  })

  it('omits inaccessible admin cards for Commercial', async () => {
    mocks.profile.mockResolvedValue({ role: 'commercial', tenantId: 'qa-tenant' })
    const html = renderToStaticMarkup(await AdminPage())
    expect(html).toContain('/admin/rate-cards')
    expect(html).not.toContain('/admin/users')
    expect(html).not.toContain('href="#"')
    expect(html).not.toContain('Open task generation')
  })

  it('distinguishes a process failure from an empty healthy result', async () => {
    mocks.health.mockResolvedValue({ ok: false, error: 'Cannot GET /v1/process/health' })
    const failure = renderToStaticMarkup(await ProcessPage())
    expect(failure).toContain('role="alert"')
    expect(failure).toContain('Try again')
    expect(failure).not.toContain('Cannot GET')
    expect(failure).not.toContain('Health by business unit')
    mocks.health.mockResolvedValue({ ok: true, data: { byBu: [], observeMode: true, generatedAt: '2026-09-07T03:00:00Z' } })
    const empty = renderToStaticMarkup(await ProcessPage())
    expect(empty).toContain('Health by business unit')
    expect(empty).not.toContain('role="alert"')
    expect(empty).toContain('No open workflow tasks')
    expect(empty).toContain('href="/tasks"')
    expect(empty).toContain('href="/projects"')
    expect(empty).not.toContain('Process health summary')
    expect(empty).not.toContain('Automatic escalation')
    expect(empty).not.toContain('seed data')
    expect(empty).not.toContain('Observe')
    expect(empty).toContain('PHT')
    expect(empty).toContain('<button>Refresh</button>')
    expect(empty).toContain('dateTime="2026-09-07T03:00:00Z"')
  })

  it.each([true, false])('shows recorded BU activity and the escalation policy (observe=%s)', async (observeMode) => {
    mocks.health.mockResolvedValue({ ok: true, data: {
      observeMode, generatedAt: '2026-09-07T03:00:00Z',
      byBu: [
        { responsibleBu: 'Commercial', openTasks: 2, atRiskClocks: 1, breachedClocks: 0, escalatedClocks: 0, externalBreachedClocks: 0 },
        { responsibleBu: 'Procurement', openTasks: 3, atRiskClocks: 0, breachedClocks: 2, escalatedClocks: 0, externalBreachedClocks: 1 },
      ],
    } })
    const html = renderToStaticMarkup(await ProcessPage())
    expect(html).toContain('Process health summary')
    expect(html).toMatch(/<dt[^>]*>Open tasks<\/dt><dd[^>]*>5<\/dd>/)
    expect(html).toContain('<th scope="row">Commercial</th>')
    expect(html).toContain('<th scope="row">Procurement</th>')
    expect(html).not.toContain('No open workflow tasks')
    expect(html).toContain(observeMode
      ? 'Automatic escalation is off.'
      : 'Automatic escalation is enabled for eligible internal deadlines.')
  })

  it('shows account and opportunity empty states with the PPRF prerequisite', async () => {
    const html = renderToStaticMarkup(await KycPage())
    expect(html).toContain('after the first PPRF is submitted')
    expect(html).toContain('No accounts pending KYC review.')
    expect(html).toContain('No opportunity financial or credit reviews are pending.')
    expect(html).toContain('href="/pipeline"')
    expect(html).toContain('href="/crm/accounts"')
  })
})
