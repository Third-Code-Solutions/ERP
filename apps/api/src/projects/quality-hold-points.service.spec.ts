import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { qualityHoldPoints } from '@third-code-erp/database/schema'
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
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CREATED_AT = new Date('2026-09-10T00:00:00.000Z')

function row(overrides: Partial<{ status: string; version: number; rejectionReason: string }> = {}) {
  return {
    id: ENTRY_ID,
    projectId: PROJECT_ID,
    iwrNumber: 'IWR-0001',
    title: 'Concrete pour inspection',
    description: 'Verify reinforcement before the pour.',
    discipline: 'Structural',
    location: 'Level 2 slab',
    planReference: 'S-201 detail 4',
    holdPoint: true,
    inspectionDate: '2026-09-12',
    status: overrides.status ?? 'planned',
    requestNotes: '',
    findings: '',
    rejectionReason: overrides.rejectionReason ?? '',
    acceptanceNotes: '',
    requestedBy: PRINCIPAL.userId,
    assignedTo: null,
    submittedAt: null as Date | null,
    submittedBy: null as string | null,
    acceptedAt: null as Date | null,
    acceptedBy: null as string | null,
    rejectedAt: null as Date | null,
    rejectedBy: null as string | null,
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

function harness(selectResults: unknown[], options?: { insertResult?: unknown[]; updateResult?: unknown[] }) {
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
    async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
  )
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new QualityHoldPointsService(database, audit),
    audit,
    insert,
    update,
    select,
  }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const project = [{ id: PROJECT_ID }]

describe('QualityHoldPointsService', () => {
  it('creates a numbered IWR and audits the hold point', async () => {
    const probe = harness([membership, project, [], [{ total: 0 }]], { insertResult: [row()] })
    await expect(probe.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'Concrete pour inspection',
      description: 'Verify reinforcement before the pour.',
      discipline: 'Structural',
      location: 'Level 2 slab',
      planReference: 'S-201 detail 4',
      holdPoint: true,
      inspectionDate: '2026-09-12',
      assignedTo: null,
    }, PRINCIPAL)).resolves.toMatchObject({ created: true, entry: { iwrNumber: 'IWR-0001' } })
    expect(probe.insert).toHaveBeenCalledWith(qualityHoldPoints)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'quality_hold_point', action: 'create', entityId: ENTRY_ID }),
    )
  })

  it('replays an identical client request without duplicating an IWR', async () => {
    const probe = harness([membership, project, [row()]])
    await expect(probe.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'Concrete pour inspection',
      description: 'Verify reinforcement before the pour.',
      discipline: 'Structural',
      location: 'Level 2 slab',
      planReference: 'S-201 detail 4',
      holdPoint: true,
      inspectionDate: '2026-09-12',
      assignedTo: null,
    }, PRINCIPAL)).resolves.toMatchObject({ created: false, entry: { id: ENTRY_ID } })
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('prepares then submits a planned hold point with versioned audit events', async () => {
    const prepared = row({ status: 'ready', version: 2 })
    const probe = harness([membership, project, [row()]], { updateResult: [prepared] })
    await expect(probe.service.prepare(PROJECT_ID, ENTRY_ID, { expectedVersion: 1 }, PRINCIPAL))
      .resolves.toMatchObject({ changed: true, entry: { status: 'ready', version: 2 } })
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'status_change' }),
    )

    const submitted = row({ status: 'submitted', version: 3 })
    submitted.submittedAt = new Date('2026-09-10T01:00:00.000Z')
    submitted.submittedBy = PRINCIPAL.userId
    const submitProbe = harness([membership, project, [prepared]], { updateResult: [submitted] })
    await expect(submitProbe.service.submit(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 2,
      requestNotes: 'Please inspect before the Thursday pour.',
    }, PRINCIPAL)).resolves.toMatchObject({ changed: true, entry: { status: 'submitted', version: 3 } })
  })

  it('accepts or rejects only submitted requests and protects stale/unauthorized writes', async () => {
    const current = row({ status: 'submitted' })
    current.submittedAt = new Date('2026-09-10T01:00:00.000Z')
    current.submittedBy = PRINCIPAL.userId
    const accepted = row({ status: 'accepted', version: 2 })
    accepted.submittedAt = current.submittedAt
    accepted.submittedBy = current.submittedBy
    accepted.acceptedAt = new Date('2026-09-10T02:00:00.000Z')
    accepted.acceptedBy = PRINCIPAL.userId
    const probe = harness([membership, project, [current]], { updateResult: [accepted] })
    await expect(probe.service.accept(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 1,
      findings: 'No defects.',
      acceptanceNotes: 'Accepted for continuation.',
    }, PRINCIPAL)).resolves.toMatchObject({ entry: { status: 'accepted' } })

    const staleProbe = harness([membership, project, [row({ version: 2 })]])
    await expect(staleProbe.service.prepare(PROJECT_ID, ENTRY_ID, { expectedVersion: 1 }, PRINCIPAL))
      .rejects.toBeInstanceOf(ConflictException)

    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const deniedProbe = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(deniedProbe.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'IWR',
      description: 'Request',
      discipline: '',
      location: '',
      planReference: '',
      holdPoint: true,
      inspectionDate: null,
      assignedTo: null,
    }, viewer)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
