import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { AppRole } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ContextDomain = 'project' | 'bom' | 'invoices' | 'purchase_orders'

interface ModelRequest {
  messages: Array<{ role: string; content: string }>
}

interface ModelChunk {
  choices: Array<{ delta: { content?: string } }>
}

interface QueryCall {
  table: object
  where?: SQL
  limit?: number
}

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  dbSelect: vi.fn(),
  dbFrom: vi.fn(),
  getOpenAI: vi.fn(),
  openaiCreate:
    vi.fn<(request: ModelRequest) => Promise<AsyncIterable<ModelChunk>>>(),
  writeAuditLog: vi.fn(),
  consumeProviderQuota: vi.fn(),
  providerQuotaBlockedResponse: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import(
    '@third-code-erp/shared-types/authorization'
  )
  return {
    can: roleHasCapability,
    getUserProfile: mocks.getUserProfile,
  }
})

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.dbSelect },
}))

vi.mock('@third-code-erp/ai', () => ({
  getOpenAI: mocks.getOpenAI,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/provider-quota', () => ({
  consumeProviderQuota: mocks.consumeProviderQuota,
  providerQuotaBlockedResponse: mocks.providerQuotaBlockedResponse,
}))

import {
  boms,
  bomLineItems,
  invoices,
  projects,
  purchaseOrders,
} from '@third-code-erp/database/schema'
import { POST } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const FOREIGN_TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const BOM_ID = '55555555-5555-4555-8555-555555555555'

const ROLE_CASES: ReadonlyArray<{
  role: AppRole
  domains: readonly ContextDomain[]
}> = [
  {
    role: 'owner',
    domains: ['project', 'bom', 'invoices', 'purchase_orders'],
  },
  { role: 'estimator', domains: ['project', 'bom', 'purchase_orders'] },
  { role: 'pm', domains: ['project', 'purchase_orders'] },
  {
    role: 'admin',
    domains: ['project', 'bom', 'invoices', 'purchase_orders'],
  },
  { role: 'sales', domains: ['project'] },
  { role: 'commercial', domains: ['project', 'bom', 'purchase_orders'] },
  { role: 'design', domains: ['project'] },
  { role: 'sd_pm_pe', domains: ['project', 'purchase_orders'] },
  { role: 'finance', domains: ['project', 'invoices'] },
  { role: 'procurement', domains: ['project', 'purchase_orders'] },
  { role: 'safety', domains: ['project'] },
  { role: 'cx', domains: ['project'] },
]

const queryCalls: QueryCall[] = []
const queryResults = new Map<object, unknown[]>()
let rejectedTable: object | null = null

async function* modelStream(text = 'Safe answer'): AsyncIterable<ModelChunk> {
  yield { choices: [{ delta: { content: text } }] }
}

function profile(role: AppRole = 'admin') {
  return {
    user: { id: USER_ID },
    tenantId: TENANT_ID,
    role,
    email: 'operator@example.test',
    fullName: 'Operator',
  }
}

function request(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

function validBody() {
  return {
    messages: [{ role: 'user', content: '  Summarize this project.  ' }],
    projectId: PROJECT_ID,
  }
}

function expectPrivate(response: Response): void {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
}

function wasQueried(table: object): boolean {
  return queryCalls.some((call) => call.table === table)
}

function queryFor(table: object): QueryCall {
  const call = queryCalls.find((candidate) => candidate.table === table)
  if (!call) throw new Error('Expected table query was not captured.')
  return call
}

function systemPrompt(): string {
  const prompt = mocks.openaiCreate.mock.calls.at(-1)?.[0]?.messages[0]
  if (prompt?.role !== 'system') {
    throw new Error('Expected a system prompt in the provider request.')
  }
  return prompt.content
}

function configureProjectContext(): void {
  queryResults.set(projects, [
    {
      id: PROJECT_ID,
      name: 'Sentinel Project',
      client: 'Sentinel Client',
      status: 'active',
      location: 'Makati',
      project_type: 'fit_out',
    },
  ])
  queryResults.set(boms, [
    {
      id: BOM_ID,
      version: 3,
      status: 'approved',
      total_cost_cents: 100_000,
      tcv_cents: 130_000,
      gp_cents: 30_000,
      gp_margin_bps: 2_308,
    },
  ])
  queryResults.set(bomLineItems, [
    {
      description: 'BOM-SENSITIVE copper piping',
      quantity: 5,
      unit: 'm',
      unit_cost_cents: 20_000,
      line_total_cents: 100_000,
    },
  ])
  queryResults.set(invoices, [
    {
      invoice_number: 'INV-SENSITIVE-001',
      status: 'issued',
      billing_percent_bps: 5_000,
      net_amount_cents: 65_000,
    },
  ])
  queryResults.set(purchaseOrders, [
    {
      po_number: 'PO-SENSITIVE-001',
      status: 'issued',
      total_cents: 75_000,
    },
  ])
}

describe('legacy project chat data boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    queryCalls.length = 0
    queryResults.clear()
    rejectedTable = null

    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.consumeProviderQuota.mockResolvedValue({ ok: true, skipped: true })
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.openaiCreate.mockImplementation(async () => modelStream())
    mocks.getOpenAI.mockReturnValue({
      chat: { completions: { create: mocks.openaiCreate } },
    })
    mocks.dbSelect.mockImplementation(() => ({ from: mocks.dbFrom }))
    mocks.dbFrom.mockImplementation((table: object) => {
      const call: QueryCall = { table }
      queryCalls.push(call)
      const builder = {
        where(condition: SQL) {
          call.where = condition
          return builder
        },
        orderBy() {
          return builder
        },
        async limit(limit: number) {
          call.limit = limit
          if (table === rejectedTable) {
            throw new Error('Simulated database failure.')
          }
          return queryResults.get(table) ?? []
        },
      }
      return builder
    })
    configureProjectContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('requires an authenticated profile and returns private failures', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request(validBody())

    expect(response.status).toBe(401)
    expectPrivate(response)
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
  })

  it('strictly validates and bounds unknown input before quota or provider work', async () => {
    const invalidJson = await POST(
      new NextRequest('http://localhost/api/ai/chat', {
        method: 'POST',
        body: '{',
      })
    )
    const invalidResponses = [
      invalidJson,
      await request({ ...validBody(), unexpected: true }),
      await request({ messages: [] }),
      await request({
        messages: Array.from({ length: 21 }, () => ({
          role: 'user',
          content: 'bounded',
        })),
      }),
      await request({
        messages: [{ role: 'user', content: 'x'.repeat(4_001) }],
      }),
      await request({ ...validBody(), projectId: 'not-a-project-id' }),
    ]

    for (const response of invalidResponses) {
      expect(response.status).toBe(400)
      expectPrivate(response)
    }
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.getOpenAI).not.toHaveBeenCalled()
  })

  it('preserves provider configuration and quota failures around mandatory audit', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const unconfigured = await request(validBody())

    expect(unconfigured.status).toBe(503)
    expectPrivate(unconfigured)
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()

    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const quotaResponse = new Response('Provider quota exhausted.', {
      status: 429,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Cookie',
      },
    })
    mocks.consumeProviderQuota.mockResolvedValue({
      ok: false,
      status: 429,
      error: 'Provider quota exhausted.',
    })
    mocks.providerQuotaBlockedResponse.mockReturnValue(quotaResponse)
    const quotaBlocked = await request(validBody())

    expect(quotaBlocked).toBe(quotaResponse)
    expectPrivate(quotaBlocked)
    expect(mocks.providerQuotaBlockedResponse).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, status: 429 }),
      expect.objectContaining({
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Cookie',
      })
    )
    expect(mocks.dbSelect).toHaveBeenCalled()
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(
      mocks.writeAuditLog.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.consumeProviderQuota.mock.invocationCallOrder[0] ?? 0)
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
  })

  it.each(ROLE_CASES)(
    'applies central project/BOM/finance/PO policy for $role',
    async ({ role, domains }) => {
      mocks.getUserProfile.mockResolvedValue(profile(role))

      const response = await request(validBody())

      expect(response.status).toBe(200)
      expectPrivate(response)
      await expect(response.text()).resolves.toBe('Safe answer')
      expect(wasQueried(projects)).toBe(true)
      expect(wasQueried(boms)).toBe(domains.includes('bom'))
      expect(wasQueried(bomLineItems)).toBe(domains.includes('bom'))
      expect(wasQueried(invoices)).toBe(domains.includes('invoices'))
      expect(wasQueried(purchaseOrders)).toBe(
        domains.includes('purchase_orders')
      )

      const prompt = systemPrompt()
      expect(prompt).toContain('Sentinel Project')
      expect(prompt.includes('BOM-SENSITIVE')).toBe(domains.includes('bom'))
      expect(prompt.includes('BOM v3')).toBe(domains.includes('bom'))
      expect(prompt.includes('INV-SENSITIVE')).toBe(
        domains.includes('invoices')
      )
      expect(prompt.includes('INVOICES')).toBe(domains.includes('invoices'))
      expect(prompt.includes('PO-SENSITIVE')).toBe(
        domains.includes('purchase_orders')
      )
      expect(prompt.includes('PURCHASE ORDERS')).toBe(
        domains.includes('purchase_orders')
      )

      expect(mocks.writeAuditLog).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'ai_chat',
        entityId: PROJECT_ID,
        action: 'query',
        diff: {
          project_id: PROJECT_ID,
          message_count: 1,
          granted_context_domains: domains,
        },
      })
      expect(
        mocks.writeAuditLog.mock.invocationCallOrder[0]
      ).toBeLessThan(mocks.openaiCreate.mock.invocationCallOrder[0] ?? 0)
      expect(
        mocks.writeAuditLog.mock.invocationCallOrder[0]
      ).toBeLessThan(
        mocks.consumeProviderQuota.mock.invocationCallOrder[0] ?? 0
      )

      const modelRequest = mocks.openaiCreate.mock.calls[0]?.[0]
      expect(modelRequest?.messages.at(-1)).toEqual({
        role: 'user',
        content: 'Summarize this project.',
      })
    }
  )

  it.each(['missing', 'foreign-tenant'] as const)(
    'withholds all domain context for a %s project',
    async () => {
      queryResults.set(projects, [])
      mocks.getUserProfile.mockResolvedValue(profile('admin'))

      const response = await request(validBody())

      expect(response.status).toBe(200)
      await response.text()
      expect(queryCalls).toHaveLength(1)
      expect(wasQueried(projects)).toBe(true)
      expect(wasQueried(boms)).toBe(false)
      expect(wasQueried(invoices)).toBe(false)
      expect(wasQueried(purchaseOrders)).toBe(false)
      expect(systemPrompt()).not.toContain('BOM-SENSITIVE')
      expect(systemPrompt()).not.toContain('INV-SENSITIVE')
      expect(systemPrompt()).not.toContain('PO-SENSITIVE')

      const projectQuery = queryFor(projects)
      if (!projectQuery.where) {
        throw new Error('Expected tenant-scoped project predicate.')
      }
      const compiled = new PgDialect().sqlToQuery(projectQuery.where)
      expect(compiled.params).toContain(PROJECT_ID)
      expect(compiled.params).toContain(TENANT_ID)
      expect(compiled.params).not.toContain(FOREIGN_TENANT_ID)
      expect(mocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          diff: expect.objectContaining({ granted_context_domains: [] }),
        })
      )
    }
  )

  it('skips all database reads when no project is requested', async () => {
    const response = await request({
      messages: [{ role: 'user', content: 'What can you help with?' }],
    })

    expect(response.status).toBe(200)
    await response.text()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(systemPrompt()).not.toContain('Sentinel Project')
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: USER_ID,
        diff: {
          project_id: null,
          message_count: 1,
          granted_context_domains: [],
        },
      })
    )
  })

  it('returns private typed failures for quota, context, and provider exceptions', async () => {
    mocks.consumeProviderQuota.mockRejectedValueOnce(
      new Error('quota transport detail')
    )
    const quotaFailure = await request(validBody())
    expect(quotaFailure.status).toBe(503)
    expectPrivate(quotaFailure)
    expect(mocks.dbSelect).toHaveBeenCalled()
    expect(mocks.writeAuditLog).toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()

    mocks.dbSelect.mockClear()
    mocks.writeAuditLog.mockClear()
    mocks.consumeProviderQuota.mockClear()
    mocks.consumeProviderQuota.mockResolvedValue({ ok: true, skipped: true })
    rejectedTable = projects
    const contextFailure = await request(validBody())
    expect(contextFailure.status).toBe(503)
    expectPrivate(contextFailure)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()

    mocks.writeAuditLog.mockClear()
    mocks.consumeProviderQuota.mockClear()
    rejectedTable = null
    mocks.openaiCreate.mockRejectedValueOnce(new Error('provider detail'))
    const providerFailure = await request(validBody())
    expect(providerFailure.status).toBe(503)
    expectPrivate(providerFailure)
    expect(mocks.writeAuditLog).toHaveBeenCalled()

    for (const [response, sensitiveDetail] of [
      [quotaFailure, 'quota transport detail'],
      [contextFailure, 'Simulated database failure.'],
      [providerFailure, 'provider detail'],
    ] as const) {
      const body = await response.json()
      expect(body).toEqual({ ok: false, error: 'AI chat unavailable' })
      expect(JSON.stringify(body)).not.toContain(sensitiveDetail)
    }
  })

  it('fails closed before provider work when the audit write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.writeAuditLog.mockRejectedValue(new Error('audit storage detail'))

    const response = await request(validBody())

    expect(response.status).toBe(503)
    expectPrivate(response)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = await response.json()
    expect(body).toEqual({ ok: false, error: 'AI chat unavailable' })
    expect(JSON.stringify(body)).not.toContain('audit storage detail')
    expect(
      errorSpy.mock.calls.flat().map(String).join(' ')
    ).not.toContain('audit storage detail')
    expect(errorSpy).toHaveBeenCalledWith('[ai/chat] audit log failed')
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.getOpenAI).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
  })

  it('denies Viewer assistant use before any downstream work', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('viewer'))
    const viewerRequest = new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody()),
    })
    const jsonSpy = vi.spyOn(viewerRequest, 'json')

    const response = await POST(viewerRequest)

    expect(response.status).toBe(403)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.getOpenAI).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
  })
})
