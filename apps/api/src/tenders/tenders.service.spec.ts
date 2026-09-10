import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { tenderPackages } from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { TendersService } from './tenders.service'

const PRINCIPAL: ErpPrincipal = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'commercial', email: 'commercial@example.test' }
const OPP = '33333333-3333-4333-8333-333333333333'
const TENDER = '44444444-4444-4444-8444-444444444444'
const REQUEST = '55555555-5555-4555-8555-555555555555'
const NOW = new Date('2026-09-10T00:00:00.000Z')

function tenderRow(overrides: Partial<{ version: number; status: 'draft' | 'open' | 'evaluating' | 'submitted' | 'closed' }> = {}) {
  return { id: TENDER, opportunityId: OPP, title: 'Tender', reference: 'TND-1', sourceMode: 'abi_generated_bom' as const, status: overrides.status ?? 'draft', torDocumentId: null, boqDocumentId: null, boundBomId: null, closingAt: null, submittedAt: null, version: overrides.version ?? 1, createdBy: PRINCIPAL.userId, createdAt: NOW, updatedAt: NOW }
}

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder)
  builder.innerJoin = vi.fn().mockReturnValue(builder)
  builder.where = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.orderBy = vi.fn().mockReturnValue(builder)
  builder.for = vi.fn().mockResolvedValue(result)
  builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[], options?: { insertResult?: unknown[]; updateResult?: unknown[] }) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertQuery: Record<string, unknown> = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.insertResult ?? []) }
  const updateQuery: Record<string, unknown> = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.updateResult ?? []) }
  const transactionClient = { select, insert: vi.fn().mockReturnValue(insertQuery), update: vi.fn().mockReturnValue(updateQuery), execute: vi.fn().mockResolvedValue(undefined) }
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = { stampActor: vi.fn().mockResolvedValue(undefined), writeSemantic: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService
  return { service: new TendersService(database, audit), audit, insert: transactionClient.insert, update: transactionClient.update }
}

describe('TendersService', () => {
  it('creates an opportunity-scoped tender and replays the same request idempotently', async () => {
    const probe = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }],
      [{ id: OPP }],
      [],
      [],
      [],
    ], { insertResult: [tenderRow()] })
    await expect(probe.service.create({ opportunityId: OPP, clientRequestId: REQUEST, title: 'Tender', reference: 'TND-1', sourceMode: 'abi_generated_bom', torDocumentId: null, boqDocumentId: null, closingAt: null }, PRINCIPAL)).resolves.toMatchObject({ changed: true, tender: { id: TENDER } })
    expect(probe.insert).toHaveBeenCalledWith(tenderPackages)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'tender_package', action: 'create' }))
  })

  it('rejects stale status changes and viewer writes', async () => {
    const stale = harness([[{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }], [tenderRow({ version: 2 })]])
    await expect(stale.service.transition(OPP, TENDER, { expectedVersion: 1, status: 'open' }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const denied = harness([[{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: 'viewer@example.test' }]])
    await expect(denied.service.create({ opportunityId: OPP, clientRequestId: REQUEST, title: 'Tender', reference: 'TND-1', sourceMode: 'abi_generated_bom', torDocumentId: null, boqDocumentId: null, closingAt: null }, viewer)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
