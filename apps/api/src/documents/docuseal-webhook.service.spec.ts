import 'reflect-metadata'

import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import {
  bomPortalTokens,
  boms,
  documents,
  notifications,
} from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocuSealWebhookService } from './docuseal-webhook.service'

const awardMock = vi.hoisted(() => ({ runSignedBomAward: vi.fn() }))
vi.mock('@third-code-erp/operations/signed-bom-award', () => awardMock)

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
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
  }
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
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
  bomStatus = 'approved',
  handoffRows = [{ id: '77777777-7777-4777-8777-777777777777' }],
  bomRows,
}: {
  tokenRows?: Array<{
    id: string
    tenantId: string
    bomId: string
    usedAt: Date | null
  }>
  usedAt?: Date | null
  bomStatus?: string
  handoffRows?: Array<{ id: string }>
  bomRows?: Array<{
    id: string
    projectId: string
    tenantId: string
    status: string
    lockedAt: Date | null
    tcvCents: number
    projectName: string
  }>
} = {}) {
  const tokenQuery = query(tokenRows.map((token) => ({ ...token, usedAt })))
  const bomQuery = query(bomRows ?? [
    {
      id: BOM_ID,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      status: bomStatus,
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
  const handoffQuery = query(handoffRows)
  handoffQuery.limit.mockResolvedValue(handoffRows)
  let selectCount = 0
  const select = vi.fn(() => {
    const result = [tokenQuery, bomQuery, usedAt ? handoffQuery : recipientQuery][selectCount++] ?? recipientQuery
    return result
  })
  const update = vi.fn((table: unknown) => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: table === boms ? BOM_ID : TOKEN_ID },
        ]),
      }),
    }),
  }))
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
  beforeEach(() => vi.clearAllMocks())
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

  it('locks approved tenant BOM and creates award before consuming the token', async () => {
    const probe = harness()
    awardMock.runSignedBomAward.mockResolvedValue({ handoffId: 'handoff-1' })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      handled: true,
      duplicate: false,
      tenantId: TENANT_ID,
      bomId: BOM_ID,
    })
    expect(probe.insert).toHaveBeenCalledWith(documents)
    expect(probe.insert).toHaveBeenCalledWith(notifications)
    expect(probe.update).toHaveBeenCalledWith(boms)
    expect(probe.update).toHaveBeenCalledWith(bomPortalTokens)
    expect(awardMock.runSignedBomAward).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT_ID, bomId: BOM_ID, actorId: null })
    )
    const bomLockCall = probe.update.mock.invocationCallOrder[0]!
    const tokenConsumeCall = probe.update.mock.invocationCallOrder[1]!
    const awardCall = awardMock.runSignedBomAward.mock.invocationCallOrder[0]!
    expect(bomLockCall).toBeLessThan(awardCall)
    expect(awardCall).toBeLessThan(tokenConsumeCall)
    expect(probe.audit.writeSemantic).toHaveBeenCalled()
  })

  it('does not award when the token has no BOM in its tenant scope', async () => {
    const probe = harness({ bomRows: [] })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      handled: false,
      tenantId: TENANT_ID,
      bomId: BOM_ID,
    })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(awardMock.runSignedBomAward).not.toHaveBeenCalled()
  })

  it('replays a consumed token only when its active award handoff exists', async () => {
    const probe = harness({ usedAt: new Date('2026-08-10T00:00:00.000Z') })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      handled: true,
      duplicate: true,
    })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
    expect(awardMock.runSignedBomAward).not.toHaveBeenCalled()
    expect(probe.select).toHaveBeenCalledTimes(3)
  })

  it('rejects a consumed token with no active award handoff', async () => {
    const probe = harness({
      usedAt: new Date('2026-08-10T00:00:00.000Z'),
      handoffRows: [],
    })
    await expect(probe.service.handle(COMMAND)).rejects.toBeInstanceOf(
      ConflictException
    )
    expect(probe.update).not.toHaveBeenCalled()
    expect(awardMock.runSignedBomAward).not.toHaveBeenCalled()
  })

  it('does not acknowledge or consume the token when award creation fails', async () => {
    const probe = harness()
    awardMock.runSignedBomAward.mockRejectedValue(new Error('Budget baseline failed'))
    await expect(probe.service.handle(COMMAND)).rejects.toThrow('Budget baseline failed')
    expect(probe.update).toHaveBeenCalledWith(boms)
    expect(probe.update).not.toHaveBeenCalledWith(bomPortalTokens)
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('does not acknowledge a provider signature when semantic audit fails', async () => {
    const probe = harness()
    awardMock.runSignedBomAward.mockResolvedValue({ handoffId: 'handoff-1' })
    vi.mocked(probe.audit.writeSemantic).mockRejectedValue(new Error('Audit insert failed'))

    await expect(probe.service.handle(COMMAND)).rejects.toThrow('Audit insert failed')
    expect(probe.transaction).toHaveBeenCalledOnce()
    expect(awardMock.runSignedBomAward).toHaveBeenCalledOnce()
  })

  it('does not acknowledge, consume a token, or lock a draft BOM', async () => {
    const probe = harness({ bomStatus: 'draft' })
    await expect(probe.service.handle(COMMAND)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

})
