import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { projectRfis } from '@third-code-erp/database/schema'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectRfisService } from './project-rfis.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '66666666-6666-4666-8666-666666666666'
const CREATED_AT = new Date('2026-09-10T00:00:00.000Z')

function row(overrides: Partial<{
  status: string
  version: number
  response: string | null
  respondedAt: Date | null
  respondedBy: string | null
  closedAt: Date | null
  closedBy: string | null
}> = {}) {
  return {
    id: RFI_ID,
    projectId: PROJECT_ID,
    rfiNumber: 'RFI-0001',
    subject: 'Confirm slab opening',
    question: 'Please confirm the coordinated opening size.',
    priority: 'high',
    status: overrides.status ?? 'open',
    requestedBy: PRINCIPAL.userId,
    assignedTo: null,
    dueAt: null,
    response: overrides.response ?? null,
    respondedAt: overrides.respondedAt ?? null,
    respondedBy: overrides.respondedBy ?? null,
    closedAt: overrides.closedAt ?? null,
    closedBy: overrides.closedBy ?? null,
    version: overrides.version ?? 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder)
  builder.where = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.offset = vi.fn().mockReturnValue(builder)
  builder.orderBy = vi.fn().mockReturnValue(builder)
  builder.for = vi.fn().mockResolvedValue(result)
  builder.then = (
    onFulfilled?: (value: unknown[]) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[], options?: {
  insertResult?: unknown[]
  updateResult?: unknown[]
}) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertQuery: Record<string, unknown> = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(options?.insertResult ?? []),
  }
  const updateQuery: Record<string, unknown> = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(options?.updateResult ?? []),
  }
  const insert = vi.fn().mockReturnValue(insertQuery)
  const update = vi.fn().mockReturnValue(updateQuery)
  const transactionClient = { select, insert, update }
  const transaction = vi.fn(
    async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  )
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new ProjectRfisService(database, audit),
    audit,
    insert,
    update,
    select,
    transaction,
  }
}

const membership = [{
  tenantId: PRINCIPAL.tenantId,
  role: PRINCIPAL.role,
  email: PRINCIPAL.email,
}]
const project = [{ id: PROJECT_ID }]

describe('ProjectRfisService', () => {
  it('creates a numbered RFI and audits the project-scoped command', async () => {
    const created = row()
    const probe = harness([membership, project, [], [{ total: 0 }]], {
      insertResult: [created],
    })

    await expect(
      probe.service.create({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: ' Confirm slab opening ',
        question: ' Please confirm the coordinated opening size. ',
        priority: 'high',
        assignedTo: null,
        dueAt: null,
      }, PRINCIPAL),
    ).resolves.toMatchObject({ created: true, rfi: { rfiNumber: 'RFI-0001' } })
    expect(probe.insert).toHaveBeenCalledWith(projectRfis)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'project_rfi', action: 'create', entityId: RFI_ID }),
    )
  })

  it('replays the same client request without inserting a duplicate', async () => {
    const existing = row()
    const probe = harness([membership, project, [existing]])

    await expect(
      probe.service.create({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'Confirm slab opening',
        question: 'Please confirm the coordinated opening size.',
        priority: 'high',
        assignedTo: null,
        dueAt: null,
      }, PRINCIPAL),
    ).resolves.toMatchObject({ created: false, rfi: { id: RFI_ID } })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects a client-request replay whose payload changed', async () => {
    const probe = harness([membership, project, [row()]])

    await expect(
      probe.service.create({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'Changed subject',
        question: 'Please confirm the coordinated opening size.',
        priority: 'high',
        assignedTo: null,
        dueAt: null,
      }, PRINCIPAL),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('answers an open RFI with a version increment and audit evidence', async () => {
    const current = row()
    const updated = row({
      status: 'answered',
      version: 2,
      response: 'Use the issued structural detail.',
      respondedAt: new Date('2026-09-10T01:00:00.000Z'),
      respondedBy: PRINCIPAL.userId,
    })
    const probe = harness([membership, project, [current]], { updateResult: [updated] })

    await expect(
      probe.service.answer(PROJECT_ID, RFI_ID, {
        expectedVersion: 1,
        response: 'Use the issued structural detail.',
      }, PRINCIPAL),
    ).resolves.toMatchObject({ changed: true, rfi: { status: 'answered', version: 2 } })
    expect(probe.update).toHaveBeenCalledWith(projectRfis)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'project_rfi', action: 'status_change' }),
    )
  })

  it('rejects stale transitions and denies callers without manage capability', async () => {
    const staleProbe = harness([membership, project, [row({ version: 2 })]])
    await expect(
      staleProbe.service.close(PROJECT_ID, RFI_ID, { expectedVersion: 1, reason: 'Done' }, PRINCIPAL),
    ).rejects.toBeInstanceOf(ConflictException)

    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const deniedProbe = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(
      deniedProbe.service.create({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'RFI',
        question: 'Question',
        priority: 'normal',
        assignedTo: null,
        dueAt: null,
      }, viewer),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
