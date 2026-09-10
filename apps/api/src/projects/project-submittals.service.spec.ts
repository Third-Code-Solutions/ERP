import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { projectSubmittals } from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectSubmittalsService } from './project-submittals.service'

const PRINCIPAL: ErpPrincipal = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'pm', email: 'pm@example.test' }
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CREATED_AT = new Date('2026-09-10T00:00:00.000Z')

function row(overrides: Partial<{ status: string; version: number; rejectionReason: string }> = {}) {
  const status = overrides.status ?? 'draft'
  const submitted = status !== 'draft'
  const reviewed = status === 'approved' || status === 'rejected'
  return {
    id: SUBMITTAL_ID,
    projectId: PROJECT_ID,
    submittalNumber: 'SUB-0001',
    title: 'HVAC shop drawing',
    description: 'Submit coordinated HVAC shop drawings.',
    specSection: '23 30 00',
    discipline: 'Mechanical',
    planReference: 'M-202',
    dueDate: '2026-09-18',
    status,
    submissionNotes: submitted ? 'Please review.' : '',
    reviewNotes: reviewed ? 'Reviewed.' : '',
    rejectionReason: overrides.rejectionReason ?? (status === 'rejected' ? 'Revise routing.' : ''),
    requestedBy: PRINCIPAL.userId,
    assignedTo: null,
    submittedAt: submitted ? new Date('2026-09-10T01:00:00.000Z') : null,
    submittedBy: submitted ? PRINCIPAL.userId : null,
    reviewStartedAt: status === 'under_review' || reviewed ? new Date('2026-09-10T02:00:00.000Z') : null,
    reviewStartedBy: status === 'under_review' || reviewed ? PRINCIPAL.userId : null,
    reviewedAt: reviewed ? new Date('2026-09-10T03:00:00.000Z') : null,
    reviewedBy: reviewed ? PRINCIPAL.userId : null,
    version: overrides.version ?? 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder); builder.where = vi.fn().mockReturnValue(builder); builder.limit = vi.fn().mockReturnValue(builder); builder.offset = vi.fn().mockReturnValue(builder); builder.orderBy = vi.fn().mockReturnValue(builder); builder.for = vi.fn().mockResolvedValue(result); builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[], options?: { insertResult?: unknown[]; updateResult?: unknown[] }) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertQuery: Record<string, unknown> = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.insertResult ?? []) }
  const updateQuery: Record<string, unknown> = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.updateResult ?? []) }
  const insert = vi.fn().mockReturnValue(insertQuery); const update = vi.fn().mockReturnValue(updateQuery)
  const transactionClient = { select, insert, update }
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = { stampActor: vi.fn().mockResolvedValue(undefined), writeSemantic: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService
  return { service: new ProjectSubmittalsService(database, audit), audit, insert, update }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const project = [{ id: PROJECT_ID }]

describe('ProjectSubmittalsService', () => {
  it('creates a numbered submittal and audits it', async () => {
    const probe = harness([membership, project, [], [{ total: 0 }]], { insertResult: [row()] })
    await expect(probe.service.create({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, title: 'HVAC shop drawing', description: 'Submit coordinated HVAC shop drawings.', specSection: '23 30 00', discipline: 'Mechanical', planReference: 'M-202', dueDate: '2026-09-18', assignedTo: null }, PRINCIPAL)).resolves.toMatchObject({ created: true, submittal: { submittalNumber: 'SUB-0001' } })
    expect(probe.insert).toHaveBeenCalledWith(projectSubmittals)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'project_submittal', action: 'create' }))
  })

  it('submits, starts review, and records an approval with versions', async () => {
    const submitted = row({ status: 'submitted', version: 2 })
    const submitProbe = harness([membership, project, [row()]], { updateResult: [submitted] })
    await expect(submitProbe.service.submit(PROJECT_ID, SUBMITTAL_ID, { expectedVersion: 1, submissionNotes: 'Review the latest coordination.' }, PRINCIPAL)).resolves.toMatchObject({ submittal: { status: 'submitted', version: 2 } })
    const underReview = row({ status: 'under_review', version: 3 })
    const reviewProbe = harness([membership, project, [submitted]], { updateResult: [underReview] })
    await expect(reviewProbe.service.startReview(PROJECT_ID, SUBMITTAL_ID, { expectedVersion: 2 }, PRINCIPAL)).resolves.toMatchObject({ submittal: { status: 'under_review', version: 3 } })
    const approved = row({ status: 'approved', version: 4 })
    const approveProbe = harness([membership, project, [underReview]], { updateResult: [approved] })
    await expect(approveProbe.service.decide(PROJECT_ID, SUBMITTAL_ID, { expectedVersion: 3, decision: 'approve', reviewNotes: 'Approved for construction.', rejectionReason: '' }, PRINCIPAL)).resolves.toMatchObject({ submittal: { status: 'approved', version: 4 } })
    expect(approveProbe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'approve' }))
  })

  it('rejects stale writes and unauthorized creates', async () => {
    const staleProbe = harness([membership, project, [row({ version: 2 })]])
    await expect(staleProbe.service.submit(PROJECT_ID, SUBMITTAL_ID, { expectedVersion: 1, submissionNotes: '' }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const deniedProbe = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(deniedProbe.service.create({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, title: 'Submittal', description: 'Description', specSection: '', discipline: '', planReference: '', dueDate: null, assignedTo: null }, viewer)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
