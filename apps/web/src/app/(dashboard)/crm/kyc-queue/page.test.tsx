import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  redirect: vi.fn(),
  select: vi.fn(),
  accountQueue: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  redirect: mocks.redirect,
}))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/account-queries', () => ({ getKycQueue: mocks.accountQueue }))
vi.mock('drizzle-orm', async (original) => {
  const actual = await original<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (...args: Parameters<typeof actual.eq>) => {
      mocks.eq(...args)
      return actual.eq(...args)
    },
  }
})

import { accounts, opportunities, opportunityKycTracks } from '@third-code-erp/database/schema'
import KycQueuePage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

type OpportunityReviewRow = {
  id: string
  opportunity_id: string
  account_name: string | null
  track_type: 'financial_evaluation' | 'credit_investigation'
  status: 'pending' | 'in_review'
  due_at: Date
}

function opportunityQuery(result: OpportunityReviewRow[] | Error) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (
      resolve: (rows: OpportunityReviewRow[]) => unknown,
      reject: (error: Error) => unknown
    ) => result instanceof Error
      ? Promise.resolve(reject(result))
      : Promise.resolve(resolve(result)),
  }
  for (const method of [
    query.from,
    query.innerJoin,
    query.leftJoin,
    query.where,
    query.orderBy,
    query.limit,
  ]) {
    method.mockReturnValue(query)
  }
  mocks.select.mockReturnValue(query)
  return query
}

function accountRow() {
  return {
    id: ACCOUNT_ID,
    tenant_id: TENANT_ID,
    name: 'Acme Builders',
    industry: 'general_contractor' as const,
    created_at: new Date('2026-09-01T00:00:00Z'),
    artifact_count: 3,
  }
}

function reviewRow(
  overrides: Partial<OpportunityReviewRow> = {}
): OpportunityReviewRow {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    opportunity_id: OPPORTUNITY_ID,
    account_name: 'Acme Builders',
    track_type: 'financial_evaluation',
    status: 'pending',
    due_at: new Date('2099-09-09T00:00:00Z'),
    ...overrides,
  }
}

describe('KYC queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.profile.mockResolvedValue({
      role: 'finance',
      tenantId: TENANT_ID,
      user: { id: '55555555-5555-4555-8555-555555555555' },
    })
    mocks.accountQueue.mockResolvedValue([])
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`)
    })
    opportunityQuery([])
  })

  it('renders account and opportunity reviews together with the PPRF destination', async () => {
    mocks.accountQueue.mockResolvedValue([accountRow()])
    opportunityQuery([
      reviewRow(),
      reviewRow({
        id: '66666666-6666-4666-8666-666666666666',
        track_type: 'credit_investigation',
        status: 'in_review',
      }),
    ])

    const html = renderToStaticMarkup(await KycQueuePage())

    expect(html).toContain('1 pending review')
    expect(html).toContain('2 pending opportunity reviews')
    expect(html).toContain('Financial Evaluation')
    expect(html).toContain('Credit Investigation')
    expect(html).toContain(`href="/crm/accounts/${ACCOUNT_ID}"`)
    expect(html).toContain(
      `href="/crm/opportunities/${OPPORTUNITY_ID}/proposal/pprf"`
    )
  })

  it('builds the opportunity source query with tenant predicates on every joined entity', async () => {
    const query = opportunityQuery([reviewRow()])

    await KycQueuePage()

    expect(query.from).toHaveBeenCalledWith(opportunityKycTracks)
    expect(query.innerJoin).toHaveBeenCalledWith(opportunities, expect.anything())
    expect(query.leftJoin).toHaveBeenCalledWith(accounts, expect.anything())
    expect(mocks.eq).toHaveBeenCalledWith(opportunityKycTracks.tenant_id, TENANT_ID)
    expect(mocks.eq).toHaveBeenCalledWith(opportunities.tenant_id, TENANT_ID)
    expect(mocks.eq).toHaveBeenCalledWith(accounts.tenant_id, TENANT_ID)
  })

  it('keeps opportunity records visible when the account source fails', async () => {
    mocks.accountQueue.mockRejectedValue(new Error('account read failed'))
    opportunityQuery([reviewRow()])

    const html = renderToStaticMarkup(await KycQueuePage())

    expect(html).toContain('Account KYC reviews could not be loaded')
    expect(html).toContain('Financial Evaluation')
    expect(html).toContain(`/crm/opportunities/${OPPORTUNITY_ID}/proposal/pprf`)
  })

  it('keeps account records visible when the opportunity source fails', async () => {
    mocks.accountQueue.mockResolvedValue([accountRow()])
    opportunityQuery(new Error('opportunity read failed'))

    const html = renderToStaticMarkup(await KycQueuePage())

    expect(html).toContain('Opportunity financial and credit reviews could not be loaded')
    expect(html).toContain('Acme Builders')
    expect(html).toContain(`/crm/accounts/${ACCOUNT_ID}`)
  })

  it('renders truthful empty states when both sources are empty', async () => {
    const html = renderToStaticMarkup(await KycQueuePage())

    expect(html).toContain('No accounts pending KYC review.')
    expect(html).toContain('No opportunity financial or credit reviews are pending.')
    expect(html).not.toContain('role="alert"')
  })

  it('gives viewers read-only links without introducing review controls', async () => {
    mocks.profile.mockResolvedValue({ role: 'viewer', tenantId: TENANT_ID })
    mocks.accountQueue.mockResolvedValue([accountRow()])
    opportunityQuery([reviewRow()])

    const html = renderToStaticMarkup(await KycQueuePage())

    expect(html).toContain('View →')
    expect(html).not.toContain('Review →')
    expect(html).not.toContain('<button')
    expect(html).toContain(`href="/crm/opportunities/${OPPORTUNITY_ID}/proposal/pprf"`)
  })

  it('redirects roles without KYC queue read access before querying either source', async () => {
    mocks.profile.mockResolvedValue({ role: 'sales', tenantId: TENANT_ID })

    await expect(KycQueuePage()).rejects.toThrow(
      'redirect:/crm/accounts?error=forbidden'
    )
    expect(mocks.accountQueue).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
