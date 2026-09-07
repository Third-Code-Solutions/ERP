import { afterEach, describe, expect, it, vi } from 'vitest'

type Handler = (input: {
  step: { run: <T>(name: string, work: () => Promise<T>) => Promise<T> }
  event: { data: { tenantId: string; date?: string } }
}) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  generate: vi.fn().mockResolvedValue({ created: 2, skipped: 0, projectsConsidered: 1 }),
}))
vi.mock('./inngest', () => ({
  inngest: { createFunction: (config: { id: string }, handler: Handler) => {
    mocks.handlers.set(config.id, handler)
    return { config }
  } },
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: () => ({ from: async () => [{ id: 'tenant-one' }] }) },
}))
vi.mock('./operations/cadence-engine', async (importOriginal) => ({
  ...await importOriginal<typeof import('./operations/cadence-engine')>(),
  generateTasksForDate: mocks.generate,
}))
import './inngest-cadence'

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('Daily cadence generation date', () => {
  const step = { run: async <T>(_name: string, work: () => Promise<T>) => work() }

  it.each(['generate-daily-cadence-tasks', 'generate-cadence-on-demand'])(
    '%s creates the current Manila day at the scheduled 07:00 run', async (id) => {
      vi.useFakeTimers().setSystemTime(new Date('2026-09-06T23:00:00Z'))
      await mocks.handlers.get(id)!({ step, event: { data: { tenantId: 'tenant-one' } } })
      expect(mocks.generate).toHaveBeenCalledWith('tenant-one', new Date('2026-09-07T00:00:00Z'))
    }
  )

  it('preserves an explicitly requested calendar date', async () => {
    await mocks.handlers.get('generate-cadence-on-demand')!({
      step, event: { data: { tenantId: 'tenant-one', date: '2026-09-09' } },
    })
    expect(mocks.generate).toHaveBeenCalledWith('tenant-one', new Date('2026-09-09T00:00:00Z'))
  })
})
