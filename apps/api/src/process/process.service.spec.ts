import 'reflect-metadata'

import { ConflictException } from '@nestjs/common'
import type {
  ApprovalRoutePreviewQuery,
  CreateApprovalCommand,
  CreateApprovalRuleCommand,
  CreateTaskInstanceCommand,
  DecideApprovalCommand,
  ProcessTaskQueueQuery,
  StartProcessClockCommand,
  UpdateTaskStatusCommand,
} from '@third-code-erp/shared-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProcessService } from './process.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}

const STEP_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const CLOCK_ID = '55555555-5555-4555-8555-555555555555'
const ASSIGNEE_ID = '66666666-6666-4666-8666-666666666666'
const RULE_ID = '88888888-8888-4888-8888-888888888888'
const APPROVAL_ID = '99999999-9999-4999-8999-999999999999'

const TASK = {
  id: TASK_ID,
  tenant_id: PRINCIPAL.tenantId,
  process_step_id: STEP_ID,
  subject_type: 'opportunity',
  subject_id: '77777777-7777-4777-8777-777777777777',
  instance_key: 'opportunity:77777777-7777-4777-8777-777777777777:PR-L',
  assigned_to: ASSIGNEE_ID,
  status: 'pending' as const,
  blocked_reason: null,
  started_at: null,
  completed_at: null,
  created_by: PRINCIPAL.userId,
  updated_by: PRINCIPAL.userId,
  created_at: new Date('2026-08-12T00:00:00.000Z'),
  updated_at: new Date('2026-08-12T00:00:00.000Z'),
}

const STEP = {
  id: STEP_ID,
  tenant_id: PRINCIPAL.tenantId,
  code: 'PR-L',
  stage: 'lead',
  name: 'Lead qualification',
  responsible_bu: 'Sales',
  input: 'Qualified lead',
  input_from: 'Coverage',
  output: 'Qualified opportunity',
  output_by: 'Sales',
  sla_days: 2,
  sla_hours: null,
  is_business_days: true,
  clock_scope: 'internal' as const,
  template_link: null,
  predecessor_code: null,
  is_active: true,
  created_by: PRINCIPAL.userId,
  updated_by: PRINCIPAL.userId,
  created_at: new Date('2026-08-12T00:00:00.000Z'),
  updated_at: new Date('2026-08-12T00:00:00.000Z'),
}

const CLOCK = {
  id: CLOCK_ID,
  tenant_id: PRINCIPAL.tenantId,
  task_instance_id: TASK_ID,
  clock_type: 'calendar_hours' as const,
  clock_scope: 'internal' as const,
  target_value: 24,
  started_at: new Date('2026-08-12T00:00:00.000Z'),
  at_risk_at: new Date('2026-08-12T19:12:00.000Z'),
  due_at: new Date('2026-08-13T00:00:00.000Z'),
  escalation_at: new Date('2026-08-13T12:00:00.000Z'),
  breached_at: null,
  escalated_at: null,
  paused_reason: null,
  status: 'running' as const,
  observe_mode: false,
  created_by: PRINCIPAL.userId,
  updated_by: PRINCIPAL.userId,
  created_at: new Date('2026-08-12T00:00:00.000Z'),
  updated_at: new Date('2026-08-12T00:00:00.000Z'),
}

const TASK_QUEUE_ROW = {
  taskId: TASK_ID,
  processStepId: STEP_ID,
  processStepCode: 'PR-L',
  processStepName: 'Lead qualification',
  responsibleBu: 'Sales',
  subjectType: TASK.subject_type,
  subjectId: TASK.subject_id,
  instanceKey: TASK.instance_key,
  assignedTo: TASK.assigned_to,
  status: TASK.status,
  blockedReason: TASK.blocked_reason,
  startedAt: TASK.started_at,
  completedAt: TASK.completed_at,
  createdAt: TASK.created_at,
  updatedAt: TASK.updated_at,
  clockId: CLOCK_ID,
  clockType: CLOCK.clock_type,
  clockScope: CLOCK.clock_scope,
  clockTargetValue: CLOCK.target_value,
  clockStartedAt: CLOCK.started_at,
  clockDueAt: CLOCK.due_at,
  clockAtRiskAt: CLOCK.at_risk_at,
  clockBreachedAt: CLOCK.breached_at,
  clockEscalatedAt: CLOCK.escalated_at,
  clockStatus: CLOCK.status,
  clockObserveMode: CLOCK.observe_mode,
}

const RULE = {
  id: RULE_ID,
  tenant_id: PRINCIPAL.tenantId,
  object_type: 'purchase_order',
  amount_band_low: 500_000_00n,
  amount_band_high: null,
  approver_role: 'finance',
  sequence: 1,
  escalation_after_days: 2,
  is_active: true,
  created_by: PRINCIPAL.userId,
  updated_by: PRINCIPAL.userId,
  created_at: new Date('2026-08-12T00:00:00.000Z'),
  updated_at: new Date('2026-08-12T00:00:00.000Z'),
}

const APPROVAL = {
  id: APPROVAL_ID,
  tenant_id: PRINCIPAL.tenantId,
  object_type: 'purchase_order',
  object_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  approval_rule_id: RULE_ID,
  sequence: 1,
  approver_user_id: null,
  status: 'pending' as const,
  requested_at: new Date('2026-08-12T00:00:00.000Z'),
  decided_at: null,
  decision_note: null,
  created_by: ASSIGNEE_ID,
  updated_by: ASSIGNEE_ID,
  created_at: new Date('2026-08-12T00:00:00.000Z'),
  updated_at: new Date('2026-08-12T00:00:00.000Z'),
}

afterEach(() => {
  delete process.env.BUSINESS_CALENDAR_DB_ENABLED
})

function chain(result: unknown[]) {
  const state: Record<string, unknown> = {}
  state.from = vi.fn(() => state)
  state.innerJoin = vi.fn(() => state)
  state.leftJoin = vi.fn(() => state)
  state.where = vi.fn(() => state)
  state.limit = vi.fn(() => state)
  state.offset = vi.fn(() => Promise.resolve(result))
  state.for = vi.fn(() => Promise.resolve(result))
  state.orderBy = vi.fn(() => state)
  state.then = (
    resolve: (value: unknown[]) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject)
  return state
}

function harness(selectResults: unknown[][]) {
  const select = vi.fn(() => {
    const result = selectResults.shift()
    if (!result) throw new Error('Unexpected select')
    return chain(result)
  })
  const execute = vi.fn().mockResolvedValue([])
  const updateReturning = vi.fn().mockResolvedValue([])
  const whereUpdate = vi.fn(() => ({ returning: updateReturning }))
  const set = vi.fn(() => ({ where: whereUpdate }))
  const update = vi.fn(() => ({ set }))
  const insertReturning = vi.fn().mockResolvedValue([])
  const values = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values }))
  const transactionClient = {
    select,
    execute,
    update,
    insert,
  }
  const transaction = vi.fn(
    async (
      callback: (tx: typeof transactionClient) => unknown
    ) => callback(transactionClient)
  )
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  const service = new ProcessService(database, audit)
  return {
    service,
    transaction,
    transactionClient,
    audit,
    updateReturning,
    insertReturning,
    insertValues: values,
  }
}

function readHarness(selectResults: unknown[][]) {
  const chains: Array<Record<string, unknown>> = []
  const select = vi.fn(() => {
    const result = selectResults.shift()
    if (!result) throw new Error('Unexpected select')
    const query = chain(result)
    chains.push(query)
    return query
  })
  const transaction = vi.fn()
  const insert = vi.fn()
  const update = vi.fn()
  const database = {
    client: { select, transaction, insert, update },
  } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  const service = new ProcessService(database, audit)
  return { service, select, transaction, insert, update, audit, chains }
}

type RuleOverrides = Omit<
  Partial<typeof RULE>,
  'amount_band_low' | 'amount_band_high'
> & {
  amount_band_low?: bigint
  amount_band_high?: bigint | null
}

type RuleFixture = Omit<typeof RULE, 'amount_band_high'> & {
  amount_band_high: bigint | null
}

function rule(overrides: RuleOverrides): RuleFixture {
  return { ...RULE, ...overrides }
}

describe('ProcessService', () => {
  it('rejects cross-tenant assignees before task insert', async () => {
    const command: CreateTaskInstanceCommand = {
      processStepId: STEP_ID,
      subjectType: 'opportunity',
      subjectId: TASK.subject_id,
      instanceKey: TASK.instance_key,
      assignedTo: ASSIGNEE_ID,
    }
    const probe = harness([
      [{ id: STEP_ID, isActive: true }],
      [],
      [],
    ])

    await expect(
      probe.service.createTask(command, PRINCIPAL)
    ).rejects.toThrow('Assigned user not found')
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
  })

  it('requires assignment before starting an SLA clock', async () => {
    const probe = harness([[{ ...TASK, assigned_to: null }]])
    const command: StartProcessClockCommand = {
      observeMode: true,
      timeZone: 'Asia/Manila',
    }

    await expect(
      probe.service.startClock(TASK_ID, command, PRINCIPAL)
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
  })

  it.each([
    ['pending', 'in_progress'],
    ['pending', 'blocked'],
    ['pending', 'cancelled'],
    ['in_progress', 'blocked'],
    ['in_progress', 'completed'],
    ['in_progress', 'cancelled'],
    ['blocked', 'in_progress'],
    ['blocked', 'cancelled'],
  ] as const)('allows the lifecycle transition %s -> %s', async (from, to) => {
    const task = {
      ...TASK,
      status: from,
      blocked_reason: from === 'blocked' ? 'Waiting on owner' : null,
      started_at:
        from === 'pending' ? null : new Date('2026-08-12T00:00:00.000Z'),
    }
    const updated = {
      ...task,
      status: to,
      blocked_reason: to === 'blocked' ? 'Waiting on owner' : null,
      completed_at:
        to === 'completed' ? new Date('2026-08-13T00:00:00.000Z') : task.completed_at,
    }
    const probe = harness([[task]])
    probe.updateReturning.mockResolvedValue([updated])
    const command: UpdateTaskStatusCommand = {
      status: to,
      ...(to === 'blocked' ? { blockedReason: 'Waiting on owner' } : {}),
    }

    const result = await probe.service.updateTaskStatus(TASK_ID, command, PRINCIPAL)

    expect(result.status).toBe(to)
    expect(probe.audit.stampActor).toHaveBeenCalledWith(
      probe.transactionClient,
      PRINCIPAL
    )
    expect(probe.transactionClient.update).toHaveBeenCalled()
    if (to === 'completed' || to === 'cancelled') {
      expect(probe.transactionClient.update).toHaveBeenCalledTimes(2)
    } else {
      expect(probe.transactionClient.update).toHaveBeenCalledOnce()
    }
  })

  it('rejects illegal and terminal task transitions without mutation', async () => {
    const illegalProbe = harness([[{ ...TASK, status: 'pending' as const }]])
    await expect(
      illegalProbe.service.updateTaskStatus(
        TASK_ID,
        { status: 'completed' },
        PRINCIPAL
      )
    ).rejects.toThrow('Cannot transition task from pending to completed')
    expect(illegalProbe.transactionClient.update).not.toHaveBeenCalled()

    const terminalProbe = harness([[{ ...TASK, status: 'completed' as const }]])
    await expect(
      terminalProbe.service.updateTaskStatus(
        TASK_ID,
        { status: 'cancelled' },
        PRINCIPAL
      )
    ).rejects.toThrow('Cannot transition task from completed to cancelled')
    expect(terminalProbe.transactionClient.update).not.toHaveBeenCalled()
  })

  it('requires a reason to block and keeps the tenant boundary on lookup', async () => {
    const blockedProbe = harness([[TASK]])
    const missingReason = {
      status: 'blocked',
    } as UpdateTaskStatusCommand
    await expect(
      blockedProbe.service.updateTaskStatus(TASK_ID, missingReason, PRINCIPAL)
    ).rejects.toThrow()
    expect(blockedProbe.transactionClient.update).not.toHaveBeenCalled()

    const crossTenantProbe = harness([[]])
    await expect(
      crossTenantProbe.service.updateTaskStatus(
        TASK_ID,
        { status: 'in_progress' },
        PRINCIPAL
      )
    ).rejects.toThrow('Task not found')
    expect(crossTenantProbe.transactionClient.update).not.toHaveBeenCalled()
  })

  it('clocks assigned steps and preserves internal escalation schedule', async () => {
    const startedTask = {
      ...TASK,
      status: 'in_progress' as const,
      started_at: new Date('2026-08-12T00:00:00.000Z'),
    }
    const insertedClock = {
      ...CLOCK,
      clock_type: 'business_days' as const,
      target_value: 2,
      observe_mode: true,
      at_risk_at: new Date('2026-08-13T00:00:00.000Z'),
      due_at: new Date('2026-08-14T00:00:00.000Z'),
      escalation_at: new Date('2026-08-17T00:00:00.000Z'),
    }
    const probe = harness([
      [{ ...TASK }],
      [],
      [STEP],
    ])
    probe.updateReturning.mockResolvedValue([startedTask])
    probe.insertReturning.mockResolvedValue([insertedClock])

    const result = await probe.service.startClock(
      TASK_ID,
      {
        startedAt: '2026-08-12T00:00:00.000Z',
        observeMode: true,
        timeZone: 'Asia/Manila',
      },
      PRINCIPAL
    )

    expect(result.clockType).toBe('business_days')
    expect(result.clockScope).toBe('internal')
    expect(result.observeMode).toBe(true)
    expect(result.escalationAt).not.toBeNull()
    expect(probe.transactionClient.update).toHaveBeenCalledOnce()
    expect(probe.transactionClient.insert).toHaveBeenCalledOnce()
  })

  it('uses tenant holiday rows when persisted business calendars are enabled', async () => {
    process.env.BUSINESS_CALENDAR_DB_ENABLED = '1'
    const startedTask = {
      ...TASK,
      status: 'in_progress' as const,
      started_at: new Date('2026-08-12T00:00:00.000Z'),
    }
    const insertedClock = {
      ...CLOCK,
      clock_type: 'business_days' as const,
      target_value: 2,
      observe_mode: true,
      at_risk_at: new Date('2026-08-14T00:00:00.000Z'),
      due_at: new Date('2026-08-17T00:00:00.000Z'),
      escalation_at: new Date('2026-08-19T00:00:00.000Z'),
    }
    const probe = harness([
      [{ ...TASK }],
      [],
      [STEP],
      [
        {
          date: '2026-08-13',
          name: 'Tenant closure',
          kind: 'local',
          source: 'tenant policy',
          is_enabled: true,
        },
      ],
    ])
    probe.updateReturning.mockResolvedValue([startedTask])
    probe.insertReturning.mockResolvedValue([insertedClock])

    await probe.service.startClock(
      TASK_ID,
      {
        startedAt: '2026-08-12T00:00:00.000Z',
        observeMode: true,
        timeZone: 'Asia/Manila',
      },
      PRINCIPAL
    )

    expect(probe.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        due_at: new Date('2026-08-17T00:00:00.000Z'),
      })
    )
  })

  it('marks breached then escalated only after observe mode is disabled', async () => {
    const probe = harness([[CLOCK]])
    const updated = {
      ...CLOCK,
      status: 'escalated' as const,
      breached_at: new Date('2026-08-13T13:00:00.000Z'),
      escalated_at: new Date('2026-08-13T13:00:00.000Z'),
      updated_at: new Date('2026-08-13T13:00:01.000Z'),
    }
    probe.updateReturning.mockResolvedValue([updated])

    const result = await probe.service.evaluateClock(
      CLOCK_ID,
      { now: '2026-08-13T13:00:00.000Z' },
      PRINCIPAL
    )

    expect(probe.audit.stampActor).toHaveBeenCalledWith(
      probe.transactionClient,
      PRINCIPAL
    )
    expect(probe.updateReturning).toHaveBeenCalledOnce()
    expect(result.status).toBe('escalated')
    expect(result.isBreached).toBe(true)
    expect(result.shouldEscalate).toBe(true)
  })

  it('keeps approval money exact as bigint centavo strings at API boundary', async () => {
    const probe = harness([])
    probe.insertReturning.mockResolvedValue([RULE])
    const command: CreateApprovalRuleCommand = {
      objectType: 'purchase_order',
      amountBandLow: '50000000',
      amountBandHigh: null,
      approverRole: 'finance',
      sequence: 1,
      escalationAfterDays: 2,
    }

    const result = await probe.service.createApprovalRule(
      command,
      PRINCIPAL
    )

    expect(result.amountBandLow).toBe('50000000')
    expect(probe.transactionClient.insert).toHaveBeenCalledOnce()
    expect(probe.transactionClient.insert).toHaveBeenCalledWith(
      expect.anything()
    )
  })

  it('enforces approval sequence and records a non-self decision', async () => {
    const createProbe = harness([[RULE], [], []])
    createProbe.insertReturning.mockResolvedValue([APPROVAL])
    const createCommand: CreateApprovalCommand = {
      objectType: 'purchase_order',
      objectId: APPROVAL.object_id,
      approvalRuleId: RULE_ID,
      sequence: 1,
    }

    const created = await createProbe.service.createApproval(
      createCommand,
      PRINCIPAL
    )
    expect(created.status).toBe('pending')

    const decided = {
      ...APPROVAL,
      status: 'approved' as const,
      approver_user_id: PRINCIPAL.userId,
      decided_at: new Date('2026-08-12T01:00:00.000Z'),
      updated_by: PRINCIPAL.userId,
      updated_at: new Date('2026-08-12T01:00:00.000Z'),
    }
    const decideProbe = harness([
      [APPROVAL],
      [{ approverRole: 'finance', isActive: true }],
    ])
    decideProbe.updateReturning.mockResolvedValue([decided])
    const decideCommand: DecideApprovalCommand = {
      status: 'approved',
    }

    const result = await decideProbe.service.decideApproval(
      APPROVAL_ID,
      decideCommand,
      PRINCIPAL
    )
    expect(result.status).toBe('approved')
    expect(decideProbe.transactionClient.update).toHaveBeenCalledOnce()
  })

  it('does not count a wrong-rule approval for a lower active sequence', async () => {
    const higherRule = { ...RULE, sequence: 10 }
    const priorRules = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sequence: 2 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sequence: 7 },
    ]
    const probe = harness([
      [higherRule],
      [],
      priorRules,
      [
        { approvalRuleId: priorRules[0]!.id },
        { approvalRuleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
      ],
    ])

    await expect(
      probe.service.createApproval(
        {
          objectType: 'purchase_order',
          objectId: APPROVAL.object_id,
          approvalRuleId: RULE_ID,
          sequence: 10,
        },
        PRINCIPAL
      )
    ).rejects.toThrow('Prior approval sequences must be approved first')
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
  })

  it('allows a higher sequence after every configured lower rule is approved, including non-contiguous sequences', async () => {
    const higherRule = { ...RULE, sequence: 10 }
    const priorRules = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sequence: 2 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sequence: 7 },
    ]
    const probe = harness([
      [higherRule],
      [],
      priorRules,
      [
        { approvalRuleId: priorRules[0]!.id },
        { approvalRuleId: priorRules[1]!.id },
      ],
    ])
    probe.insertReturning.mockResolvedValue([{ ...APPROVAL, sequence: 10 }])

    const result = await probe.service.createApproval(
      {
        objectType: 'purchase_order',
        objectId: APPROVAL.object_id,
        approvalRuleId: RULE_ID,
        sequence: 10,
      },
      PRINCIPAL
    )

    expect(result.status).toBe('pending')
    expect(probe.transactionClient.insert).toHaveBeenCalledOnce()
  })

  it('deduplicates lower rules sharing a sequence for amount-band variants', async () => {
    const higherRule = { ...RULE, sequence: 10 }
    const priorRules = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sequence: 2 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sequence: 2 },
    ]
    const probe = harness([
      [higherRule],
      [],
      priorRules,
      [{ approvalRuleId: priorRules[0]!.id }],
    ])
    probe.insertReturning.mockResolvedValue([{ ...APPROVAL, sequence: 10 }])

    const result = await probe.service.createApproval(
      {
        objectType: 'purchase_order',
        objectId: APPROVAL.object_id,
        approvalRuleId: RULE_ID,
        sequence: 10,
      },
      PRINCIPAL
    )

    expect(result.status).toBe('pending')
    expect(probe.transactionClient.insert).toHaveBeenCalledOnce()
  })

  it('rechecks that an approval rule is active before deciding an approval', async () => {
    const probe = harness([
      [APPROVAL],
      [{ approverRole: 'finance', isActive: false }],
    ])

    await expect(
      probe.service.decideApproval(
        APPROVAL_ID,
        { status: 'approved' },
        PRINCIPAL
      )
    ).rejects.toThrow('Approval rule is inactive')
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
  })

  it('previews zero and large unbounded amounts without losing centavo precision', async () => {
    const zeroProbe = readHarness([
      [
        rule({
          amount_band_low: 0n,
          amount_band_high: null,
          sequence: 2,
        }),
      ],
    ])
    const zeroQuery: ApprovalRoutePreviewQuery = {
      objectType: 'purchase_order',
      amountCentavos: '0',
    }

    await expect(
      zeroProbe.service.previewApprovalRoute(zeroQuery, PRINCIPAL)
    ).resolves.toMatchObject({
      amountCentavos: '0',
      status: 'matched',
      steps: [{ sequence: 2, status: 'matched' }],
    })

    const largeAmount = '9007199254740993'
    const largeProbe = readHarness([
      [
        rule({
          amount_band_low: BigInt(largeAmount),
          amount_band_high: BigInt(largeAmount),
          sequence: 2,
        }),
      ],
    ])

    await expect(
      largeProbe.service.previewApprovalRoute(
        { ...zeroQuery, amountCentavos: largeAmount },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      amountCentavos: largeAmount,
      status: 'matched',
    })
  })

  it('returns unconfigured and no-match states distinctly', async () => {
    const unconfiguredProbe = readHarness([[]])
    await expect(
      unconfiguredProbe.service.previewApprovalRoute(
        { objectType: 'purchase_order', amountCentavos: '0' },
        PRINCIPAL
      )
    ).resolves.toMatchObject({ status: 'unconfigured', steps: [] })

    const noMatchProbe = readHarness([
      [rule({ amount_band_low: 100n, amount_band_high: 200n, sequence: 4 })],
    ])
    await expect(
      noMatchProbe.service.previewApprovalRoute(
        { objectType: 'purchase_order', amountCentavos: '0' },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      status: 'no_match',
      steps: [{ sequence: 4, status: 'missing', rules: [] }],
    })
  })

  it('marks overlapping rules at one sequence as ambiguous', async () => {
    const probe = readHarness([
      [
        rule({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          amount_band_low: 0n,
          amount_band_high: 100n,
          sequence: 3,
        }),
        rule({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          amount_band_low: 50n,
          amount_band_high: 150n,
          sequence: 3,
        }),
      ],
    ])

    await expect(
      probe.service.previewApprovalRoute(
        { objectType: 'purchase_order', amountCentavos: '100' },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      status: 'ambiguous',
      steps: [
        {
          sequence: 3,
          status: 'ambiguous',
          rules: [
            expect.objectContaining({
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            }),
            expect.objectContaining({
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            }),
          ],
        },
      ],
    })
  })

  it('reports a missing configured sequence as incomplete', async () => {
    const probe = readHarness([
      [
        rule({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          amount_band_low: 0n,
          amount_band_high: 100n,
          sequence: 2,
        }),
        rule({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          amount_band_low: 200n,
          amount_band_high: null,
          sequence: 7,
        }),
      ],
    ])

    await expect(
      probe.service.previewApprovalRoute(
        { objectType: 'purchase_order', amountCentavos: '50' },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      status: 'incomplete',
      steps: [
        { sequence: 2, status: 'matched' },
        { sequence: 7, status: 'missing', rules: [] },
      ],
    })
  })

  it('accepts non-contiguous numeric sequences and sorts rules deterministically', async () => {
    const probe = readHarness([
      [
        rule({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          amount_band_low: 0n,
          amount_band_high: null,
          sequence: 10,
        }),
        rule({
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          amount_band_low: 0n,
          amount_band_high: null,
          sequence: 2,
        }),
        rule({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          amount_band_low: 0n,
          amount_band_high: null,
          sequence: 2,
        }),
      ],
    ])

    const result = await probe.service.previewApprovalRoute(
      { objectType: 'purchase_order', amountCentavos: '1' },
      PRINCIPAL
    )

    expect(result.status).toBe('ambiguous')
    expect(result.steps.map(({ sequence }) => sequence)).toEqual([2, 10])
    expect(result.steps[0]?.rules.map(({ id }) => id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ])
  })

  it('excludes inactive, cross-tenant, and other-object rules and performs no writes', async () => {
    const otherTenant = '33333333-3333-4333-8333-333333333333'
    const probe = readHarness([
      [
        rule({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sequence: 1,
          is_active: false,
        }),
        rule({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sequence: 2,
          tenant_id: otherTenant,
        }),
        rule({
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          sequence: 3,
          object_type: 'invoice',
        }),
        rule({
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          sequence: 7,
          amount_band_low: 0n,
          amount_band_high: null,
        }),
      ],
    ])

    const result = await probe.service.previewApprovalRoute(
      { objectType: 'purchase_order', amountCentavos: '1' },
      PRINCIPAL
    )

    expect(result.steps.map(({ sequence }) => sequence)).toEqual([7])
    expect(result.steps[0]?.rules.map(({ id }) => id)).toEqual([
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    ])
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
  })

  it('lists a tenant-scoped task with its process-step and active clock projection', async () => {
    const probe = readHarness([[TASK_QUEUE_ROW], [{ total: 1 }]])

    const result = await probe.service.listTasks(
      { page: 1, limit: 25 },
      PRINCIPAL
    )

    expect(result).toMatchObject({
      tenantId: PRINCIPAL.tenantId,
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
      rows: [
        expect.objectContaining({
          id: TASK_ID,
          processStepId: STEP_ID,
          processStepCode: 'PR-L',
          processStepName: 'Lead qualification',
          responsibleBu: 'Sales',
          assignedTo: ASSIGNEE_ID,
          clock: {
            id: CLOCK_ID,
            clockType: 'calendar_hours',
            clockScope: 'internal',
            targetValue: 24,
            startedAt: '2026-08-12T00:00:00.000Z',
            dueAt: '2026-08-13T00:00:00.000Z',
            atRiskAt: '2026-08-12T19:12:00.000Z',
            breachedAt: null,
            escalatedAt: null,
            status: 'running',
            observeMode: false,
          },
        }),
      ],
    })

    expect(probe.chains).toHaveLength(2)
    for (const query of probe.chains) {
      expect(query.innerJoin).toHaveBeenCalled()
      expect(query.leftJoin).toHaveBeenCalled()
      expect(query.where).toHaveBeenCalled()
    }
    expect(probe.chains[0]?.orderBy).toHaveBeenCalled()
    expect(probe.chains[0]?.limit).toHaveBeenCalledWith(25)
    expect(probe.chains[0]?.offset).toHaveBeenCalledWith(0)
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.stampActor).not.toHaveBeenCalled()
  })

  it('applies status and responsible-BU filters and deterministic pagination', async () => {
    const filteredRow = {
      ...TASK_QUEUE_ROW,
      status: 'blocked' as const,
      responsibleBu: 'Commercial',
      clockId: null,
    }
    const query: ProcessTaskQueueQuery = {
      status: 'blocked',
      responsibleBu: 'Commercial',
      page: 2,
      limit: 10,
    }
    const probe = readHarness([[filteredRow], [{ total: 21 }]])

    const result = await probe.service.listTasks(query, PRINCIPAL)

    expect(result).toMatchObject({
      total: 21,
      page: 2,
      limit: 10,
      totalPages: 3,
      rows: [
        expect.objectContaining({
          status: 'blocked',
          responsibleBu: 'Commercial',
          clock: null,
        }),
      ],
    })
    expect(probe.chains[0]?.limit).toHaveBeenCalledWith(10)
    expect(probe.chains[0]?.offset).toHaveBeenCalledWith(10)
  })

  it('returns unassigned tasks without a clock and preserves external observe labels', async () => {
    const noClockRow = {
      ...TASK_QUEUE_ROW,
      assignedTo: null,
      clockId: null,
    }
    const externalRow = {
      ...TASK_QUEUE_ROW,
      taskId: '44444444-4444-4444-8444-444444444445',
      clockScope: 'external' as const,
      clockObserveMode: true,
      clockStatus: 'breached' as const,
      clockBreachedAt: new Date('2026-08-13T00:00:00.000Z'),
      clockEscalatedAt: null,
    }
    const probe = readHarness([[noClockRow, externalRow], [{ total: 2 }]])

    const result = await probe.service.listTasks(
      { page: 1, limit: 25 },
      PRINCIPAL
    )

    expect(result.rows[0]).toMatchObject({ assignedTo: null, clock: null })
    expect(result.rows[1]?.clock).toMatchObject({
      clockScope: 'external',
      observeMode: true,
      status: 'breached',
      breachedAt: '2026-08-13T00:00:00.000Z',
      escalatedAt: null,
    })
  })

  it('uses a distinct task count when a joined clock could fan out', async () => {
    const probe = readHarness([[TASK_QUEUE_ROW], [{ total: 1 }]])

    await probe.service.listTasks({ page: 1, limit: 25 }, PRINCIPAL)

    const selectCalls = (
      probe.select as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls
    const selection = selectCalls[1]?.[0] as
      | Record<string, unknown>
      | undefined
    const totalExpression = selection?.total
    expect(totalExpression).toBeDefined()
  })
})
