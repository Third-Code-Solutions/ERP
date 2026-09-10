import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectWeeklyProgressService } from './project-weekly-progress.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PERIOD_ID = '44444444-4444-4444-8444-444444444444'
const PROGRESS_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const CREATED_AT = new Date('2026-09-10T00:00:00.000Z')
const PERCENTAGES = {
  civil_pct: 40,
  electrical_pct: 50,
  mep_pct: 30,
  finishes_pct: 20,
  overall_pct: 35,
}

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy', 'innerJoin']) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.for = vi.fn().mockResolvedValue(result)
  builder.then = (
    onFulfilled?: (value: unknown[]) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function weeklyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PERIOD_ID,
    projectId: PROJECT_ID,
    progressUpdateId: PROGRESS_ID,
    clientRequestId: REQUEST_ID,
    requestHash: 'a'.repeat(64),
    weekEnding: '2026-09-13',
    cutoffAt: new Date('2026-09-17T09:00:00.000Z'),
    status: 'open' as const,
    warSnapshot: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: '',
    version: 1,
    createdBy: PRINCIPAL.userId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    percentByCategory: PERCENTAGES,
    notes: 'Weekly site capture',
    ...overrides,
  }
}

function harness(
  selectResults: unknown[],
  options: { insertResults?: unknown[][]; updateResults?: unknown[][] } = {},
) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertResults = [...(options.insertResults ?? [])]
  const updateResults = [...(options.updateResults ?? [])]
  const insert = vi.fn(() => {
    const insertQuery: Record<string, unknown> = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(insertResults.shift() ?? []),
    }
    return insertQuery
  })
  const update = vi.fn(() => {
    const updateQuery: Record<string, unknown> = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(updateResults.shift() ?? []),
    }
    return updateQuery
  })
  const transactionClient = { select, insert, update }
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return { service: new ProjectWeeklyProgressService(database, audit), audit, insert, update }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const project = [{ id: PROJECT_ID }]

describe('ProjectWeeklyProgressService', () => {
  it('captures a weekly progress period idempotently and audits the evidence', async () => {
    const probe = harness(
      [membership, project, [], []],
      { insertResults: [[{ id: PROGRESS_ID }], [weeklyRow()]] },
    )

    await expect(
      probe.service.create(
        {
          projectId: PROJECT_ID,
          clientRequestId: REQUEST_ID,
          weekEnding: '2026-09-13',
          percentByCategory: PERCENTAGES,
          notes: 'Weekly site capture',
        },
        PRINCIPAL,
        new Date('2026-09-10T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ created: true, changed: true, row: { id: PERIOD_ID, status: 'open' } })
    expect(probe.insert).toHaveBeenCalledTimes(2)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'project_weekly_progress', action: 'create' }),
    )
  })

  it('locks a captured period only after cut-off with optimistic concurrency', async () => {
    const current = weeklyRow()
    const updated = weeklyRow({
      status: 'locked',
      version: 2,
      lockedAt: new Date('2026-09-17T10:00:00.000Z'),
      lockedBy: PRINCIPAL.userId,
      lockReason: 'Thursday WAR cut-off',
      warSnapshot: {
        weekEnding: '2026-09-13',
        overallPct: 35,
        percentByCategory: PERCENTAGES,
        notes: 'Weekly site capture',
        capturedAt: '2026-09-17T10:00:00.000Z',
      },
    })
    const probe = harness([membership, project, [current]], { updateResults: [[updated]] })

    await expect(
      probe.service.lock(
        PROJECT_ID,
        PERIOD_ID,
        { expectedVersion: 1, lockReason: 'Thursday WAR cut-off' },
        PRINCIPAL,
        new Date('2026-09-17T10:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ changed: true, row: { status: 'locked', version: 2 } })
    expect(probe.update).toHaveBeenCalledTimes(1)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'project_weekly_progress', action: 'lock' }),
    )
  })

  it('rejects pre-cut-off capture and viewer mutation', async () => {
    const beforeCutoff = harness([membership, project, [], []])
    await expect(
      beforeCutoff.service.create(
        {
          projectId: PROJECT_ID,
          clientRequestId: REQUEST_ID,
          weekEnding: '2026-09-13',
          percentByCategory: PERCENTAGES,
          notes: '',
        },
        PRINCIPAL,
        new Date('2026-09-17T09:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException)

    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const denied = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(
      denied.service.create(
        {
          projectId: PROJECT_ID,
          clientRequestId: REQUEST_ID,
          weekEnding: '2026-09-13',
          percentByCategory: PERCENTAGES,
          notes: '',
        },
        viewer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
