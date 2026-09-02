import { NextRequest } from 'next/server'
import type { AppRole } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getOpportunityExportRows: vi.fn(),
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

vi.mock('./opportunity-export', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('./opportunity-export')
  >()
  return {
    ...actual,
    getOpportunityExportRows: mocks.getOpportunityExportRows,
  }
})

import {
  OPPORTUNITY_EXPORT_MAX_ROWS,
  type OpportunityExportRow,
} from './opportunity-export'
import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

const ROW: OpportunityExportRow = {
  id: OPPORTUNITY_ID,
  account_name: 'Canonical Account',
  project_name: 'Metro Project',
  stage: 'lead',
  tcv_php: '100.00',
  gp_php: '25.00',
  probability: 50,
  weighted_tcv_php: '50.00',
  closing_date: '2026-08-06',
  rep_email: 'rep@example.test',
}

function profile(role: AppRole = 'admin') {
  return {
    role,
    tenantId: TENANT_ID,
    user: { id: USER_ID },
    email: 'operator@example.test',
    fullName: 'Operator',
  }
}

function request(query = ''): Promise<Response> {
  return GET(
    new NextRequest(
      `http://localhost/api/exports/opportunities-csv${query ? `?${query}` : ''}`,
    ),
  )
}

function expectPrivate(response: Response): void {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0',
  )
  expect(response.headers.get('vary')).toBe('Cookie')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
}

describe('opportunity CSV export route', () => {
  beforeEach(() => {
    mocks.getUserProfile.mockReset()
    mocks.getOpportunityExportRows.mockReset()
    mocks.getOpportunityExportRows.mockResolvedValue([])
  })

  it.each(ERP_ROLES)('enforces the exact export policy for %s', async (role) => {
    mocks.getUserProfile.mockResolvedValue(profile(role))

    const response = await request()

    const denied = role === 'safety' || role === 'cx' || role === 'viewer'
    expect(response.status).toBe(denied ? 403 : 200)
    expectPrivate(response)
    expect(mocks.getOpportunityExportRows).toHaveBeenCalledTimes(denied ? 0 : 1)
  })

  it('returns 401 before querying when no authenticated profile exists', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(401)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.getOpportunityExportRows).not.toHaveBeenCalled()
  })

  it.each([
    'unknown=value',
    'since=2026-08-06&since=2026-08-07',
    'until=2026-02-30',
    'stage=future_stage',
    'since=2026-08-07&until=2026-08-06',
  ])('rejects invalid filters before querying: %s', async (query) => {
    mocks.getUserProfile.mockResolvedValue(profile())

    const response = await request(query)

    expect(response.status).toBe(400)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid export filters',
    })
    expect(mocks.getOpportunityExportRows).not.toHaveBeenCalled()
  })

  it('passes Manila half-open bounds and a declared stage to the query', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('commercial'))

    const response = await request(
      'since=2026-08-06&until=2026-08-06&stage=bom_submission',
    )

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(mocks.getOpportunityExportRows).toHaveBeenCalledWith(TENANT_ID, {
      sinceInclusive: new Date('2026-08-05T16:00:00.000Z'),
      untilExclusive: new Date('2026-08-06T16:00:00.000Z'),
      stage: 'bom_submission',
    })
  })

  it('returns a bounded error instead of silently truncating a sentinel row', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.getOpportunityExportRows.mockResolvedValue(
      new Array(OPPORTUNITY_EXPORT_MAX_ROWS + 1).fill(ROW),
    )

    const response = await request()

    expect(response.status).toBe(413)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      error:
        'Export exceeds the 10,000-row limit. Narrow the filters and try again.',
    })
  })

  it('allows an export containing exactly the documented maximum rows', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.getOpportunityExportRows.mockResolvedValue(
      new Array(OPPORTUNITY_EXPORT_MAX_ROWS).fill(ROW),
    )

    const response = await request()

    expect(response.status).toBe(200)
    expectPrivate(response)
    await response.body?.cancel()
  })

  it('returns CSV with bounded private response headers', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('sales'))
    mocks.getOpportunityExportRows.mockResolvedValue([ROW])

    const response = await request()

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="abi-ops-pipeline-export-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
    await expect(response.text()).resolves.toBe(
      'id,account_name,project_name,stage,tcv_php,gp_php,probability,weighted_tcv_php,closing_date,rep_email\r\n' +
        `${OPPORTUNITY_ID},Canonical Account,Metro Project,lead,100.00,25.00,50,50.00,2026-08-06,rep@example.test\r\n`,
    )
  })

  it('maps database failures to a generic private 500 response', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.getOpportunityExportRows.mockRejectedValue(
      new Error('sensitive query diagnostics'),
    )

    const response = await request()

    expect(response.status).toBe(500)
    expectPrivate(response)
    const body = await response.text()
    expect(body).toBe('{"error":"Export unavailable"}')
    expect(body).not.toContain('diagnostics')
  })

  it('keeps profile lookup failures generic and query-free', async () => {
    mocks.getUserProfile.mockRejectedValue(new Error('sensitive auth diagnostics'))

    const response = await request()

    expect(response.status).toBe(500)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      error: 'Export unavailable',
    })
    expect(mocks.getOpportunityExportRows).not.toHaveBeenCalled()
  })
})
