import 'reflect-metadata'

import { ConflictException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ClaimDraftService } from './claim-draft.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = { userId: USER_ID, tenantId: TENANT_ID, role: 'finance', email: 'finance@example.test' }

function command(amountCents: number) {
  return { clientRequestId: REQUEST_ID, projectId: PROJECT_ID, milestonePct: 40, amountCents, description: 'Mobilization' }
}

function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'for', 'orderBy']) builder[method] = vi.fn().mockReturnValue(builder)
  builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected)
  return builder
}

/**
 * `bomRows` is what the cap reads for the latest approved/locked BOM and
 * `liveRows` the sum of live claims; both come after admit, project lock and
 * the replay lookup.
 */
function build(bomRows: unknown[], liveRows: unknown[]) {
  const queue: unknown[][] = [
    [{ role: 'finance', status: 'active', email: 'finance@example.test' }],
    [{ status: 'active' }],
    [{ id: PROJECT_ID }],
    [],
    bomRows,
    liveRows,
  ]
  const select = vi.fn(() => chain(queue.shift() ?? []))
  const values = vi.fn((row: { amount_cents: number }) => ({
    returning: vi.fn().mockResolvedValue([
      {
        id: CLAIM_ID,
        claimNumber: 'PC-00001',
        milestonePct: 40,
        amountCents: row.amount_cents,
        description: 'Mobilization',
        status: 'draft',
        createdBy: USER_ID,
        createdAt: new Date('2026-11-18T01:00:00.000Z'),
      },
    ]),
  }))
  const insert = vi.fn().mockReturnValue({ values })
  const execute = vi.fn().mockResolvedValue([{ max_suffix: null, now: '2026-11-18T01:00:00.000Z' }])
  const audit = { stampActor: vi.fn(), tryLockTenantChain: vi.fn().mockResolvedValue(true), writeSemantic: vi.fn() }
  const service = new ClaimDraftService(
    { client: { transaction: async (callback: (tx: unknown) => unknown) => callback({ select, insert, execute }) } } as unknown as DatabaseService,
    audit as unknown as AuditService,
  )
  return { service, insert, values, select }
}

describe('ClaimDraftService cumulative cap', () => {
  it('refuses a claim that takes live claims above the approved BOM value, naming both amounts', async () => {
    const { service, insert } = build([{ tcvCents: '1000000' }], [{ total: '900000' }])

    const attempt = service.create(command(150_000), PRINCIPAL)

    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(attempt).rejects.toThrow(
      "This claim would bring the project's live claims to ₱10,500.00, above the approved BOM value of ₱10,000.00.",
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('allows a claim that brings live claims exactly to the approved BOM value', async () => {
    const { service, values } = build([{ tcvCents: '1000000' }], [{ total: '850000' }])

    await expect(service.create(command(150_000), PRINCIPAL)).resolves.toMatchObject({ created: true, changed: true })
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: TENANT_ID, amount_cents: 150_000, status: 'draft' }))
  })

  it('counts a single centavo over the cap', async () => {
    const { service } = build([{ tcvCents: '1000000' }], [{ total: '1000000' }])

    await expect(service.create(command(1), PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
  })

  it('treats a first claim on a project with no live claims as zero', async () => {
    const { service } = build([{ tcvCents: '500000' }], [{ total: '0' }])

    await expect(service.create(command(500_000), PRINCIPAL)).resolves.toMatchObject({ created: true })
  })

  it('reads the BOM value and the live claims of this tenant and project only', async () => {
    const { service, select } = build([{ tcvCents: '1000000' }], [{ total: '0' }])

    await service.create(command(100), PRINCIPAL)

    const whereOf = (index: number) => {
      const builder = select.mock.results[index]?.value as { where: ReturnType<typeof vi.fn> }
      return new PgDialect().sqlToQuery(builder.where.mock.calls[0]![0] as SQL)
    }
    const bom = whereOf(4)
    expect(bom.sql).toContain('"boms"."tenant_id" = $')
    expect(bom.sql).toContain('"boms"."project_id" = $')
    expect(bom.params).toEqual(expect.arrayContaining([TENANT_ID, PROJECT_ID, 'approved', 'locked']))
    const live = whereOf(5)
    expect(live.sql).toContain('"progress_claims"."tenant_id" = $')
    expect(live.sql).toContain('"progress_claims"."project_id" = $')
    expect(live.sql).toContain('"progress_claims"."status" not in ($')
    expect(live.params).toEqual([TENANT_ID, PROJECT_ID, 'rejected', 'cancelled'])
  })

  it('leaves a project with no approved BOM uncapped', async () => {
    const { service } = build([], [])

    await expect(service.create(command(999_999_999), PRINCIPAL)).resolves.toMatchObject({ created: true })
  })
})
