import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  selectLimit: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertOnConflictDoNothing: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  notifyExternalEmail: vi.fn(),
  createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}))

vi.mock('./inngest', () => ({
  inngest: {
    createFunction: mocks.createFunction,
  },
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyExternalEmail: mocks.notifyExternalEmail,
}))

import { dispatchCnpsSurveys, dispatchOneSurvey, onCnpsSurveyScheduled } from './inngest-warranty'

const ticket = {
  id: 'ticket-id',
  tenant_id: 'tenant-id',
  account_id: 'account-id',
  ticket_number: 'WT-000001',
  status: 'closed' as const,
  closed_at: new Date('2026-08-10T00:00:00.000Z'),
  submitted_by_email: 'client@example.test',
}

describe('CNPS survey delivery evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere })
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit })
    mocks.insert.mockReturnValue({ values: mocks.insertValues })
    mocks.insertValues.mockReturnValue({ onConflictDoNothing: mocks.insertOnConflictDoNothing })
    mocks.insertOnConflictDoNothing.mockReturnValue({ returning: mocks.insertReturning })
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
    mocks.updateReturning.mockResolvedValue([{ id: 'survey-id' }])
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: true })
  })

  it('hands a delivered survey to its own stamp step instead of stamping it', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([])
    mocks.insertReturning.mockResolvedValue([{ id: 'survey-id' }])

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: true,
      surveyId: 'survey-id',
      sentAt: expect.any(String),
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  it('inserts on conflict with the ticket survey and sends nothing when another sender won', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([])
    mocks.insertReturning.mockResolvedValue([])

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: false,
      reason: 'already-claimed',
    })

    const [{ target }] = mocks.insertOnConflictDoNothing.mock.calls[0] as [{ target: Array<{ name: string }> }]
    expect(target.map((column) => column.name)).toEqual(['tenant_id', 'ticket_id'])
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  it('claims a pending survey by compare-and-swap and sends nothing when another sender holds it', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([{ id: 'survey-id', sent_at: null, response_token_hash: 'old-hash' }])
    mocks.updateReturning.mockResolvedValue([])

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: false,
      reason: 'already-claimed',
    })

    const claim = new PgDialect().sqlToQuery(mocks.updateWhere.mock.calls[0]![0] as SQL)
    expect(claim.sql).toContain('"cnps_surveys"."id" = $')
    expect(claim.sql).toContain('"cnps_surveys"."tenant_id" = $')
    expect(claim.sql).toContain('"cnps_surveys"."sent_at" is null')
    expect(claim.sql).toContain('"cnps_surveys"."response_token_hash" is not distinct from $')
    expect(claim.sql).toContain(`"cnps_surveys"."created_at" < now() - interval '15 minutes'`)
    expect(claim.params).toEqual(['survey-id', 'tenant-id', 'old-hash'])
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
    expect(mocks.updateSet).toHaveBeenCalledTimes(1)
  })

  it('leaves a failed provider delivery retryable', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([])
    mocks.insertReturning.mockResolvedValue([{ id: 'survey-id' }])
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: false })

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: false,
      reason: 'email-not-delivered',
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  it('reuses an existing pending survey and stamps it only after delivery', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([{ id: 'survey-id', sent_at: null, response_token_hash: 'old-hash' }])

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: true,
      surveyId: 'survey-id',
      sentAt: expect.any(String),
    })

    expect(mocks.updateSet).toHaveBeenCalledTimes(1)
    const [claim] = mocks.updateSet.mock.calls[0] as [{ response_token_hash: unknown; created_at: SQL }]
    expect(claim.response_token_hash).toEqual(expect.any(String))
    // The claim renews the lease: a run that reads the row after it sees a
    // fresh created_at, fails the 15-minute test and sends nothing.
    expect(new PgDialect().sqlToQuery(claim.created_at).sql).toBe('now()')
  })
})

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  sleep: () => Promise<void>
}
type Handler = (context: { step: Step; event?: unknown }) => Promise<unknown>

/** Like Inngest: a finished step replays its JSON result instead of running again. */
function memoizingStep() {
  const finished = new Map<string, unknown>()
  const ran: string[] = []
  const step: Step = {
    run: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      if (finished.has(name)) return finished.get(name) as T
      ran.push(name)
      const value = await fn()
      finished.set(name, JSON.parse(JSON.stringify(value ?? null)))
      return value
    },
    sleep: () => Promise.resolve(),
  }
  return { ran, step }
}

const handlerOf = (fn: unknown) => (fn as { handler: Handler }).handler
const scheduledEvent = { data: { ticketId: 'ticket-id', tenantId: 'tenant-id' } }

describe('CNPS survey Inngest steps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere })
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit })
    mocks.selectLimit.mockResolvedValueOnce([ticket]).mockResolvedValueOnce([])
    mocks.insert.mockReturnValue({ values: mocks.insertValues })
    mocks.insertValues.mockReturnValue({ onConflictDoNothing: mocks.insertOnConflictDoNothing })
    mocks.insertOnConflictDoNothing.mockReturnValue({ returning: mocks.insertReturning })
    mocks.insertReturning.mockResolvedValue([{ id: 'survey-id' }])
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: true })
  })

  it('stamps sent_at in a step of its own after the send step', async () => {
    const { ran, step } = memoizingStep()

    await handlerOf(onCnpsSurveyScheduled)({ step, event: scheduledEvent })

    expect(ran).toEqual(['send', 'send-mark-sent'])
    expect(mocks.updateSet).toHaveBeenCalledWith({ sent_at: expect.any(Date) })
    const stamp = new PgDialect().sqlToQuery(mocks.updateWhere.mock.calls[0]![0] as SQL)
    expect(stamp.sql).toContain('"cnps_surveys"."id" = $')
    expect(stamp.sql).toContain('"cnps_surveys"."tenant_id" = $')
    expect(stamp.params).toEqual(['survey-id', 'tenant-id'])
  })

  it('retries a failed stamp without emailing the client again', async () => {
    const { ran, step } = memoizingStep()
    mocks.updateWhere.mockRejectedValueOnce(new Error('connection reset'))

    // Inngest runs the handler again after the failed step; the send replays.
    await expect(handlerOf(onCnpsSurveyScheduled)({ step, event: scheduledEvent })).rejects.toThrow('connection reset')
    await handlerOf(onCnpsSurveyScheduled)({ step, event: scheduledEvent })

    expect(ran).toEqual(['send', 'send-mark-sent', 'send-mark-sent'])
    expect(mocks.notifyExternalEmail).toHaveBeenCalledTimes(1)
    expect(mocks.updateWhere).toHaveBeenCalledTimes(2)
  })

  it('has no stamp step when the email did not go out', async () => {
    const { ran, step } = memoizingStep()
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: false })

    await handlerOf(onCnpsSurveyScheduled)({ step, event: scheduledEvent })

    expect(ran).toEqual(['send'])
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  it('the hourly sweep sends and stamps each due ticket in separate steps', async () => {
    const { ran, step } = memoizingStep()
    // find-due-tickets: one closed ticket with no sent survey.
    mocks.selectFrom.mockReturnValueOnce({
      leftJoin: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: 'ticket-id', tenant_id: 'tenant-id', existing_sent_at: null }]) }),
      }),
    })

    await expect(handlerOf(dispatchCnpsSurveys)({ step })).resolves.toEqual({ swept: 1, sent: 1 })

    expect(ran).toEqual(['find-due-tickets', 'send-ticket-id', 'send-ticket-id-mark-sent'])
    expect(mocks.notifyExternalEmail).toHaveBeenCalledTimes(1)
    expect(mocks.updateSet).toHaveBeenCalledWith({ sent_at: expect.any(Date) })
  })
})
