import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  auditLog,
  dailyTasks,
  db,
  slaLogs,
  users,
} from '@third-code-erp/database'
import type {
  DailyTaskCompletionResult,
  ErpRole,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService, SemanticAuditParams } from '../audit/audit.service'
import type {
  DatabaseService,
  DatabaseTransaction,
} from '../database/database.service'
import { DailyTaskCompletionService } from './daily-task-completion.service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const ASSIGNEE_ID = '44444444-4444-4444-8444-444444444444'
const TASK_ID = '55555555-5555-4555-8555-555555555555'
const PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const COMPLETED_AT = new Date('2026-09-03T04:00:00.000Z')

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'safety',
  email: 'safety@example.test',
}

type TaskState = {
  id: string
  tenantId: string
  projectId: string
  assigneeId: string | null
  title: string
  status: 'pending' | 'done' | 'skipped'
  completionNotes: string | null
  completedAt: Date | null
  completedBy: string | null
}

type Receipt = {
  tenantId: string
  entityId: string
  keyHash: string
  commandHash: string
}

function harness({
  role = 'safety',
  membershipExists = true,
  taskTenantId = TENANT_ID,
  assigneeId = USER_ID,
  title = 'Daily site walk',
  status = 'pending',
  failAuditOnce = false,
  failSlaOnce = false,
  slaOpen = true,
  completedAt = null,
  completedBy = null,
  completionNotes = null,
}: {
  role?: ErpRole
  membershipExists?: boolean
  taskTenantId?: string
  assigneeId?: string | null
  title?: string
  status?: TaskState['status']
  failAuditOnce?: boolean
  failSlaOnce?: boolean
  slaOpen?: boolean
  completedAt?: Date | null
  completedBy?: string | null
  completionNotes?: string | null
} = {}) {
  let task: TaskState = {
    id: TASK_ID,
    tenantId: taskTenantId,
    projectId: PROJECT_ID,
    assigneeId,
    title,
    status,
    completionNotes,
    completedAt,
    completedBy,
  }
  let openSla = slaOpen
  let receipts: Receipt[] = []
  let auditFailures = failAuditOnce ? 1 : 0
  let slaFailures = failSlaOnce ? 1 : 0
  let transactionWrites: string[] = []
  const committedWrites: string[] = []
  const advisoryLocks: unknown[] = []

  const rowsFor = (table: unknown): object[] => {
    if (table === users) {
      return membershipExists
        ? [{ tenantId: TENANT_ID, role, email: `${role}@example.test` }]
        : []
    }
    if (table === dailyTasks) {
      return task.tenantId === TENANT_ID ? [{ ...task }] : []
    }
    if (table === auditLog) {
      return receipts.map((receipt) => ({
        entityId: receipt.entityId,
        diff: {
          idempotency_key_hash: receipt.keyHash,
          command_hash: receipt.commandHash,
        },
      }))
    }
    return []
  }

  const select = vi.fn().mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () => {
          const rows = rowsFor(table)
          return Object.assign(Promise.resolve(rows), {
            for: async () => rows,
          })
        },
      }),
    }),
  }))

  const update = vi.fn().mockImplementation((table: unknown) => ({
    set: (payload: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          if (table === dailyTasks) {
            if (task.status !== 'pending' || task.tenantId !== TENANT_ID) {
              return []
            }
            const nextCompletedAt = payload.completed_at
            const nextCompletedBy = payload.completed_by
            if (!(nextCompletedAt instanceof Date)) {
              throw new TypeError('Expected Date completion timestamp')
            }
            if (typeof nextCompletedBy !== 'string') {
              throw new TypeError('Expected completion actor')
            }
            task = {
              ...task,
              status: 'done',
              completionNotes:
                typeof payload.completion_notes === 'string'
                  ? payload.completion_notes
                  : null,
              completedAt: nextCompletedAt,
              completedBy: nextCompletedBy,
            }
            transactionWrites.push('task-update')
            return [{ ...task }]
          }
          if (table === slaLogs) {
            if (slaFailures > 0) {
              slaFailures -= 1
              throw new Error('injected SLA failure')
            }
            if (!openSla) return []
            openSla = false
            transactionWrites.push('sla-close')
            return [{ id: '77777777-7777-4777-8777-777777777777' }]
          }
          return []
        },
      }),
    }),
  }))

  const transactionClient = {
    select,
    update,
    execute: vi.fn().mockImplementation(async (query: unknown) => {
      advisoryLocks.push(query)
    }),
  }
  let transactionTail = Promise.resolve()
  const transaction = vi.fn(
    (callback: (client: typeof transactionClient) => Promise<unknown>) => {
      const execute = async () => {
        const taskSnapshot = { ...task }
        const receiptSnapshot = receipts.map((receipt) => ({ ...receipt }))
        const slaSnapshot = openSla
        transactionWrites = []
        try {
          const result = await callback(transactionClient)
          committedWrites.push(...transactionWrites)
          return result
        } catch (error) {
          task = taskSnapshot
          receipts = receiptSnapshot
          openSla = slaSnapshot
          throw error
        } finally {
          transactionWrites = []
        }
      }
      const result = transactionTail.then(execute)
      transactionTail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    }
  )
  const audit: AuditService = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockImplementation(
      async (_transaction: DatabaseTransaction, params: SemanticAuditParams) => {
        if (auditFailures > 0) {
          auditFailures -= 1
          throw new Error('injected audit failure')
        }
        const keyHash = params.diff.idempotency_key_hash
        const commandHash = params.diff.command_hash
        if (typeof keyHash !== 'string' || typeof commandHash !== 'string') {
          throw new TypeError('Expected redacted receipt hashes')
        }
        receipts.push({
          tenantId: params.tenantId,
          entityId: params.entityId,
          keyHash,
          commandHash,
        })
        transactionWrites.push('semantic-audit')
      }
    ),
  }
  const database: DatabaseService = {
    client: new Proxy(db, {
      get(target, property, receiver) {
        return property === 'transaction'
          ? transaction
          : Reflect.get(target, property, receiver)
      },
    }),
    ping: vi.fn().mockResolvedValue(undefined),
  }
  const service = new DailyTaskCompletionService(database, audit, () => COMPLETED_AT)

  return {
    service,
    audit,
    transactionClient,
    committedWrites,
    advisoryLocks,
    task: () => ({ ...task }),
    openSla: () => openSla,
    receipts: () => receipts.map((receipt) => ({ ...receipt })),
  }
}

describe('Daily task completion atomic authority', () => {
  it.each<ErpRole>(['owner', 'admin', 'sd_pm_pe', 'pm', 'safety'])(
    'allows current %s membership through the central capability',
    async (role) => {
      const probe = harness({ role })
      await expect(
        probe.service.complete(TASK_ID, {}, PRINCIPAL, `complete-${role}`)
      ).resolves.toMatchObject({
        ok: true,
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        assigneeId: USER_ID,
        status: 'done',
        completedAt: COMPLETED_AT.toISOString(),
        completedBy: USER_ID,
      })
      expect(probe.committedWrites).toEqual([
        'task-update',
        'sla-close',
        'semantic-audit',
      ])
    }
  )

  it.each<ErpRole>([
    'estimator',
    'commercial',
    'design',
    'finance',
    'procurement',
    'cx',
    'sales',
    'viewer',
  ])('denies current %s membership before effects', async (role) => {
    const probe = harness({ role })
    await expect(
      probe.service.complete(TASK_ID, {}, PRINCIPAL, `denied-${role}`)
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.committedWrites).toEqual([])
    expect(probe.audit.stampActor).not.toHaveBeenCalled()
  })

  it('denies stale membership before effects', async () => {
    const probe = harness({ membershipExists: false })
    await expect(
      probe.service.complete(TASK_ID, {}, PRINCIPAL, 'stale-membership')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.committedWrites).toEqual([])
  })

  it('conceals missing and cross-tenant tasks', async () => {
    for (const taskTenantId of [OTHER_TENANT_ID]) {
      const probe = harness({ taskTenantId })
      await expect(
        probe.service.complete(TASK_ID, {}, PRINCIPAL, 'missing-task')
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(probe.committedWrites).toEqual([])
    }
  })

  it.each<ErpRole>(['sd_pm_pe', 'pm', 'safety'])(
    'requires normal %s users to own the assigned task',
    async (role) => {
      const probe = harness({ role, assigneeId: ASSIGNEE_ID })
      await expect(
        probe.service.complete(TASK_ID, {}, PRINCIPAL, `wrong-assignee-${role}`)
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(probe.committedWrites).toEqual([])
    }
  )

  it.each<ErpRole>(['owner', 'admin'])(
    'allows %s tenant override for another or unassigned task',
    async (role) => {
      for (const assigneeId of [ASSIGNEE_ID, null]) {
        const probe = harness({ role, assigneeId })
        await expect(
          probe.service.complete(
            TASK_ID,
            {},
            PRINCIPAL,
            `override-${role}-${String(assigneeId)}`
          )
        ).resolves.toMatchObject({ status: 'done', completedBy: USER_ID })
      }
    }
  )

  it('requires meaningful trimmed notes for the canonical toolbox task', async () => {
    for (const notes of [undefined, '   ']) {
      const probe = harness({ title: '  TOOLBOX MEETING LOG  ' })
      await expect(
        probe.service.complete(TASK_ID, { notes }, PRINCIPAL, 'toolbox-empty')
      ).rejects.toBeInstanceOf(ConflictException)
      expect(probe.committedWrites).toEqual([])
    }
    const probe = harness({ title: ' Toolbox Meeting Log ' })
    await expect(
      probe.service.complete(
        TASK_ID,
        { notes: '  PPE reviewed  ' },
        PRINCIPAL,
        'toolbox-complete'
      )
    ).resolves.toMatchObject({ completionNotes: 'PPE reviewed' })
  })

  it('returns an authorized canonical done task with zero new effects', async () => {
    const probe = harness({
      status: 'done',
      completionNotes: 'Already complete',
      completedAt: COMPLETED_AT,
      completedBy: ASSIGNEE_ID,
      slaOpen: false,
    })
    await expect(
      probe.service.complete(TASK_ID, {}, PRINCIPAL, 'already-done')
    ).resolves.toEqual({
      ok: true,
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      assigneeId: USER_ID,
      status: 'done',
      completionNotes: 'Already complete',
      completedAt: COMPLETED_AT.toISOString(),
      completedBy: ASSIGNEE_ID,
    } satisfies DailyTaskCompletionResult)
    expect(probe.committedWrites).toEqual([])
    expect(probe.receipts()).toEqual([])
  })

  it('rejects skipped and malformed legacy done states without effects', async () => {
    const skipped = harness({ status: 'skipped' })
    await expect(
      skipped.service.complete(TASK_ID, {}, PRINCIPAL, 'skipped')
    ).rejects.toBeInstanceOf(ConflictException)
    expect(skipped.committedWrites).toEqual([])

    const malformed = harness({ status: 'done' })
    await expect(
      malformed.service.complete(TASK_ID, {}, PRINCIPAL, 'malformed-done')
    ).rejects.toBeInstanceOf(InternalServerErrorException)
    expect(malformed.committedWrites).toEqual([])
  })

  it('uses the same timestamp for task completion and every open matching SLA', async () => {
    const probe = harness()
    const result = await probe.service.complete(
      TASK_ID,
      { notes: 'Complete' },
      PRINCIPAL,
      'same-time'
    )
    expect(result.completedAt).toBe(COMPLETED_AT.toISOString())
    expect(probe.task().completedAt).toEqual(COMPLETED_AT)
    expect(probe.openSla()).toBe(false)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'daily_task',
        entityId: TASK_ID,
        action: 'status_change',
        diff: expect.objectContaining({
          from_status: 'pending',
          to_status: 'done',
          source: 'daily_task_completion_core',
          idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          command_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    )
  })

  it('treats absence of a matching open legacy SLA as a successful no-op', async () => {
    const probe = harness({ slaOpen: false })
    await expect(
      probe.service.complete(TASK_ID, {}, PRINCIPAL, 'no-open-sla')
    ).resolves.toMatchObject({ status: 'done' })
    expect(probe.committedWrites).toEqual(['task-update', 'semantic-audit'])
  })

  it.each(['audit', 'sla'] as const)(
    'rolls task, SLA, receipt, and audit effects back on %s failure',
    async (failure) => {
      const probe = harness({
        failAuditOnce: failure === 'audit',
        failSlaOnce: failure === 'sla',
      })
      await expect(
        probe.service.complete(TASK_ID, {}, PRINCIPAL, `fail-${failure}`)
      ).rejects.toThrow(`injected ${failure === 'sla' ? 'SLA' : 'audit'} failure`)
      expect(probe.task().status).toBe('pending')
      expect(probe.openSla()).toBe(true)
      expect(probe.receipts()).toEqual([])
      expect(probe.committedWrites).toEqual([])
    }
  )

  it('replays the same key and command with one task, SLA, and audit effect', async () => {
    const probe = harness()
    const first = await probe.service.complete(
      TASK_ID,
      { notes: 'Complete' },
      PRINCIPAL,
      'stable-key'
    )
    const replay = await probe.service.complete(
      TASK_ID,
      { notes: 'Complete' },
      PRINCIPAL,
      'stable-key'
    )
    expect(replay).toEqual(first)
    expect(probe.committedWrites).toEqual([
      'task-update',
      'sla-close',
      'semantic-audit',
    ])
    expect(probe.receipts()).toHaveLength(1)
    expect(probe.advisoryLocks).toHaveLength(2)
  })

  it('rejects same-key reuse for a different normalized command', async () => {
    const probe = harness()
    await probe.service.complete(
      TASK_ID,
      { notes: 'First' },
      PRINCIPAL,
      'reused-key'
    )
    await expect(
      probe.service.complete(
        TASK_ID,
        { notes: 'Different' },
        PRINCIPAL,
        'reused-key'
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.committedWrites).toEqual([
      'task-update',
      'sla-close',
      'semantic-audit',
    ])
  })

  it('serializes concurrent same-key commands to a single effect', async () => {
    const probe = harness()
    const results = await Promise.all([
      probe.service.complete(TASK_ID, {}, PRINCIPAL, 'concurrent-key'),
      probe.service.complete(TASK_ID, {}, PRINCIPAL, 'concurrent-key'),
    ])
    expect(results[1]).toEqual(results[0])
    expect(probe.committedWrites).toEqual([
      'task-update',
      'sla-close',
      'semantic-audit',
    ])
    expect(probe.receipts()).toHaveLength(1)
  })
})
