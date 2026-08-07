import 'reflect-metadata'

import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  describeContextPack: vi.fn(),
  getCortexContextPack: vi.fn(),
  getCortexNodeByRef: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  describeContextPack: mocks.describeContextPack,
  getCortexContextPack: mocks.getCortexContextPack,
  getCortexNodeByRef: mocks.getCortexNodeByRef,
}))

import { CortexEntityService } from './cortex-entity.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function config(enabled = true, tenants: string[] = [TENANT_ID]): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_ENTITY_READS_ENABLED') return enabled
      if (key === 'ERP_CORTEX_ENTITY_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

describe('CortexEntityService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCortexNodeByRef.mockResolvedValue(null)
    mocks.getCortexContextPack.mockResolvedValue(null)
    mocks.describeContextPack.mockReturnValue('Journal context')
  })

  it('fails closed before retrieval when the tenant canary is disabled', async () => {
    const service = new CortexEntityService(config(false))

    await expect(
      service.read(
        { refTable: 'journal_entries', refId: REF_ID },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('returns a source-cited response under tenant and role scope', async () => {
    const node = {
      id: NODE_ID,
      node_type: 'journal_entry',
      ref_table: 'journal_entries',
      ref_id: REF_ID,
      title: 'JE-1042',
    }
    mocks.getCortexNodeByRef.mockResolvedValue(node)
    mocks.getCortexContextPack.mockResolvedValue({
      node,
      neighbors: [],
      provenance: [],
      citations: [
        {
          nodeId: NODE_ID,
          nodeType: 'journal_entry',
          refTable: 'journal_entries',
          refId: REF_ID,
          title: 'JE-1042',
          projectId: null,
        },
      ],
    })
    const service = new CortexEntityService(config())

    await expect(
      service.read(
        { refTable: 'journal_entries', refId: REF_ID },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      found: true,
      summary: 'Journal context',
      citations: [{ nodeId: NODE_ID }],
    })
    expect(mocks.getCortexContextPack).toHaveBeenCalledWith(
      TENANT_ID,
      'journal_entries',
      REF_ID,
      {
        neighborLimit: 12,
        provenanceLimit: 6,
        nodeTypes: expect.arrayContaining([
          'journal_entry',
          'journal_line',
        ]),
      }
    )
  })

  it('conceals source/type mismatch and role-hidden nodes', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'invoice',
    })
    const service = new CortexEntityService(config())

    await expect(
      service.read(
        { refTable: 'journal_entries', refId: REF_ID },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexContextPack).not.toHaveBeenCalled()

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
    expect(mocks.getCortexContextPack).not.toHaveBeenCalled()
  })
})
