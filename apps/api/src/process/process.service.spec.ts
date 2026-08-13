import 'reflect-metadata'

import { ConflictException } from '@nestjs/common'
import type {
  CreateApprovalCommand,
  CreateApprovalRuleCommand,
  CreateTaskInstanceCommand,
  DecideApprovalCommand,
  StartProcessClockCommand,
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
  state.where = vi.fn(() => state)
  state.limit = vi.fn(() => state)
  state.for = vi.fn(() => Promise.resolve(result))
  state.orderBy = vi.fn(() => Promise.resolve(result))
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
    const createProbe = harness([[RULE], []])
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
    const decideProbe = harness([[APPROVAL], [{ approverRole: 'finance' }]])
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
})
