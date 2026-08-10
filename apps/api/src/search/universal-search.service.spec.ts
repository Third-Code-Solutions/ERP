import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  searchCortexNodesByTerms: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  searchCortexNodesByTerms: mocks.searchCortexNodesByTerms,
}))

import { UniversalSearchService } from './universal-search.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const INVOICE_ID = '55555555-5555-4555-8555-555555555555'
const TASK_ID = '66666666-6666-4666-8666-666666666666'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function config(
  enabled = true,
  tenants: string[] = [TENANT_ID]
): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_UNIVERSAL_SEARCH_READS_ENABLED') return enabled
      if (key === 'ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

describe('UniversalSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchCortexNodesByTerms.mockResolvedValue([])
  })

  it('fails closed before graph retrieval when the tenant canary is disabled', async () => {
    const service = new UniversalSearchService(config(false))

    await expect(
      service.search({ q: 'concrete', limit: 10 }, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })

  it('keeps tenant, role, source, and assignee boundaries in the Core adapter', async () => {
    mocks.searchCortexNodesByTerms.mockResolvedValue([
      {
        id: NODE_ID,
        node_type: 'invoice',
        ref_table: 'invoices',
        ref_id: INVOICE_ID,
        title: ' Invoice 1042 ',
        summary: ' Concrete Tower ',
        attributes: {},
        freshness: 'fresh',
      },
      {
        id: NODE_ID,
        node_type: 'task',
        ref_table: 'daily_tasks',
        ref_id: TASK_ID,
        title: 'Other user task',
        summary: null,
        attributes: { assignee_id: '99999999-9999-4999-8999-999999999999' },
        freshness: 'fresh',
      },
      {
        id: NODE_ID,
        node_type: 'project',
        ref_table: 'projects',
        ref_id: PROJECT_ID,
        title: 'Harbor fit-out',
        summary: 'active',
        attributes: {},
        freshness: 'fresh',
      },
    ])
    const service = new UniversalSearchService(config())

    await expect(
      service.search({ q: 'Concrete Tower', limit: 10 }, PRINCIPAL)
    ).resolves.toEqual({
      hits: [
        {
          type: 'invoice',
          id: INVOICE_ID,
          title: 'Invoice 1042',
          subtitle: 'Concrete Tower',
          href: `/invoices/${INVOICE_ID}`,
        },
        {
          type: 'project',
          id: PROJECT_ID,
          title: 'Harbor fit-out',
          subtitle: 'active',
          href: `/projects/${PROJECT_ID}`,
        },
      ],
      status: 'complete',
      failedTypes: [],
      hint: expect.any(String),
    })
    expect(mocks.searchCortexNodesByTerms).toHaveBeenCalledWith(
      TENANT_ID,
      ['concrete', 'tower'],
      40,
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
  })

  it('returns an empty typed result without a database call for short terms', async () => {
    const service = new UniversalSearchService(config())

    await expect(
      service.search({ q: '%_%', limit: 10 }, PRINCIPAL)
    ).resolves.toEqual({ hits: [], status: 'complete', failedTypes: [] })
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })
})
