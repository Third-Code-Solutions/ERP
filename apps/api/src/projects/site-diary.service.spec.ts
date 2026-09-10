import 'reflect-metadata'

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { siteDiaryEntries } from '@third-code-erp/database/schema'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { SiteDiaryService } from './site-diary.service'

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

function row(overrides: Partial<{
  status: string
  version: number
  workCompleted: string
  submittedAt: Date | null
  submittedBy: string | null
}> = {}) {
  return {
    id: ENTRY_ID,
    projectId: PROJECT_ID,
    diaryDate: '2026-09-10',
    status: overrides.status ?? 'draft',
    weather: 'Cloudy',
    manpowerCount: 14,
    workCompleted: overrides.workCompleted ?? 'MEP rough-in progressed.',
    constraints: 'Awaiting ceiling detail.',
    safetyNotes: 'Toolbox talk completed.',
    createdBy: PRINCIPAL.userId,
    submittedAt: overrides.submittedAt ?? null,
    submittedBy: overrides.submittedBy ?? null,
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
  return { service: new SiteDiaryService(database, audit), audit, insert, update, select }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const project = [{ id: PROJECT_ID }]

describe('SiteDiaryService', () => {
  it('creates one tenant/project/day entry and audits it', async () => {
    const probe = harness([membership, project, [], [],], { insertResult: [row()] })
    await expect(probe.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      weather: 'Cloudy',
      manpowerCount: 14,
      workCompleted: 'MEP rough-in progressed.',
      constraints: 'Awaiting ceiling detail.',
      safetyNotes: 'Toolbox talk completed.',
    }, PRINCIPAL)).resolves.toMatchObject({ created: true, entry: { diaryDate: '2026-09-10' } })
    expect(probe.insert).toHaveBeenCalledWith(siteDiaryEntries)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'create' }))
  })

  it('replays the same request without inserting and rejects date conflicts', async () => {
    const replay = harness([membership, project, [row()]])
    await expect(replay.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      weather: 'Cloudy',
      manpowerCount: 14,
      workCompleted: 'MEP rough-in progressed.',
      constraints: 'Awaiting ceiling detail.',
      safetyNotes: 'Toolbox talk completed.',
    }, PRINCIPAL)).resolves.toMatchObject({ created: false })
    expect(replay.insert).not.toHaveBeenCalled()

    const conflict = harness([membership, project, [], [row()]])
    await expect(conflict.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      weather: 'Sunny',
      manpowerCount: 12,
      workCompleted: 'Different entry.',
      constraints: '',
      safetyNotes: '',
    }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
  })

  it('updates drafts with versioning, then submits them immutably', async () => {
    const current = row()
    const updated = row({ version: 2, workCompleted: 'Updated work.' })
    const updateProbe = harness([membership, project, [current]], { updateResult: [updated] })
    await expect(updateProbe.service.update(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 1,
      weather: 'Sunny',
      manpowerCount: 16,
      workCompleted: 'Updated work.',
      constraints: '',
      safetyNotes: 'PPE checked.',
    }, PRINCIPAL)).resolves.toMatchObject({ changed: true, entry: { version: 2 } })
    expect(updateProbe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'update' }))

    const submitted = row({ status: 'submitted', version: 2, submittedAt: new Date('2026-09-10T01:00:00.000Z'), submittedBy: PRINCIPAL.userId })
    const submitProbe = harness([membership, project, [row()]], { updateResult: [submitted] })
    await expect(submitProbe.service.submit(PROJECT_ID, ENTRY_ID, { expectedVersion: 1 }, PRINCIPAL)).resolves.toMatchObject({ changed: true, entry: { status: 'submitted' } })

    const immutableProbe = harness([membership, project, [submitted]])
    await expect(immutableProbe.service.update(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 2,
      weather: 'Sunny',
      manpowerCount: 16,
      workCompleted: 'Another edit.',
      constraints: '',
      safetyNotes: '',
    }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
  })

  it('requires work before submit and denies roles without diary manage', async () => {
    const empty = row({ workCompleted: '' })
    const emptyProbe = harness([membership, project, [empty]])
    await expect(emptyProbe.service.submit(PROJECT_ID, ENTRY_ID, { expectedVersion: 1 }, PRINCIPAL)).rejects.toBeInstanceOf(BadRequestException)
    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const denied = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(denied.service.create({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      manpowerCount: 0,
      workCompleted: 'x',
      weather: '',
      constraints: '',
      safetyNotes: '',
    }, viewer)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
