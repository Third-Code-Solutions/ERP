import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
    insert: vi.fn(),
  },
  stampActorInTransaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  writeAuditLog: vi.fn(),
  stopSlaClock: vi.fn(),
  startSlaClock: vi.fn(),
  notifyExternalEmail: vi.fn(),
  send: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))
vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))
vi.mock('@third-code-erp/database/schema', () => ({
  warrantyTickets: {},
  ticketMessages: {},
  warrantyPortalTokens: {},
  projects: {},
  documents: {},
}))
vi.mock('@/lib/audit', () => ({
  stampActorInTransaction: mocks.stampActorInTransaction,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
  writeAuditLog: mocks.writeAuditLog,
  computeDiff: (before: Record<string, unknown>, after: Record<string, unknown>) => ({ before, after }),
}))
vi.mock('@/lib/operations/sla-clock', () => ({
  stopSlaClock: mocks.stopSlaClock,
  startSlaClock: mocks.startSlaClock,
}))
vi.mock('@/lib/operations/notifications', () => ({ notifyExternalEmail: mocks.notifyExternalEmail }))
vi.mock('@/lib/inngest', () => ({ inngest: { send: mocks.send } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  acknowledgeTicket,
  closeTicket,
  markTicketInProgress,
  postTicketMessage,
  scheduleTicketRepair,
} from './actions'

const TICKET_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'cx',
  email: 'cx@example.test',
  fullName: 'CX',
} as const

type Ticket = {
  id: string
  tenant_id: string
  project_id: string
  ticket_number: string
  status: 'open' | 'acknowledged' | 'scheduled' | 'in_progress' | 'closed' | 'cancelled'
  submitted_by_email: string | null
  submitted_by_name: string | null
  scheduled_at: Date | null
  acknowledged_at: Date | null
  closed_at: Date | null
  service_report_document_id: string | null
}

function ticket(status: Ticket['status']): Ticket {
  return {
    id: TICKET_ID,
    tenant_id: PROFILE.tenantId,
    project_id: PROJECT_ID,
    ticket_number: 'WT-0001',
    status,
    submitted_by_email: null,
    submitted_by_name: null,
    scheduled_at: null,
    acknowledged_at: null,
    closed_at: null,
    service_report_document_id: null,
  }
}

function query<T>(rows: T[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder)
  builder.where = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.for = vi.fn().mockResolvedValue(rows)
  builder.then = (onFulfilled?: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(rows).then(onFulfilled, onRejected)
  return builder
}

function transactionFor(ticketRow: Ticket, options: { document?: boolean } = {}) {
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: TICKET_ID }]),
  })
  const select = vi.fn()
  select.mockReturnValueOnce(query([ticketRow]))
  if (options.document) select.mockReturnValueOnce(query([{ id: DOCUMENT_ID }]))
  const tx = { select, update }
  mocks.db.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  return { tx, update }
}

describe('warranty ticket lifecycle actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.notifyExternalEmail.mockResolvedValue(undefined)
    mocks.send.mockResolvedValue(undefined)
  })

  it('rejects scheduling terminal tickets at the server boundary', async () => {
    transactionFor(ticket('closed'))
    await expect(scheduleTicketRepair(TICKET_ID, '2026-09-12T09:00:00.000Z')).resolves.toEqual({ error: 'Only acknowledged, scheduled, or in-progress tickets can be scheduled' })
    expect(mocks.stopSlaClock).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('rejects restarting already in-progress or terminal tickets', async () => {
    transactionFor(ticket('in_progress'))
    await expect(markTicketInProgress(TICKET_ID)).resolves.toEqual({ error: 'Only acknowledged or scheduled tickets can be marked in-progress' })
    transactionFor(ticket('cancelled'))
    await expect(markTicketInProgress(TICKET_ID)).resolves.toEqual({ error: 'Only acknowledged or scheduled tickets can be marked in-progress' })
  })

  it('closes atomically with service-report validation, SLA stop, and audit', async () => {
    const { update } = transactionFor(ticket('in_progress'), { document: true })
    await expect(closeTicket(TICKET_ID, DOCUMENT_ID)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledOnce()
    expect(mocks.stopSlaClock).toHaveBeenCalledWith(expect.objectContaining({ entityId: TICKET_ID, client: expect.anything() }))
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledOnce()
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('keeps repeated close idempotency fail-closed', async () => {
    transactionFor(ticket('closed'))
    await expect(closeTicket(TICKET_ID, DOCUMENT_ID)).resolves.toEqual({ error: 'Only non-terminal tickets can be closed' })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('acknowledges only open tickets and changes SLA clocks in one transaction', async () => {
    const { update } = transactionFor(ticket('open'))
    await expect(acknowledgeTicket(TICKET_ID)).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledOnce()
    expect(mocks.stopSlaClock).toHaveBeenCalledWith(expect.objectContaining({ label: 'ticket.acknowledge', client: expect.anything() }))
    expect(mocks.startSlaClock).toHaveBeenCalledWith(expect.objectContaining({ label: 'ticket.schedule', client: expect.anything() }))
  })
})

describe('warranty client emails', () => {
  const clientTicket = { ...ticket('open'), submitted_by_email: 'client@example.test' }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.notifyExternalEmail.mockResolvedValue(undefined)
  })

  it('acknowledges with its own template: no schedule placeholder and no staff-only link', async () => {
    transactionFor(clientTicket)
    await acknowledgeTicket(TICKET_ID)

    const call = mocks.notifyExternalEmail.mock.calls[0]?.[0]
    expect(call.templateId).toBe('ticket-acknowledged')
    expect(call.templateVars).toEqual({ ticket_number: 'WT-0001' })
    expect(JSON.stringify(call)).not.toContain('TBD')
    expect(JSON.stringify(call)).not.toContain('/warranty/')
  })

  it('schedules in Manila time without a link to the staff page', async () => {
    transactionFor({ ...clientTicket, status: 'acknowledged' })
    await scheduleTicketRepair(TICKET_ID, '2026-09-12T01:00:00.000Z')

    const call = mocks.notifyExternalEmail.mock.calls[0]?.[0]
    expect(call.templateId).toBe('ticket-schedule')
    expect(call.templateVars.confirm_url).toBeUndefined()
    expect(call.templateVars.scheduled_for).toMatch(/9:00/)
  })

  it('sends a staff reply as an update, quoting the reply', async () => {
    const builder = query([clientTicket])
    mocks.db.select.mockReturnValueOnce(builder)
    mocks.db.insert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) })

    await expect(postTicketMessage(TICKET_ID, ' We will visit Tuesday. ', false)).resolves.toEqual({ ok: true })

    const call = mocks.notifyExternalEmail.mock.calls[0]?.[0]
    expect(call.templateId).toBe('ticket-update')
    expect(call.templateVars).toEqual({ ticket_number: 'WT-0001', message: 'We will visit Tuesday.' })
  })

  it('does not email internal notes', async () => {
    mocks.db.select.mockReturnValueOnce(query([clientTicket]))
    mocks.db.insert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) })

    await postTicketMessage(TICKET_ID, 'internal only', true)

    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
  })
})
