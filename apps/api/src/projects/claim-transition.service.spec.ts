import 'reflect-metadata'

import { ConflictException, NotFoundException } from '@nestjs/common'
import { claimInvoiceAmountMismatch } from '@third-code-erp/shared-types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ClaimTransitionService } from './claim-transition.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const INVOICE_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'

const FINANCE: ErpPrincipal = { userId: USER_ID, tenantId: TENANT_ID, role: 'finance', email: 'finance@example.test' }

type ClaimStatus = 'handed_over_finance' | 'invoiced' | 'certified' | 'draft'

interface Script {
  /** What the guard reads after the claim row: the invoice row, then (for link) the competing claim. */
  claimStatus: ClaimStatus
  claimInvoiceId?: string | null
  claimAmountCents?: number
  guardRows: unknown[][]
  role?: string
}

function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'for']) builder[method] = vi.fn().mockReturnValue(builder)
  builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return builder
}

function build(script: Script) {
  const queue: unknown[][] = [
    [{ role: script.role ?? 'finance', status: 'active', email: 'finance@example.test' }],
    [{ status: 'active' }],
    [{ id: CLAIM_ID, projectId: PROJECT_ID, status: script.claimStatus, invoiceId: script.claimInvoiceId ?? null, amountCents: script.claimAmountCents ?? 125_000_00 }],
    [{ id: PROJECT_ID }],
    [],
    ...script.guardRows,
  ]
  const reads: Array<ReturnType<typeof chain>> = []
  const select = vi.fn(() => {
    const read = chain(queue.shift() ?? [])
    reads.push(read)
    return read
  })
  const returning = vi.fn().mockResolvedValue([{ id: CLAIM_ID }])
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) })
  const update = vi.fn().mockReturnValue({ set })
  const execute = vi.fn().mockResolvedValue([{ now: '2026-11-18T01:00:00.000Z' }])
  const transaction = { select, update, execute }
  const audit = {
    stampActor: vi.fn(),
    tryLockTenantChain: vi.fn().mockResolvedValue(true),
    writeSemantic: vi.fn(),
  }
  const service = new ClaimTransitionService(
    { client: { transaction: async (callback: (tx: unknown) => unknown) => callback(transaction) } } as unknown as DatabaseService,
    audit as unknown as AuditService,
  )
  return { service, update, set, audit, reads }
}

/** Queue position of the first guard read (after actor, tenant, claim, project and receipt). */
const GUARD_READ = 5

/** The WHERE of one recorded read, rendered as SQL text with its parameters. */
function renderedWhere(read: ReturnType<typeof chain> | undefined): { sql: string; params: unknown[] } {
  const where = read?.where as ReturnType<typeof vi.fn> | undefined
  const condition = where?.mock.calls[0]?.[0] as SQL | undefined
  if (!condition) throw new Error('read had no where clause')
  return new PgDialect().sqlToQuery(condition)
}

const LINK = { action: 'link_invoice' as const, clientRequestId: REQUEST_ID, invoiceId: INVOICE_ID }
const PAY = { action: 'record_payment' as const, clientRequestId: REQUEST_ID }
const REJECT = { action: 'reject' as const, clientRequestId: REQUEST_ID, reason: 'Wrong scope' }

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  number: 'INV-202611-001',
  status: 'issued',
  reversedAt: null,
  subtotalCents: 125_000_00,
  ...overrides,
})

describe('ClaimTransitionService invoice guards', () => {
  it.each(['issued', 'partial_payment', 'paid', 'overdue'])('links a %s invoice no other claim holds', async (status) => {
    const { service, set, audit } = build({
      claimStatus: 'handed_over_finance',
      guardRows: [[invoice({ status })], []],
    })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).resolves.toMatchObject({
      changed: true,
      receipt: { action: 'link_invoice', fromStatus: 'handed_over_finance', toStatus: 'invoiced' },
    })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'invoiced', invoice_id: INVOICE_ID }))
    expect(audit.writeSemantic).toHaveBeenCalledOnce()
  })

  it('refuses a draft invoice and tells Finance to issue it first', async () => {
    const { service, update } = build({ claimStatus: 'handed_over_finance', guardRows: [[invoice({ status: 'draft' })]] })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toThrow(
      'Invoice INV-202611-001 is still a draft; issue it before linking it to a claim',
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a cancelled invoice', async () => {
    const { service, update } = build({ claimStatus: 'handed_over_finance', guardRows: [[invoice({ status: 'cancelled' })]] })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toBeInstanceOf(ConflictException)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a reversed invoice with the reversal message', async () => {
    const { service, update } = build({
      claimStatus: 'handed_over_finance',
      guardRows: [[invoice({ status: 'cancelled', reversedAt: new Date('2026-11-17T00:00:00.000Z') })]],
    })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toThrow(
      'Invoice INV-202611-001 was reversed and cannot be linked to a claim',
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses an invoice another live claim already holds, naming that claim', async () => {
    const { service, update } = build({
      claimStatus: 'handed_over_finance',
      guardRows: [[invoice()], [{ claimNumber: 'PC-00007' }]],
    })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toThrow(
      'Invoice INV-202611-001 is already linked to claim PC-00007',
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses an invoice whose subtotal differs from the claim amount, with the web message', async () => {
    const { service, update } = build({
      claimStatus: 'handed_over_finance',
      claimAmountCents: 125_000_00,
      guardRows: [[invoice({ subtotalCents: 125_000_01 })], []],
    })

    const expected = claimInvoiceAmountMismatch(125_000_00, 125_000_01)
    expect(expected).not.toBeNull()
    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toThrow(expected ?? '')
    expect(update).not.toHaveBeenCalled()
  })

  it('reads the invoice and the competing claim only inside the actor tenant and claim project', async () => {
    const { service, reads } = build({ claimStatus: 'handed_over_finance', guardRows: [[invoice()], []] })

    await service.transition(CLAIM_ID, LINK, FINANCE)

    const invoiceRead = renderedWhere(reads[GUARD_READ])
    expect(invoiceRead.sql).toContain('"invoices"."tenant_id" = $')
    expect(invoiceRead.sql).toContain('"invoices"."project_id" = $')
    expect(invoiceRead.params).toEqual(expect.arrayContaining([INVOICE_ID, TENANT_ID, PROJECT_ID]))
    const competingRead = renderedWhere(reads[GUARD_READ + 1])
    expect(competingRead.sql).toContain('"progress_claims"."tenant_id" = $')
    expect(competingRead.sql).toContain('"progress_claims"."status" not in')
    expect(competingRead.params).toEqual(expect.arrayContaining([TENANT_ID, INVOICE_ID, CLAIM_ID, 'rejected', 'cancelled']))
  })

  it('answers not found for an invoice outside the claim project or tenant', async () => {
    const { service } = build({ claimStatus: 'handed_over_finance', guardRows: [[]] })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('maps a unique-index race on the invoice to a conflict', async () => {
    const { service, set } = build({ claimStatus: 'handed_over_finance', guardRows: [[invoice()], []] })
    set.mockImplementationOnce(() => {
      throw new Error('query failed', {
        cause: Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint_name: 'ux_progress_claims_tenant_invoice_live',
        }),
      })
    })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toThrow(
      'That invoice is already linked to another claim',
    )
  })

  it('does not report another unique violation as an invoice conflict', async () => {
    const { service, set } = build({ claimStatus: 'handed_over_finance', guardRows: [[invoice()], []] })
    set.mockImplementationOnce(() => {
      throw Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint_name: 'idx_progress_claims_tenant_number',
      })
    })

    await expect(service.transition(CLAIM_ID, LINK, FINANCE)).rejects.toThrow(
      'duplicate key value violates unique constraint',
    )
  })

  it.each(['partial_payment', 'paid'])('records payment once the linked invoice is %s', async (status) => {
    const { service, set } = build({
      claimStatus: 'invoiced',
      claimInvoiceId: INVOICE_ID,
      guardRows: [[invoice({ status })]],
    })

    await expect(service.transition(CLAIM_ID, PAY, FINANCE)).resolves.toMatchObject({
      changed: true,
      receipt: { action: 'record_payment', toStatus: 'paid' },
    })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }))
  })

  it.each(['issued', 'overdue', 'draft'])('refuses payment while the linked invoice is %s with no receipt', async (status) => {
    const { service, update } = build({
      claimStatus: 'invoiced',
      claimInvoiceId: INVOICE_ID,
      guardRows: [[invoice({ status })]],
    })

    await expect(service.transition(CLAIM_ID, PAY, FINANCE)).rejects.toThrow(
      'Invoice INV-202611-001 has no customer payment yet; record the receipt in Finance first',
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses payment when the linked invoice was reversed', async () => {
    const { service, reads } = build({
      claimStatus: 'invoiced',
      claimInvoiceId: INVOICE_ID,
      guardRows: [[invoice({ status: 'cancelled', reversedAt: new Date('2026-11-17T00:00:00.000Z') })]],
    })

    await expect(service.transition(CLAIM_ID, PAY, FINANCE)).rejects.toThrow(
      'Invoice INV-202611-001 was reversed; a reversed invoice cannot carry a claim payment',
    )
    const invoiceRead = renderedWhere(reads[GUARD_READ])
    expect(invoiceRead.sql).toContain('"invoices"."tenant_id" = $')
    expect(invoiceRead.params).toEqual(expect.arrayContaining([INVOICE_ID, TENANT_ID]))
  })

  it('refuses payment for an invoiced claim that holds no invoice', async () => {
    const { service } = build({ claimStatus: 'invoiced', claimInvoiceId: null, guardRows: [] })

    await expect(service.transition(CLAIM_ID, PAY, FINANCE)).rejects.toThrow('This claim has no linked invoice')
  })
})

describe('ClaimTransitionService rejection', () => {
  it('refuses to reject an invoiced claim while its invoice is live', async () => {
    const { service, update } = build({ claimStatus: 'invoiced', claimInvoiceId: INVOICE_ID, guardRows: [[{ reversedAt: null }]] })

    await expect(service.transition(CLAIM_ID, REJECT, FINANCE)).rejects.toThrow(
      'An invoiced claim cannot be rejected. Void its invoice first with Reverse invoice in Finance.',
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an invoiced claim once its invoice is reversed, freeing the invoice link', async () => {
    const { service, set, reads } = build({
      claimStatus: 'invoiced',
      claimInvoiceId: INVOICE_ID,
      guardRows: [[{ reversedAt: new Date('2026-11-17T00:00:00.000Z') }]],
    })

    await expect(service.transition(CLAIM_ID, REJECT, FINANCE)).resolves.toMatchObject({
      changed: true,
      receipt: { fromStatus: 'invoiced', toStatus: 'rejected' },
    })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', rejected_reason: 'Wrong scope' }))
    const invoiceRead = renderedWhere(reads[GUARD_READ])
    expect(invoiceRead.sql).toContain('"invoices"."tenant_id" = $')
    expect(invoiceRead.params).toEqual(expect.arrayContaining([INVOICE_ID, TENANT_ID]))
  })

  it('answers not found when the invoiced claim invoice is outside the tenant', async () => {
    const { service, update } = build({ claimStatus: 'invoiced', claimInvoiceId: INVOICE_ID, guardRows: [[]] })

    await expect(service.transition(CLAIM_ID, REJECT, FINANCE)).rejects.toBeInstanceOf(NotFoundException)
    expect(update).not.toHaveBeenCalled()
  })

  it('still rejects a claim that is not yet invoiced', async () => {
    const { service, set } = build({ claimStatus: 'handed_over_finance', guardRows: [] })

    await expect(service.transition(CLAIM_ID, REJECT, FINANCE)).resolves.toMatchObject({
      changed: true,
      receipt: { toStatus: 'rejected' },
    })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', rejected_reason: 'Wrong scope' }))
  })
})
