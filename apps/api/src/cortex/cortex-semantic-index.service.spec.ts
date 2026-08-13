import 'reflect-metadata'

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CortexSemanticIndexService } from './cortex-semantic-index.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}
const COMMAND = { maxNodes: 64 as const, costConsent: true as const }

function harness(values: Record<string, unknown> = {}) {
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    service: new CortexSemanticIndexService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

describe('CortexSemanticIndexService migration boundary', () => {
  it('fails closed before database access when intake is disabled', async () => {
    const probe = harness()
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'index-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('requires both intake and worker exact-tenant gates', async () => {
    const probe = harness({
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: true,
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS: [PRINCIPAL.tenantId],
      ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: true,
      ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: [],
    })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'index-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('rejects missing consent and malformed idempotency before transaction', async () => {
    const values = {
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: true,
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS: [PRINCIPAL.tenantId],
      ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: true,
      ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: [PRINCIPAL.tenantId],
    }
    const invalidCommand = harness(values)
    await expect(
      invalidCommand.service.create(
        { maxNodes: 64, costConsent: false } as never,
        PRINCIPAL,
        'index-1'
      )
    ).rejects.toThrow()
    expect(invalidCommand.transaction).not.toHaveBeenCalled()

    const invalidKey = harness(values)
    await expect(
      invalidKey.service.create(COMMAND, PRINCIPAL, '   ')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(invalidKey.transaction).not.toHaveBeenCalled()
  })
})
