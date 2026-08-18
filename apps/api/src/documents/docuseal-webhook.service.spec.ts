import 'reflect-metadata'

import {
  bomPortalTokens,
  boms,
  documents,
  notifications,
} from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocuSealWebhookService } from './docuseal-webhook.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const TOKEN_ID = '55555555-5555-4555-8555-555555555555'
const SUBMISSION_ID = 'submission-123'

const COMMAND = {
  event: 'submission.completed' as const,
  submissionId: SUBMISSION_ID,
  documents: [{ url: 'https://sign.example.test/signed.pdf', name: 'signed.pdf' }],
}

function query(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.innerJoin = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.for = vi.fn().mockResolvedValue(rows)
  return chain
}

function harness({
  tokenRows = [
    {
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      bomId: BOM_ID,
      usedAt: null,
    },
  ],
  usedAt = null,
}: {
  tokenRows?: Array<{
    id: string
    tenantId: string
    bomId: string
    usedAt: Date | null
  }>
  usedAt?: Date | null
} = {}) {
  const tokenQuery = query(tokenRows.map((token) => ({ ...token, usedAt })))
  const bomQuery = query([
    {
      id: BOM_ID,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      lockedAt: null,
      tcvCents: 125_000,
      projectName: 'Fit-out',
    },
  ])
  const recipientQuery = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue([
      {
        id: '66666666-6666-4666-8666-666666666666',
        email: 'sales@example.test',
      },
    ]),
  }
  recipientQuery.from.mockReturnValue(recipientQuery)
  let selectCount = 0
  const select = vi.fn(() => {
    const result = [tokenQuery, bomQuery, recipientQuery][selectCount++] ?? recipientQuery
    return result
  })
  const updateWhere = vi.fn().mockResolvedValue([])
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: updateWhere }),
  })
  const insertValues = vi.fn().mockResolvedValue([])
  const insert = vi.fn().mockReturnValue({ values: insertValues })
  const transactionClient = { select, update, insert }
  const transaction = vi
    .fn()
    .mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient)
    )
  const database = { client: { transaction } } as unknown as DatabaseService
  const audit = {
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new DocuSealWebhookService(database, audit),
    transaction,
    select,
    update,
    insert,
    insertValues,
    audit,
  }
}

describe('DocuSeal webhook authority', () => {
  it('ignores an unmatched submission without any mutation', async () => {
    const probe = harness({ tokenRows: [] })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      received: true,
      handled: false,
      duplicate: false,
    })
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('locks the tenant BOM, stores the signed document, and audits the webhook', async () => {
    const probe = harness()
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      received: true,
      handled: true,
      duplicate: false,
      tenantId: TENANT_ID,
      bomId: BOM_ID,
      projectId: PROJECT_ID,
      tcvCents: 125_000,
    })
    expect(probe.insert).toHaveBeenCalledWith(documents)
    expect(probe.insert).toHaveBeenCalledWith(notifications)
    expect(probe.update).toHaveBeenCalledWith(bomPortalTokens)
    expect(probe.update).toHaveBeenCalledWith(boms)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: null,
        entityType: 'bom',
        entityId: BOM_ID,
        action: 'lock',
      })
    )
  })

  it('does not repeat document, lock, or audit side effects for a replay', async () => {
    const probe = harness({ usedAt: new Date('2026-08-10T00:00:00.000Z') })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      received: true,
      handled: true,
      duplicate: true,
    })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

})
