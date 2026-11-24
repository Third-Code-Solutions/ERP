import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
  health: vi.fn(),
  taskQueue: vi.fn(),
  queue: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/erp-core-client', () => ({
  getProcessHealthThroughCoreApi: mocks.health,
  getProcessTaskQueueThroughCoreApi: mocks.taskQueue,
}))
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
    mocks.taskQueue.mockResolvedValue({
      ok: true,
      data: { tenantId: 'qa-tenant', rows: [], total: 0, page: 1, limit: 25, totalPages: 1 },
    })
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
    const failure = renderToStaticMarkup(await ProcessPage({}))
    expect(failure).toContain('role="alert"')
    expect(failure).toContain('Try again')
    expect(failure).not.toContain('Cannot GET')
    expect(failure).not.toContain('Health by business unit')
    expect(failure).toContain('Open deadlines')
    mocks.health.mockResolvedValue({ ok: true, data: { byBu: [], observeMode: true, generatedAt: '2026-09-07T03:00:00Z' } })
    const empty = renderToStaticMarkup(await ProcessPage({}))
    expect(empty).toContain('Open deadlines')
    expect(empty).toContain('Workflow engine, not configured')
    expect(empty).not.toContain('Health by business unit')
    expect(empty).not.toContain('Process task queue')
    expect(empty).not.toContain('role="alert"')
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
    const html = renderToStaticMarkup(await ProcessPage({}))
    expect(html).toContain('Process health summary')
    expect(html).toMatch(/<dt[^>]*>Open tasks<\/dt><dd[^>]*>5<\/dd>/)
    expect(html).toContain('<th scope="row">Commercial</th>')
    expect(html).toContain('<th scope="row">Procurement</th>')
    expect(html).not.toContain('No open workflow tasks')
    expect(html).toContain(observeMode
      ? 'Automatic escalation is off.'
      : 'Automatic escalation is enabled for eligible internal deadlines.')
  })

  it('shows a task queue failure instead of calling the engine not configured', async () => {
    mocks.health.mockResolvedValue({ ok: true, data: { byBu: [], observeMode: true, generatedAt: '2026-09-07T03:00:00Z' } })
    mocks.taskQueue.mockResolvedValue({ ok: false, status: 400, error: 'Invalid process task queue query.' })
    const refused = renderToStaticMarkup(await ProcessPage({}))
    expect(refused).toContain('Invalid process task queue query.')
    expect(refused).not.toContain('Workflow engine, not configured')

    mocks.taskQueue.mockResolvedValue({ ok: false, status: 503, error: 'upstream 10.0.0.1 refused' })
    const failed = renderToStaticMarkup(await ProcessPage({}))
    expect(failed).toContain('The task queue could not be loaded.')
    expect(failed).not.toContain('10.0.0.1')
    expect(failed).not.toContain('Workflow engine, not configured')
  })

  describe('process open deadlines', () => {
    const OPPORTUNITY_ID = '11111111-1111-4111-8111-111111111111'
    const PUNCHLIST_ID = '22222222-2222-4222-8222-222222222222'
    const businessClock = { clock_type: 'business_days', breach_business_days: 5, warning_at_pct: 0.8 }

    function useSlaRows(rows: unknown[]) {
      const query = {
        from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)),
      }
      for (const method of [query.from, query.where, query.orderBy, query.limit]) method.mockReturnValue(query)
      mocks.select.mockReturnValue(query)
      return query
    }

    const slaRows = [
      { id: 'log-1', entity_type: 'opportunity', entity_id: OPPORTUNITY_ID, sla_label: 'opp.stage_response', started_at: new Date('2020-01-06T09:00:00+08:00'), sla_seconds: businessClock },
      { id: 'log-2', entity_type: 'punchlist_item', entity_id: PUNCHLIST_ID, sla_label: 'punchlist.due_date', started_at: new Date('2020-01-06T09:00:00+08:00'), sla_seconds: businessClock },
    ]

    it('lists tenant deadlines with a link and no identifiers, and keeps them when the workflow engine is down', async () => {
      const query = useSlaRows(slaRows)
      mocks.health.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:3001'))
      const html = renderToStaticMarkup(await ProcessPage({}))
      expect(query.where).toHaveBeenCalledTimes(1)
      expect(html).toContain('Opportunity stage response')
      expect(html).toContain('Punchlist item due')
      expect(html).toContain('Overdue')
      expect(html).toContain(`href="/crm/opportunities/${OPPORTUNITY_ID}"`)
      expect(html).toContain(`href="/punchlist/${PUNCHLIST_ID}"`)
      expect(html.replace(/href="[^"]*"/g, '')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
      expect(html).toContain('Workflow engine status could not be loaded')
      expect(html).toContain('Try again')
      expect(html).not.toContain('ECONNREFUSED')
    })

    it('leaves out deadlines the role cannot open', async () => {
      useSlaRows(slaRows)
      mocks.profile.mockResolvedValue({ role: 'sales', tenantId: 'qa-tenant', user: { id: 'qa-user' }, fullName: 'QA Sales' })
      mocks.health.mockResolvedValue({ ok: true, data: { byBu: [], observeMode: true, generatedAt: '2026-09-07T03:00:00Z' } })
      const html = renderToStaticMarkup(await ProcessPage({}))
      expect(html).toContain('Opportunity stage response')
      expect(html).not.toContain('Punchlist item due')
      expect(html).not.toContain('/punchlist/')
    })

    it('says so when the deadlines cannot be read instead of showing an empty list', async () => {
      mocks.select.mockImplementation(() => { throw new Error('connection terminated') })
      mocks.health.mockResolvedValue({ ok: true, data: { byBu: [], observeMode: true, generatedAt: '2026-09-07T03:00:00Z' } })
      const html = renderToStaticMarkup(await ProcessPage({}))
      expect(html).toContain('We could not load your open deadlines')
      expect(html).not.toContain('No open deadlines')
      expect(html).not.toContain('connection terminated')
      expect(html).toContain('Workflow engine, not configured')
    })
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
