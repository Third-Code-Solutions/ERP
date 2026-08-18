import 'reflect-metadata'

import { ForbiddenException } from '@nestjs/common'
import { documents } from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InspectionPhotoService } from './inspection-photo.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
}
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

const COMMAND = {
  opportunityId: OPPORTUNITY_ID,
  storagePath: `${PRINCIPAL.tenantId}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`,
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg' as const,
  sizeBytes: 1,
  caption: 'Front elevation',
}

function lockedQuery(rows: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.from = vi.fn().mockReturnValue(query)
  query.where = vi.fn().mockReturnValue(query)
  query.limit = vi.fn().mockReturnValue(query)
  query.for = vi.fn().mockResolvedValue(rows)
  return query
}

function harness({
  role = 'commercial',
  opportunity = { id: OPPORTUNITY_ID, projectId: null },
  existing = null,
}: {
  role?: string
  opportunity?: { id: string; projectId: string | null } | null
  existing?: {
    id: string
    projectId: string | null
    fileName: string
    storagePath: string
  } | null
} = {}) {
  const membershipQuery = lockedQuery([
    {
      tenantId: PRINCIPAL.tenantId,
      role,
      email: PRINCIPAL.email,
    },
  ])
  const opportunityQuery = lockedQuery(opportunity ? [opportunity] : [])
  const existingQuery = lockedQuery(existing ? [existing] : [])
  let selectCount = 0
  const select = vi.fn(() => {
    return [membershipQuery, opportunityQuery, existingQuery][selectCount++] ?? existingQuery
  })
  const returning = vi.fn().mockResolvedValue([{ id: DOCUMENT_ID }])
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockReturnValue({ values })
  const transactionClient = { select, insert }
  const transaction = vi.fn(
    async (callback: (scoped: typeof transactionClient) => unknown) =>
      callback(transactionClient)
  )
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new InspectionPhotoService(
      { client: { transaction } } as unknown as DatabaseService,
      audit
    ),
    insert,
    values,
    audit,
  }
}

describe('InspectionPhotoService', () => {
  it('records opportunity evidence and audit in the Core transaction', async () => {
    const probe = harness()

    await expect(probe.service.create(COMMAND, PRINCIPAL)).resolves.toEqual({
      documentId: DOCUMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      opportunityId: OPPORTUNITY_ID,
      projectId: null,
      storagePath: COMMAND.storagePath,
      fileName: COMMAND.fileName,
      status: 'created',
    })
    expect(probe.insert).toHaveBeenCalledWith(documents)
    expect(probe.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        opportunity_id: OPPORTUNITY_ID,
        uploaded_by: PRINCIPAL.userId,
        document_type: 'image',
      })
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        entityType: 'document',
        entityId: DOCUMENT_ID,
        action: 'create',
      })
    )
  })

  it('rejects a storage object outside the authorized opportunity prefix', async () => {
    const probe = harness()

    await expect(
      probe.service.create(
        { ...COMMAND, storagePath: `${PRINCIPAL.tenantId}/projects/other/photo.jpg` },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('returns an existing storage object without a second document or audit write', async () => {
    const probe = harness({
      existing: {
        id: DOCUMENT_ID,
        projectId: null,
        fileName: COMMAND.fileName,
        storagePath: COMMAND.storagePath,
      },
    })

    await expect(probe.service.create(COMMAND, PRINCIPAL)).resolves.toMatchObject({
      documentId: DOCUMENT_ID,
      opportunityId: OPPORTUNITY_ID,
      status: 'created',
    })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('re-authorizes the persisted role instead of trusting the Web caller', async () => {
    const probe = harness({ role: 'viewer' })

    await expect(probe.service.create(COMMAND, PRINCIPAL)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(probe.insert).not.toHaveBeenCalled()
  })
})
