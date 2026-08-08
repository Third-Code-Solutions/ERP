import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  getCortexGraphStats: vi.fn(),
  searchCortexNodes: vi.fn(),
  searchCortexNodesByTerms: vi.fn(),
  cortexKeywordAnswer: vi.fn(),
  getCortexNodeByRef: vi.fn(),
  cortexDescribeEntity: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexGraphStats: mocks.getCortexGraphStats,
  searchCortexNodes: mocks.searchCortexNodes,
  searchCortexNodesByTerms: mocks.searchCortexNodesByTerms,
  cortexKeywordAnswer: mocks.cortexKeywordAnswer,
  getCortexNodeByRef: mocks.getCortexNodeByRef,
  cortexDescribeEntity: mocks.cortexDescribeEntity,
}))

import { CortexChatRetrievalService } from './cortex-chat-retrieval.service'

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

function config(
  enabled = true,
  tenants: string[] = [TENANT_ID]
): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED') return enabled
      if (key === 'ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

const NODE = {
  id: NODE_ID,
  node_type: 'invoice',
  ref_table: 'invoices',
  ref_id: REF_ID,
  title: 'Invoice 1042',
  summary: 'Concrete Tower',
  attributes: { project_id: PROJECT_ID },
  freshness: 'fresh' as const,
  recorded_at: new Date('2026-08-08T23:00:00.000Z'),
}

describe('CortexChatRetrievalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCortexGraphStats.mockResolvedValue({
      nodes: 1,
      edges: 0,
      provenance: 1,
      byType: [{ nodeType: 'invoice', count: 1 }],
    })
    mocks.searchCortexNodes.mockResolvedValue([NODE])
    mocks.searchCortexNodesByTerms.mockResolvedValue([NODE])
    mocks.cortexKeywordAnswer.mockResolvedValue({
      answer: 'Found invoice.',
      citations: [
        {
          nodeId: NODE_ID,
          nodeType: 'invoice',
          refTable: 'invoices',
          refId: REF_ID,
          title: 'Invoice 1042',
          projectId: PROJECT_ID,
        },
      ],
    })
    mocks.getCortexNodeByRef.mockResolvedValue(NODE)
    mocks.cortexDescribeEntity.mockResolvedValue({
      found: true,
      summary: 'invoice: Invoice 1042',
      citations: [
        {
          nodeId: NODE_ID,
          nodeType: 'invoice',
          refTable: 'invoices',
          refId: REF_ID,
          title: 'Invoice 1042',
          projectId: PROJECT_ID,
        },
      ],
    })
  })

  it('fails closed before any retrieval when tenant canary is disabled', async () => {
    const service = new CortexChatRetrievalService(config(false))

    await expect(
      service.read({ query: 'invoice', recentLimit: 40, matchLimit: 12 }, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(mocks.getCortexGraphStats).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
  })

  it('derives tenant and role scope and serializes bounded retrieval', async () => {
    const service = new CortexChatRetrievalService(config())

    await expect(
      service.read(
        { query: 'Concrete Tower', recentLimit: 6, matchLimit: 4 },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      recent: [
        {
          id: NODE_ID,
          title: 'Invoice 1042',
          projectId: PROJECT_ID,
          recordedAt: '2026-08-08T23:00:00.000Z',
          source: 'cortex',
        },
      ],
      matches: [{ id: NODE_ID }],
      focused: null,
      keywordAnswer: { answer: 'Found invoice.' },
      semanticStatus: 'not_migrated',
    })
    expect(mocks.getCortexGraphStats).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
    expect(mocks.searchCortexNodes).toHaveBeenCalledWith(TENANT_ID, {
      limit: 6,
      nodeTypes: expect.arrayContaining(['invoice', 'journal_entry']),
    })
    expect(mocks.searchCortexNodesByTerms).toHaveBeenCalledWith(
      TENANT_ID,
      ['concrete', 'tower'],
      4,
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
    expect(mocks.cortexKeywordAnswer).toHaveBeenCalledWith(
      TENANT_ID,
      'Concrete Tower',
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
  })

  it('rechecks focus ownership and role scope before describing it', async () => {
    const service = new CortexChatRetrievalService(config())

    const result = await service.read(
      {
        query: 'invoice',
        focus: { refTable: 'invoices', refId: REF_ID },
        recentLimit: 1,
        matchLimit: 1,
      },
      PRINCIPAL
    )

    expect(result.focused).toMatchObject({
      found: true,
      summary: 'invoice: Invoice 1042',
    })
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'invoices',
      REF_ID
    )
    expect(mocks.cortexDescribeEntity).toHaveBeenCalledWith(
      TENANT_ID,
      'invoices',
      REF_ID,
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
  })

  it('returns an empty focused projection for a forbidden or missing focus', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue(null)
    const service = new CortexChatRetrievalService(config())

    await expect(
      service.read(
        {
          query: 'invoice',
          focus: { refTable: 'invoices', refId: REF_ID },
          recentLimit: 1,
          matchLimit: 1,
        },
        PRINCIPAL
      )
    ).resolves.toMatchObject({ focused: { found: false, summary: '', citations: [] } })
    expect(mocks.cortexDescribeEntity).not.toHaveBeenCalled()
  })

  it('proves the strict Core projection matches a deterministic legacy fixture', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T00:00:00.000Z'))
    try {
      const service = new CortexChatRetrievalService(config())
      const core = await service.read(
        { query: 'Concrete Tower', recentLimit: 6, matchLimit: 4 },
        PRINCIPAL
      )

      // This is the legacy Web retrieval shape normalized without an HTTP or
      // provider call. It mirrors the current direct reads in chat/route.ts.
      const legacy = {
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: {
          nodes: 1,
          edges: 0,
          provenance: 1,
          byType: [{ nodeType: 'invoice', count: 1 }],
        },
        recent: [
          {
            id: NODE_ID,
            nodeType: 'invoice',
            title: 'Invoice 1042',
            summary: 'Concrete Tower',
            refTable: 'invoices',
            refId: REF_ID,
            projectId: PROJECT_ID,
            freshness: 'fresh',
            recordedAt: '2026-08-08T23:00:00.000Z',
            source: 'cortex',
          },
        ],
        matches: [
          {
            id: NODE_ID,
            nodeType: 'invoice',
            title: 'Invoice 1042',
            summary: 'Concrete Tower',
            refTable: 'invoices',
            refId: REF_ID,
            projectId: PROJECT_ID,
            freshness: 'fresh',
            recordedAt: '2026-08-08T23:00:00.000Z',
            source: 'cortex',
          },
        ],
        focused: null,
        keywordAnswer: {
          answer: 'Found invoice.',
          citations: [
            {
              nodeId: NODE_ID,
              nodeType: 'invoice',
              refTable: 'invoices',
              refId: REF_ID,
              title: 'Invoice 1042',
              projectId: PROJECT_ID,
            },
          ],
        },
        semanticStatus: 'not_migrated',
      }

      expect(core).toEqual(legacy)
    } finally {
      vi.useRealTimers()
    }
  })
})
