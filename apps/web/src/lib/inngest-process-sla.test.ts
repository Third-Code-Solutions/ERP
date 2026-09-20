import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn(
    (config: unknown, handler: unknown) => ({ config, handler })
  ),
}))

vi.mock('./inngest', () => ({
  inngest: { createFunction: mocks.createFunction },
}))

import {
  deriveProcessSlaTransition,
  runProcessSlaSweep,
  serializeProcessSlaSweepRow,
  type ProcessSlaSweepRow,
  type ProcessSlaSweepRowDto,
  type ProcessSlaSweepStep,
  type ProcessSlaSweepStore,
  processSlaChecker,
} from './inngest-process-sla'

const BASE = {
  clock_type: 'calendar_hours' as const,
  clock_scope: 'internal' as const,
  target_value: 24,
  started_at: new Date('2026-08-12T00:00:00.000Z'),
  at_risk_at: new Date('2026-08-12T19:12:00.000Z'),
  due_at: new Date('2026-08-13T00:00:00.000Z'),
  escalation_at: new Date('2026-08-13T12:00:00.000Z'),
  observe_mode: false,
  status: 'running' as const,
  breached_at: null,
  escalated_at: null,
}

const SWEEP_AT = new Date('2026-08-14T00:00:00.000Z')

function clock(overrides: Partial<ProcessSlaSweepRow> = {}): ProcessSlaSweepRow {
  return {
    id: 'clock-0000',
    tenant_id: 'tenant-1',
    task_instance_id: 'task-1',
    responsible_bu: 'Commercial',
    clock_type: 'calendar_hours',
    clock_scope: 'internal',
    target_value: 24,
    started_at: new Date('2026-08-12T00:00:00.000Z'),
    at_risk_at: new Date('2026-08-12T19:12:00.000Z'),
    due_at: new Date('2026-08-13T00:00:00.000Z'),
    escalation_at: null,
    status: 'running',
    observe_mode: false,
    breached_at: null,
    escalated_at: null,
    updated_at: new Date('2026-08-12T00:00:00.000Z'),
    ...overrides,
  }
}

function createSweepHarness(
  sourceRows: ProcessSlaSweepRow[],
  casFailures: ReadonlySet<string> = new Set(),
): {
  store: ProcessSlaSweepStore
  loadedIds: string[][]
  cursors: Array<{ due_at: Date; id: string } | null>
  sweepTimes: Date[]
  compareAndSetCalls: string[]
} {
  const rows = [...sourceRows].sort(
    (left, right) => left.due_at.getTime() - right.due_at.getTime() || left.id.localeCompare(right.id),
  )
  const loadedIds: string[][] = []
  const cursors: Array<{ due_at: Date; id: string } | null> = []
  const sweepTimes: Date[] = []
  const compareAndSetCalls: string[] = []

  const store: ProcessSlaSweepStore = {
    loadOpenClocks: async ({ cursor, sweepAt }) => {
      cursors.push(cursor)
      sweepTimes.push(sweepAt)
      const page = rows
        .filter(
          (row) =>
            !['paused', 'completed', 'cancelled', 'escalated'].includes(row.status) &&
            row.due_at <= sweepAt &&
            (cursor === null ||
              row.due_at > cursor.due_at ||
              (row.due_at.getTime() === cursor.due_at.getTime() && row.id > cursor.id)),
        )
        .slice(0, 1_000)
      loadedIds.push(page.map((row) => row.id))
      return page.map(serializeProcessSlaSweepRow)
    },
    compareAndSetClock: async ({ row }) => {
      compareAndSetCalls.push(row.id)
      return !casFailures.has(row.id)
    },
  }

  return {
    store,
    loadedIds,
    cursors,
    sweepTimes,
    compareAndSetCalls,
  }
}

function createImmediateStep(calls: string[]): ProcessSlaSweepStep {
  return {
    run: async <T>(name: string, operation: () => Promise<T>) => {
      calls.push(name)
      return operation()
    },
  }
}

function createJsonRoundTripStep(calls: string[]): ProcessSlaSweepStep {
  return {
    run: async <T>(name: string, operation: () => Promise<T>) => {
      calls.push(name)
      return JSON.parse(JSON.stringify(await operation())) as T
    },
  }
}

afterEach(() => {
  delete process.env.PROCESS_SLA_ENGINE_ENABLED
  vi.clearAllMocks()
})

describe('M-06 process SLA checker', () => {
  it('registers a bounded fifteen-minute cron', () => {
    expect(
      (processSlaChecker as unknown as { config: unknown }).config
    ).toEqual({
      id: 'process-sla-checker',
      name: 'M-06 Process SLA Checker',
      triggers: [{ cron: '*/15 * * * *' }],
    })
  })

  it('escalates internal clocks only after enforcement threshold', () => {
    const result = deriveProcessSlaTransition(
      BASE,
      new Date('2026-08-13T13:00:00.000Z')
    )

    expect(result).toMatchObject({
      status: 'escalated',
      changed: true,
      evaluation: {
        is_breached: true,
        should_escalate: true,
      },
    })
    expect(result.breached_at?.toISOString()).toBe('2026-08-13T13:00:00.000Z')
    expect(result.escalated_at?.toISOString()).toBe('2026-08-13T13:00:00.000Z')
  })

  it('marks external clocks breached but never escalated', () => {
    const result = deriveProcessSlaTransition(
      {
        ...BASE,
        clock_scope: 'external',
        escalation_at: null,
      },
      new Date('2026-08-14T00:00:00.000Z')
    )

    expect(result.status).toBe('breached')
    expect(result.evaluation.should_escalate).toBe(false)
    expect(result.escalated_at).toBeNull()
  })

  it('keeps observation mode from escalating a breached internal clock', () => {
    const result = deriveProcessSlaTransition(
      { ...BASE, observe_mode: true },
      new Date('2026-08-13T13:00:00.000Z')
    )

    expect(result.status).toBe('breached')
    expect(result.evaluation.should_escalate).toBe(false)
  })

  it('stays closed until hosted migration and rollout gates enable it', async () => {
    const run = vi.fn()
    const handler = (processSlaChecker as unknown as {
      handler: (input: { step: { run: typeof run } }) => Promise<unknown>
    }).handler

    await expect(handler({ step: { run } })).resolves.toEqual({
      disabled: true,
      processed: 0,
      changed: 0,
      breached: 0,
      escalated: 0,
      externalBreached: 0,
      errors: 0,
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('traverses past more than 1000 retained breached clocks', async () => {
    const retained = Array.from({ length: 1_001 }, (_, index) =>
      clock({
        id: `retained-${String(index).padStart(4, '0')}`,
        status: 'breached',
        breached_at: new Date('2026-08-13T01:00:00.000Z'),
        due_at: new Date('2026-08-01T00:00:00.000Z'),
      }),
    )
    const pending = clock({
      id: 'pending-0000',
      due_at: new Date('2026-08-13T00:00:00.000Z'),
    })
    const harness = createSweepHarness([...retained, pending])
    const stepCalls: string[] = []

    const result = await runProcessSlaSweep(createImmediateStep(stepCalls), harness.store, SWEEP_AT)

    expect(result).toMatchObject({
      processed: 1_002,
      changed: 1,
      breached: 1,
      escalated: 0,
      errors: 0,
    })
    expect(harness.compareAndSetCalls).toEqual(['pending-0000'])
    expect(harness.loadedIds).toHaveLength(2)
    expect(stepCalls).toContain('load-open-process-sla-clocks-page-1')
    expect(harness.sweepTimes).toHaveLength(2)
    expect(
      harness.sweepTimes.every(
        (value) => value.getTime() === SWEEP_AT.getTime()
      )
    ).toBe(true)
  })

  it('uses due_at and id keyset ordering without skipping equal timestamps', async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) =>
      clock({
        id: `equal-${String(index).padStart(4, '0')}`,
        due_at: new Date('2026-08-13T00:00:00.000Z'),
      }),
    )
    const harness = createSweepHarness(rows)

    const result = await runProcessSlaSweep(createImmediateStep([]), harness.store, SWEEP_AT)

    const loaded = harness.loadedIds.flat()
    expect(result.processed).toBe(rows.length)
    expect(result.changed).toBe(rows.length)
    expect(harness.compareAndSetCalls).toEqual(loaded)
    expect(new Set(loaded).size).toBe(rows.length)
    expect(loaded).toEqual(rows.map((row) => row.id))
    expect(harness.cursors).toEqual([
      null,
      {
        due_at: new Date('2026-08-13T00:00:00.000Z'),
        id: 'equal-0999',
      },
    ])
  })

  it('does not count a concurrent CAS loss as a persisted transition', async () => {
    const row = clock({ id: 'cas-lost-0000' })
    const harness = createSweepHarness([row], new Set([row.id]))

    const result = await runProcessSlaSweep(createImmediateStep([]), harness.store, SWEEP_AT)

    expect(harness.compareAndSetCalls).toEqual([row.id])
    expect(result).toMatchObject({
      processed: 1,
      changed: 0,
      breached: 0,
      escalated: 0,
      externalBreached: 0,
      errors: 0,
    })
  })

  it('avoids redundant writes and preserves external and observe safeguards', async () => {
    const retained = clock({
      id: 'retained-0000',
      status: 'breached',
      breached_at: new Date('2026-08-13T01:00:00.000Z'),
    })
    const external = clock({
      id: 'external-0000',
      clock_scope: 'external',
      escalation_at: null,
    })
    const observed = clock({
      id: 'observed-0000',
      observe_mode: true,
      escalation_at: new Date('2026-08-13T12:00:00.000Z'),
    })
    const harness = createSweepHarness([retained, external, observed])

    const result = await runProcessSlaSweep(createImmediateStep([]), harness.store, SWEEP_AT)

    expect(harness.compareAndSetCalls).toEqual(['external-0000', 'observed-0000'])
    expect(result).toMatchObject({
      processed: 3,
      changed: 2,
      breached: 2,
      escalated: 0,
      externalBreached: 1,
      errors: 0,
    })
  })

  it('revives JSON-round-tripped rows before evaluating an overdue clock', async () => {
    const row = clock({ id: 'serialized-0000' })
    const harness = createSweepHarness([row])
    const stepCalls: string[] = []

    const result = await runProcessSlaSweep(
      createJsonRoundTripStep(stepCalls),
      harness.store,
      SWEEP_AT
    )

    expect(result).toMatchObject({
      processed: 1,
      changed: 1,
      breached: 1,
      escalated: 0,
      errors: 0,
    })
    expect(harness.compareAndSetCalls).toEqual([row.id])
    expect(stepCalls).toContain('load-open-process-sla-clocks')
  })

  it('fails closed when a serialized row contains an invalid timestamp', async () => {
    const valid = serializeProcessSlaSweepRow(clock({ id: 'invalid-0000' }))
    const invalid: ProcessSlaSweepRowDto = {
      ...valid,
      due_at: 'not-a-timestamp',
    }
    const store: ProcessSlaSweepStore = {
      loadOpenClocks: async () => [invalid],
      compareAndSetClock: async () => true,
    }

    await expect(
      runProcessSlaSweep(
        createJsonRoundTripStep([]),
        store,
        SWEEP_AT
      )
    ).rejects.toThrow('due_at must be a valid timestamp')
  })
})
