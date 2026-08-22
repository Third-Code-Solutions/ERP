import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import {
  projectRetirementRequests,
  projects,
  users,
} from '@third-code-erp/database/schema'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectRetirementService } from './project-retirement.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-08-19T00:00:00.000Z')
const RETIRED_AT = new Date('2026-08-19T01:00:00.000Z')

function chain(rows: unknown[]) {
  const forUpdate = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: forUpdate })
  const where = vi.fn().mockReturnValue({ limit })
  return { where, limit, forUpdate }
}

function harness(options?: {
  enabled?: boolean
  role?: 'admin' | 'viewer'
  requestState?: 'processing' | 'succeeded'
}) {
  const membership = chain([
    {
      tenantId: PRINCIPAL.tenantId,
      role: options?.role ?? 'admin',
      email: PRINCIPAL.email,
    },
  ])
  const project = chain([
    {
      id: PROJECT_ID,
      tenantId: PRINCIPAL.tenantId,
      updatedAt: UPDATED_AT,
      deletedAt: options?.requestState === 'succeeded' ? RETIRED_AT : null,
    },
  ])
  let requestRecord: {
    id: string
    requestHash: string
    state: 'processing' | 'succeeded'
    result: unknown
  } = {
    id: '44444444-4444-4444-8444-444444444444',
    requestHash: '',
    state: options?.requestState ?? 'processing',
    result:
      options?.requestState === 'succeeded'
        ? {
            projectId: PROJECT_ID,
            tenantId: PRINCIPAL.tenantId,
            deleted: true,
            retiredAt: RETIRED_AT.toISOString(),
          }
        : null,
  }
  const requestForUpdate = vi.fn().mockImplementation(async () => [requestRecord])
  const requestLimit = vi.fn().mockReturnValue({ for: requestForUpdate })
  const requestWhere = vi.fn().mockReturnValue({ limit: requestLimit })
  const request = { where: requestWhere }
  const from = vi.fn((table: unknown) => {
    if (table === users) return membership
    if (table === projects) return project
    if (table === projectRetirementRequests) return request
    throw new Error('Unexpected select table')
  })
  const select = vi.fn().mockReturnValue({ from })

  const projectReturning = vi.fn().mockResolvedValue([
    { id: PROJECT_ID, tenantId: PRINCIPAL.tenantId, deletedAt: RETIRED_AT },
  ])
  const projectWhere = vi.fn().mockReturnValue({ returning: projectReturning })
  const projectSet = vi.fn().mockReturnValue({ where: projectWhere })
  const requestReturning = vi.fn().mockResolvedValue([
    { id: '44444444-4444-4444-8444-444444444444' },
  ])
  const requestCompleteWhere = vi
    .fn()
    .mockReturnValue({ returning: requestReturning })
  const requestSet = vi.fn().mockReturnValue({ where: requestCompleteWhere })
  const update = vi.fn((table: unknown) => ({
    set: table === projects ? projectSet : requestSet,
  }))

  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn((payload: Record<string, unknown>) => {
    if (typeof payload.request_hash === 'string') {
      requestRecord = { ...requestRecord, requestHash: payload.request_hash }
    }
    return { onConflictDoNothing }
  })
  const insert = vi.fn().mockReturnValue({ values })
  const transactionClient = { select, update, insert }
  const transaction = vi.fn(
    async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
  )
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_PROJECT_DELETE_WRITES_ENABLED') {
        return options?.enabled ?? true
      }
      if (key === 'ERP_PROJECT_DELETE_WRITES_TENANT_IDS') {
        return [PRINCIPAL.tenantId]
      }
      return fallback
    }),
  } as unknown as import('@nestjs/config').ConfigService

  return {
    service: new ProjectRetirementService(config, database, audit),
    audit,
    projectSet,
    projectReturning,
    transaction,
  }
}

const COMMAND = {
  reason: 'Duplicate intake record',
  expectedUpdatedAt: UPDATED_AT.toISOString(),
}

describe('ProjectRetirementService', () => {
  it('retires an active project through a locked, audited, idempotent command', async () => {
    const probe = harness()

    await expect(
      probe.service.retire(PROJECT_ID, COMMAND, PRINCIPAL, 'project-retire-1'),
    ).resolves.toEqual({
      projectId: PROJECT_ID,
      tenantId: PRINCIPAL.tenantId,
      deleted: true,
      retiredAt: RETIRED_AT.toISOString(),
    })

    expect(probe.projectSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_by: PRINCIPAL.userId,
        deletion_reason: COMMAND.reason,
      }),
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'delete',
        entityType: 'project',
        entityId: PROJECT_ID,
      }),
    )
  })

  it('denies a viewer before locking or changing a project', async () => {
    const probe = harness({ role: 'viewer' })

    await expect(
      probe.service.retire(PROJECT_ID, COMMAND, PRINCIPAL, 'project-retire-2'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.projectSet).not.toHaveBeenCalled()
  })

  it('fails closed while the tenant delete feature is disabled', async () => {
    const probe = harness({ enabled: false })

    await expect(
      probe.service.retire(PROJECT_ID, COMMAND, PRINCIPAL, 'project-retire-3'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
