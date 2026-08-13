import 'reflect-metadata'

import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  getCortexGraph: vi.fn(),
  getCortexFocusedGraph: vi.fn(),
  getCortexNodeByRef: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexGraph: mocks.getCortexGraph,
  getCortexFocusedGraph: mocks.getCortexFocusedGraph,
  getCortexNodeByRef: mocks.getCortexNodeByRef,
}))

import { CortexGraphService } from './cortex-graph.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function config(enabled = true, tenants: string[] = [TENANT_ID]): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_GRAPH_READS_ENABLED') return enabled
      if (key === 'ERP_CORTEX_GRAPH_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

describe('CortexGraphService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCortexGraph.mockResolvedValue({ nodes: [], links: [] })
    mocks.getCortexFocusedGraph.mockResolvedValue(null)
    mocks.getCortexNodeByRef.mockResolvedValue(null)
  })

  it('fails closed before retrieval when the tenant canary is not enabled', async () => {
    const service = new CortexGraphService(config(false))

    await expect(service.read({}, PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(mocks.getCortexGraph).not.toHaveBeenCalled()
  })

  it('derives tenant and finance role scope for the whole graph', async () => {
    mocks.getCortexGraph.mockResolvedValue({
      nodes: [
        {
          id: NODE_ID,
          type: 'journal_entry',
          title: 'Journal 1042',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
        {
          id: 'not-a-uuid',
          type: 'journal_entry',
          title: 'Malformed',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
      ],
      links: [
        { source: NODE_ID, target: 'not-a-uuid', type: 'bad' },
      ],
    })
    const service = new CortexGraphService(config())

    await expect(service.read({}, PRINCIPAL)).resolves.toEqual({
      nodes: [
        {
          id: NODE_ID,
          type: 'journal_entry',
          title: 'Journal 1042',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
      ],
      links: [],
    })
    expect(mocks.getCortexGraph).toHaveBeenCalledWith(
      TENANT_ID,
      1500,
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
  })

  it('returns only a registered, role-visible focused neighborhood', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'journal_entry',
    })
    mocks.getCortexFocusedGraph.mockResolvedValue({
      focusNodeId: NODE_ID,
      nodes: [
        {
          id: NODE_ID,
          type: 'journal_entry',
          title: 'Journal 1042',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
      ],
      links: [],
    })
    const service = new CortexGraphService(config())

    await expect(
      service.read(
        { refTable: 'journal_entries', refId: REF_ID },
        PRINCIPAL
      )
    ).resolves.toMatchObject({ focusNodeId: NODE_ID })
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID
    )
    expect(mocks.getCortexFocusedGraph).toHaveBeenCalledWith(
      TENANT_ID,
      NODE_ID,
      40,
      expect.arrayContaining(['journal_entry'])
    )
  })

  it('conceals a mismatched or role-hidden focus as not found', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'invoice',
    })
    const service = new CortexGraphService(config())

    await expect(
      service.read(
        { refTable: 'journal_entries', refId: REF_ID },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexFocusedGraph).not.toHaveBeenCalled()

    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'journal_entry',
    })
    await expect(
      service.read(
        { refTable: 'journal_entries', refId: REF_ID },
        { ...PRINCIPAL, role: 'sales' }
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexFocusedGraph).not.toHaveBeenCalled()
  })

  it('drops malformed focused neighbors while retaining the valid focus', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'journal_entry',
    })
    mocks.getCortexFocusedGraph.mockResolvedValue({
      focusNodeId: NODE_ID,
      nodes: [
        {
          id: NODE_ID,
          type: 'journal_entry',
          title: 'Journal 1042',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
        {
          id: 'not-a-uuid',
          type: 'journal_entry',
          title: 'Malformed neighbor',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
      ],
      links: [],
    })
    const service = new CortexGraphService(config())

    await expect(
      service.read({ refTable: 'journal_entries', refId: REF_ID }, PRINCIPAL)
    ).resolves.toMatchObject({
      focusNodeId: NODE_ID,
      nodes: [expect.objectContaining({ id: NODE_ID })],
    })
  })
})
