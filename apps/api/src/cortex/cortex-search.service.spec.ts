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

import { CortexSearchService } from './cortex-search.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function config(enabled = true, tenants: string[] = [TENANT_ID]): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_SEARCH_ENABLED') return enabled
      if (key === 'ERP_CORTEX_SEARCH_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

describe('CortexSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchCortexNodesByTerms.mockResolvedValue([])
  })

  it('fails closed before retrieval when the tenant canary is not enabled', async () => {
    const service = new CortexSearchService(config(false))

    await expect(
      service.search({ q: 'concrete', limit: 20 }, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })

  it('derives tenant and role scope and returns a typed source record', async () => {
    mocks.searchCortexNodesByTerms.mockResolvedValue([
      {
        id: NODE_ID,
        node_type: 'invoice',
        ref_table: 'invoices',
        ref_id: REF_ID,
        title: '  Invoice 1042  ',
        summary: ' Concrete Tower ',
        attributes: { project_id: PROJECT_ID },
        freshness: 'fresh',
      },
    ])
    const service = new CortexSearchService(config())

    await expect(
      service.search({ q: 'Concrete Tower', limit: 20 }, PRINCIPAL)
    ).resolves.toEqual({
      hits: [
        {
          id: NODE_ID,
          nodeType: 'invoice',
          title: 'Invoice 1042',
          summary: 'Concrete Tower',
          refTable: 'invoices',
          refId: REF_ID,
          projectId: PROJECT_ID,
          freshness: 'fresh',
          source: 'cortex',
        },
      ],
    })
    expect(mocks.searchCortexNodesByTerms).toHaveBeenCalledWith(
      TENANT_ID,
      ['concrete', 'tower'],
      20,
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
  })

  it('omits unknown or mismatched graph sources before they cross Core', async () => {
    mocks.searchCortexNodesByTerms.mockResolvedValue([
      {
        id: NODE_ID,
        node_type: 'invoice',
        ref_table: 'secret_table',
        ref_id: REF_ID,
        title: 'Do not leak',
        summary: null,
        attributes: null,
        freshness: 'fresh',
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        node_type: 'project',
        ref_table: 'invoices',
        ref_id: REF_ID,
        title: 'Do not mismatch',
        summary: null,
        attributes: null,
        freshness: 'fresh',
      },
    ])
    const service = new CortexSearchService(config())

    await expect(
      service.search({ q: 'concrete', limit: 20 }, PRINCIPAL)
    ).resolves.toEqual({ hits: [] })
  })

  it('omits malformed graph rows instead of failing open', async () => {
    mocks.searchCortexNodesByTerms.mockResolvedValue([
      {
        id: 'not-a-uuid',
        node_type: 'invoice',
        ref_table: 'invoices',
        ref_id: REF_ID,
        title: 'Malformed node',
        summary: null,
        attributes: null,
        freshness: 'fresh',
      },
    ])
    const service = new CortexSearchService(config())

    await expect(
      service.search({ q: 'concrete', limit: 20 }, PRINCIPAL)
    ).resolves.toEqual({ hits: [] })
  })

  it('does not query for punctuation-only terms', async () => {
    const service = new CortexSearchService(config())

    await expect(
      service.search({ q: '%_%', limit: 20 }, PRINCIPAL)
    ).resolves.toEqual({ hits: [] })
    expect(mocks.searchCortexNodesByTerms).not.toHaveBeenCalled()
  })
})
