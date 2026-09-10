import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { ProjectBillingMilestonesService } from './project-billing-milestones.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const COC_ID = '55555555-5555-4555-8555-555555555555'
const INVOICE_ID = '66666666-6666-4666-8666-666666666666'

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy', 'leftJoin', 'innerJoin']) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.then = (
    onFulfilled?: (value: unknown[]) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[]) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const database = { client: { select } } as unknown as DatabaseService
  return new ProjectBillingMilestonesService(database)
}

describe('ProjectBillingMilestonesService', () => {
  it('projects WAR, COC, claim, and invoice readiness without crossing tenant scope', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role }],
      [{ id: PROJECT_ID }],
      [{ claimId: CLAIM_ID, claimNumber: 'PC-00001', milestonePct: 50, amountCents: 100_000, claimStatus: 'handed_over_finance', certificateDocumentId: null, invoiceId: null, invoiceNumber: null, invoiceStatus: null }],
      [{ total: 1 }],
      [{ id: COC_ID, status: 'signed', signedAt: new Date('2026-09-17T09:00:00.000Z') }],
      [{ status: 'locked', weekEnding: '2026-09-13', warSnapshot: { weekEnding: '2026-09-13', overallPct: 50, percentByCategory: { civil_pct: 50, electrical_pct: 50, mep_pct: 50, finishes_pct: 50, overall_pct: 50 }, notes: '', capturedAt: '2026-09-17T09:00:00.000Z' } }],
    ])

    await expect(service.list(PROJECT_ID, { page: 1, limit: 25 }, PRINCIPAL)).resolves.toMatchObject({
      total: 1,
      coc: { status: 'signed' },
      rows: [{ readyForInvoice: true, blockers: [], evidence: { lockedWarPeriods: 1, latestWarOverallPct: 50 } }],
    })
  })

  it('surfaces missing evidence and invoice issuance blockers instead of fabricating readiness', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role }],
      [{ id: PROJECT_ID }],
      [{ claimId: CLAIM_ID, claimNumber: 'PC-00001', milestonePct: 90, amountCents: 100_000, claimStatus: 'handed_over_finance', certificateDocumentId: null, invoiceId: INVOICE_ID, invoiceNumber: 'INV-00001', invoiceStatus: 'draft' }],
      [{ total: 1 }],
      [],
      [],
    ])

    await expect(service.list(PROJECT_ID, { page: 1, limit: 25 }, PRINCIPAL)).resolves.toMatchObject({
      rows: [{ readyForInvoice: false, blockers: expect.arrayContaining(['war_evidence_below_milestone', 'coc_not_signed_for_final_milestone', 'invoice_not_issued']) }],
    })
  })

  it('does not reveal deleted or foreign projects', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role }],
      [],
    ])
    await expect(service.list(PROJECT_ID, { page: 1, limit: 25 }, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })
})
