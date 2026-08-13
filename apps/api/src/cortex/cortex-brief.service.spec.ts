import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  getCortexOperationalBrief: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexOperationalBrief: mocks.getCortexOperationalBrief,
}))

import { CortexBriefService } from './cortex-brief.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

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
      if (key === 'ERP_CORTEX_BRIEF_READS_ENABLED') return enabled
      if (key === 'ERP_CORTEX_BRIEF_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

describe('CortexBriefService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCortexOperationalBrief.mockResolvedValue({
      generatedAt: new Date('2026-08-09T00:00:00.000Z'),
      stats: {
        nodes: 1,
        edges: 0,
        provenance: 1,
        byType: [{ nodeType: 'invoice', count: 1 }],
      },
      freshness: { fresh: 1, stale: 0, unknown: 0 },
      items: [
        {
          nodeId: NODE_ID,
          nodeType: 'invoice',
          refTable: 'invoices',
          refId: REF_ID,
          title: 'Invoice 1042',
          summary: null,
          freshness: 'fresh',
          recordedAt: new Date('2026-08-08T23:00:00.000Z'),
          projectId: null,
        },
      ],
    })
  })

  it('fails closed before retrieval when the tenant canary is not enabled', async () => {
    const service = new CortexBriefService(config(false))

    await expect(
      service.read({ limit: 12 }, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(mocks.getCortexOperationalBrief).not.toHaveBeenCalled()
  })

  it('derives tenant and role scope and returns a strict serialized projection', async () => {
    const service = new CortexBriefService(config())

    await expect(service.read({ limit: 6 }, PRINCIPAL)).resolves.toEqual({
      generatedAt: '2026-08-09T00:00:00.000Z',
      stats: {
        nodes: 1,
        edges: 0,
        provenance: 1,
        byType: [{ nodeType: 'invoice', count: 1 }],
      },
      freshness: { fresh: 1, stale: 0, unknown: 0 },
      items: [
        {
          id: NODE_ID,
          nodeType: 'invoice',
          title: 'Invoice 1042',
          summary: null,
          refTable: 'invoices',
          refId: REF_ID,
          projectId: null,
          freshness: 'fresh',
          recordedAt: '2026-08-08T23:00:00.000Z',
          source: 'cortex',
        },
      ],
    })
    expect(mocks.getCortexOperationalBrief).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining(['invoice', 'journal_entry']),
      6
    )
  })
})
