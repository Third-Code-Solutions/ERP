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
})
