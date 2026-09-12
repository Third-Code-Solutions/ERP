import 'reflect-metadata'

import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { punchlistItems, qualityHoldPointPunchlistHandoffs } from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { QualityHoldPointsService } from './quality-hold-points.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const IWR_ID = '44444444-4444-4444-8444-444444444444'
const HANDOFF_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CREATED_AT = new Date('2026-09-11T01:00:00.000Z')

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder)
  builder.where = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.orderBy = vi.fn().mockReturnValue(builder)
  builder.offset = vi.fn().mockReturnValue(builder)
  builder.for = vi.fn().mockResolvedValue(result)
  builder.then = (
    onFulfilled?: (value: unknown[]) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function source(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: IWR_ID,
    projectId: PROJECT_ID,
    status: 'rejected',
    iwrNumber: 'IWR-0007',
    findings: 'Membrane blistering at the north wall.',
    rejectionReason: 'Repair and resubmit before concealment.',
    punchlistHandoffAt: null,
    ...overrides,
  }
}

function handoff(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: HANDOFF_ID,
    tenantId: PRINCIPAL.tenantId,
    projectId: PROJECT_ID,
    qualityHoldPointId: IWR_ID,
    clientRequestId: REQUEST_ID,
    requestHash: 'request-hash',
    sourceIwrNumber: 'IWR-0007',
    sourceFindings: 'Membrane blistering at the north wall.',
    sourceRejectionReason: 'Repair and resubmit before concealment.',
    planDocumentId: null,
    createdBy: PRINCIPAL.userId,
    createdAt: CREATED_AT,
    ...overrides,
  }
}

function item(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ITEM_ID,
    projectId: PROJECT_ID,
    description: 'Repair failed waterproofing at the north wall.',
    location: null,
    trade: 'Waterproofing',
    priority: 'high',
    status: 'open',
    dueDate: null,
    assignedToUserId: null,
    assignedToText: null,
    createdAt: CREATED_AT,
    createdBy: PRINCIPAL.userId,
    sourceHandoffId: HANDOFF_ID,
    ...overrides,
  }
}

function harness(
  selectResults: unknown[],
  options: {
    insertResults?: unknown[][]
    updateResult?: unknown[]
    auditError?: Error
  } = {},
) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertResults = [...(options.insertResults ?? [])]
  const insert = vi.fn(() => {
    const insertQuery: Record<string, unknown> = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(insertResults.shift() ?? []),
    }
    return insertQuery
  })
  const updateQuery: Record<string, unknown> = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(options.updateResult ?? []),
  }
  const update = vi.fn().mockReturnValue(updateQuery)
  const execute = vi.fn().mockResolvedValue([])
  const transactionClient = { select, insert, update, execute }
  const transaction = vi.fn(
    async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
  )
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: options.auditError
      ? vi.fn().mockRejectedValue(options.auditError)
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return { service: new QualityHoldPointsService(database, audit), audit, insert, update, select, transaction }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const tenant = [{ id: PRINCIPAL.tenantId }]
const project = [{ id: PROJECT_ID }]

const command = {
  clientRequestId: REQUEST_ID,
  planDocumentId: null,
  items: [{
    description: 'Repair failed waterproofing at the north wall.',
    location: null,
    trade: 'Waterproofing',
    priority: 'high' as const,
    dueDate: null,
    assignedToUserId: null,
    assignedToText: null,
  }],
}

const COMMAND_HASH = createHash('sha256').update(JSON.stringify(command)).digest('hex')

describe('QualityHoldPointsService rejected-IWR punchlist handoff', () => {
  it('maps nested PostgreSQL contention only after the transaction rejects', async () => {
    const probe = harness([])
    probe.transaction.mockRejectedValueOnce({ cause: { cause: { code: '55P03' } } })
    await expect(probe.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    const otherError = new Error('Unrelated failure')
    probe.transaction.mockRejectedValueOnce(otherError)
    await expect(probe.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL)).rejects.toBe(otherError)
  })
  it('creates linked punchlist rows, snapshots rejection evidence, locks the IWR, and audits atomically', async () => {
    const probe = harness(
      [membership, tenant, project, [source()], [], [],],
      { insertResults: [[handoff({ requestHash: undefined })], [item()]], updateResult: [{ id: IWR_ID }] },
    )
    const result = await probe.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL)

    expect(result).toMatchObject({
      created: true,
      clientRequestId: REQUEST_ID,
      changed: true,
      qualityHoldPointId: IWR_ID,
      handoffId: HANDOFF_ID,
      source: {
        iwrNumber: 'IWR-0007',
        findings: 'Membrane blistering at the north wall.',
        rejectionReason: 'Repair and resubmit before concealment.',
      },
      items: [{ id: ITEM_ID, sourceHandoffId: HANDOFF_ID }],
    })
    expect(probe.insert).toHaveBeenNthCalledWith(1, qualityHoldPointPunchlistHandoffs)
    expect(probe.insert).toHaveBeenNthCalledWith(2, punchlistItems)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'quality_hold_point_punchlist_handoff',
        action: 'create',
        diff: expect.objectContaining({
          quality_hold_point_id: IWR_ID,
          source_rejection_reason: 'Repair and resubmit before concealment.',
          punchlist_item_ids: [ITEM_ID],
        }),
      }),
    )
  })

  it('replays the same client request without duplicating linked rows', async () => {
    const probe = harness([membership, tenant, project, [source({ punchlistHandoffAt: CREATED_AT })], [handoff({ requestHash: COMMAND_HASH })], [item()]])
    const result = await probe.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL)

    expect(result).toMatchObject({ clientRequestId: REQUEST_ID, created: false, changed: false, handoffId: HANDOFF_ID, items: [{ id: ITEM_ID }] })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('denies accepted IWRs, a second handoff, and a caller without punchlist capability', async () => {
    const accepted = harness([membership, tenant, project, [source({ status: 'accepted' })]])
    await expect(accepted.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL))
      .rejects.toBeInstanceOf(ConflictException)

    const locked = harness([membership, tenant, project, [source({ punchlistHandoffAt: CREATED_AT })], [handoff({ clientRequestId: '99999999-9999-4999-8999-999999999999' })]])
    await expect(locked.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL))
      .rejects.toBeInstanceOf(ConflictException)

    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const denied = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(denied.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, viewer))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a plan document outside the tenant/project and rolls back when audit fails', async () => {
    const withDocument = {
      ...command,
      planDocumentId: '88888888-8888-4888-8888-888888888888',
    }
    const documentDenied = harness([membership, tenant, project, [source()], [], []])
    await expect(documentDenied.service.handoffToPunchlist(PROJECT_ID, IWR_ID, withDocument, PRINCIPAL))
      .rejects.toBeInstanceOf(NotFoundException)
    expect(documentDenied.insert).not.toHaveBeenCalled()

    const auditFailure = new Error('audit unavailable')
    const probe = harness(
      [membership, tenant, project, [source()], [], [],],
      { insertResults: [[handoff({ requestHash: undefined })], [item()]], updateResult: [{ id: IWR_ID }], auditError: auditFailure },
    )
    await expect(probe.service.handoffToPunchlist(PROJECT_ID, IWR_ID, command, PRINCIPAL))
      .rejects.toBe(auditFailure)
    expect(probe.transaction).toHaveBeenCalledTimes(1)
  })
})
