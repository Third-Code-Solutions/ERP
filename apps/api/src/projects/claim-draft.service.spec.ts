import 'reflect-metadata'

import { createHash } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import {
  auditLog,
  boms,
  progressClaims,
  projects,
  tenants,
  users,
  variationOrders,
} from '@third-code-erp/database/schema'
import { claimDraftPayload, createClaimDraftCommandSchema } from '@third-code-erp/shared-types'
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

// Each select is answered by the table it reads, so adding a query does not
// shift the others. `wheres` and `locks` keep each table's predicate and lock.
function build(rows: { bom?: unknown[]; vos?: unknown[]; live?: unknown[]; receipt?: unknown[] }) {
  const byTable = new Map<unknown, unknown[]>([
    [users, [{ role: 'finance', status: 'active', email: 'finance@example.test' }]],
    [tenants, [{ status: 'active' }]],
    [projects, [{ id: PROJECT_ID }]],
    [auditLog, rows.receipt ?? []],
    [boms, rows.bom ?? []],
    [variationOrders, rows.vos ?? [{ total: '0' }]],
    [progressClaims, rows.live ?? [{ total: '0' }]],
  ])
  const wheres = new Map<unknown, SQL>()
  const locks = new Map<unknown, unknown>()
  const select = vi.fn(() => {
    let table: unknown
    const builder: Record<string, unknown> = {}
    for (const method of ['limit', 'orderBy']) builder[method] = vi.fn().mockReturnValue(builder)
    builder.from = vi.fn((from: unknown) => {
      table = from
      return builder
    })
    builder.where = vi.fn((where: SQL) => {
      wheres.set(table, where)
      return builder
    })
    builder.for = vi.fn((strength: unknown) => {
      locks.set(table, strength)
      return builder
    })
    builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(byTable.get(table) ?? []).then(onFulfilled, onRejected)
    return builder
  })
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
  const whereOf = (table: unknown) => new PgDialect().sqlToQuery(wheres.get(table)!)
  return { service, insert, values, whereOf, locks }
}

async function capRefusal(attempt: Promise<unknown>): Promise<{ code: string; message: string }> {
  const error = await attempt.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ConflictException)
  return (error as ConflictException).getResponse() as { code: string; message: string }
}

const BOM = [{ tcvCents: '1000000' }]

describe('ClaimDraftService contract-sum cap', () => {
  it('refuses a claim above what remains, naming the remaining amount and the contract split', async () => {
    const { service, insert } = build({ bom: BOM, live: [{ total: '900000' }] })

    const refusal = await capRefusal(service.create(command(150_000), PRINCIPAL))

    expect(refusal).toEqual({
      code: 'claim_cap_exceeded',
      message:
        'This claim is above what can still be claimed. At most ₱1,000.00 remains of the contract sum of ₱10,000.00 (approved BOM ₱10,000.00, excl. VAT) after live claims of ₱9,000.00.',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('allows a claim that brings live claims exactly to the contract sum', async () => {
    const { service, values } = build({ bom: BOM, live: [{ total: '850000' }] })

    await expect(service.create(command(150_000), PRINCIPAL)).resolves.toMatchObject({ created: true, changed: true })
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: TENANT_ID, amount_cents: 150_000, status: 'draft' }))
  })

  it('counts a single centavo over the cap', async () => {
    const { service } = build({ bom: BOM, live: [{ total: '999999' }] })

    await expect(capRefusal(service.create(command(2), PRINCIPAL))).resolves.toMatchObject({ code: 'claim_cap_exceeded' })
  })

  it('tells a project already at or over the contract sum that no further claim fits', async () => {
    const { service, insert } = build({ bom: BOM, live: [{ total: '1200000' }] })

    const refusal = await capRefusal(service.create(command(1), PRINCIPAL))

    expect(refusal.message).toBe(
      'No further claim fits the contract sum. Reject or cancel a claim, or sign a variation order. Live claims total ₱12,000.00 against the contract sum of ₱10,000.00 (approved BOM ₱10,000.00, excl. VAT).',
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('adds signed additive variation orders to the contract sum', async () => {
    const { service } = build({ bom: BOM, vos: [{ total: '200000' }], live: [{ total: '1000000' }] })

    await expect(service.create(command(200_000), PRINCIPAL)).resolves.toMatchObject({ created: true })
  })

  it('subtracts signed deductive variation orders and names them', async () => {
    const { service } = build({ bom: BOM, vos: [{ total: '-300000' }], live: [{ total: '600000' }] })

    const refusal = await capRefusal(service.create(command(200_000), PRINCIPAL))

    expect(refusal.message).toBe(
      'This claim is above what can still be claimed. At most ₱1,000.00 remains of the contract sum of ₱7,000.00 (approved BOM ₱10,000.00 less signed variation orders ₱3,000.00, excl. VAT) after live claims of ₱6,000.00.',
    )
  })

  it('reads the BOM, the signed VOs and the live claims of this tenant and project only, with the BOM held', async () => {
    const { service, whereOf, locks } = build({ bom: BOM })

    await service.create(command(100), PRINCIPAL)

    const bom = whereOf(boms)
    expect(bom.sql).toContain('"boms"."tenant_id" = $')
    expect(bom.sql).toContain('"boms"."project_id" = $')
    expect(bom.params).toEqual(expect.arrayContaining([TENANT_ID, PROJECT_ID, 'approved', 'locked']))
    expect(locks.get(boms)).toBe('share')
    // Draft, pending and rejected VOs do not revise the contract sum.
    const vos = whereOf(variationOrders)
    expect(vos.sql).toContain('"variation_orders"."tenant_id" = $')
    expect(vos.sql).toContain('"variation_orders"."project_id" = $')
    expect(vos.params).toEqual([TENANT_ID, PROJECT_ID, 'signed'])
    const live = whereOf(progressClaims)
    expect(live.sql).toContain('"progress_claims"."tenant_id" = $')
    expect(live.sql).toContain('"progress_claims"."status" not in ($')
    expect(live.params).toEqual([TENANT_ID, PROJECT_ID, 'rejected', 'cancelled'])
  })

  it('still answers an exact replay after the project has reached its cap', async () => {
    const payloadHash = createHash('sha256')
      .update(claimDraftPayload(createClaimDraftCommandSchema.parse(command(150_000))))
      .digest('hex')
    const receipt = {
      schemaVersion: 1,
      operation: 'create_draft',
      tenantId: TENANT_ID,
      actorId: USER_ID,
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      payloadHash,
      claim: {
        id: CLAIM_ID,
        claimNumber: 'PC-00001',
        milestonePct: 40,
        amountCents: 150_000,
        description: 'Mobilization',
        status: 'draft',
        createdBy: USER_ID,
        createdAt: '2026-11-18T01:00:00.000Z',
      },
    }
    const { service, insert } = build({
      bom: BOM,
      live: [{ total: '1000000' }],
      receipt: [{ actorId: USER_ID, action: 'create', diff: { schemaVersion: 1, payloadHash, receipt } }],
    })

    await expect(service.create(command(150_000), PRINCIPAL)).resolves.toMatchObject({ created: false, changed: false, receipt })
    expect(insert).not.toHaveBeenCalled()
  })

  it('leaves a project with no approved BOM uncapped', async () => {
    const { service } = build({ bom: [], vos: [{ total: '500000' }], live: [{ total: '900000000' }] })

    await expect(service.create(command(999_999_999), PRINCIPAL)).resolves.toMatchObject({ created: true })
  })
})
