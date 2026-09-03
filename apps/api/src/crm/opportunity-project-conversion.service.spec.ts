import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'sales',
  email: 'sales@example.test',
}
const ADMIN_PRINCIPAL: ErpPrincipal = {
  userId: '88888888-8888-4888-8888-888888888888',
  tenantId: PRINCIPAL.tenantId,
  role: 'admin',
  email: 'admin@example.test',
}
const VIEWER_PRINCIPAL: ErpPrincipal = {
  userId: '99999999-9999-4999-8999-999999999999',
  tenantId: PRINCIPAL.tenantId,
  role: 'viewer',
  email: 'viewer@example.test',
}
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const CHECKLIST_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const ACCOUNT_ID = '77777777-7777-4777-8777-777777777777'
const DENIED_CONVERSION_ROLES = [
  'estimator',
  'pm',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const satisfies readonly ErpRole[]

type WriteBoundary =
  | 'conversion-request-claim'
  | 'project-create'
  | 'opportunity-backlink'
  | 'checklist-create'
  | 'checklist-items-create'
  | 'notifications-create'
  | 'opportunity-audit'
  | 'project-audit'
  | 'checklist-audit'
  | 'conversion-request-complete'

function conversionHash(): string {
  return createHash('sha256')
    .update(`{"command":{},"opportunityId":"${OPPORTUNITY_ID}"}`)
    .digest('hex')
}

function selectQuery(rows: unknown[]) {
  const locked = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: locked })
  const whereResult = {
    limit,
    for: locked,
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  }
  const where = vi.fn().mockReturnValue(whereResult)
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function harness({
  membership = [
    {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    },
  ],
  membershipSequence,
  opportunity = [
    {
      id: OPPORTUNITY_ID,
      tenantId: PRINCIPAL.tenantId,
      stage: 'won',
      accountId: ACCOUNT_ID,
      projectId: null,
      opportunityType: 'Warehouse fit-out',
    },
  ],
  account = [{ id: ACCOUNT_ID, name: 'Conversion Client' }],
  request = {
    id: REQUEST_ID,
    requestHash: '',
    state: 'processing',
    result: null,
  },
  enabled = true,
  tenantIds = [PRINCIPAL.tenantId],
  recipients = [],
  failureAfter,
}: {
  membership?: unknown[]
  membershipSequence?: unknown[][]
  opportunity?: unknown[]
  account?: unknown[]
  request?: { id: string; requestHash: string; state: string; result: unknown }
  enabled?: boolean
  tenantIds?: string[]
  recipients?: unknown[]
  failureAfter?: WriteBoundary
} = {}) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED') return enabled
      if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS') return tenantIds
      return undefined
    }),
  } as unknown as ConfigService
  let transactionIndex = 0
  const buildSelects = () => {
    const currentMembership =
      membershipSequence?.[transactionIndex] ?? membership
    transactionIndex += 1
    return [
      selectQuery(currentMembership),
      selectQuery(opportunity),
      selectQuery(account),
      selectQuery([request]),
      // Existing checklist lookup, active template lookup, recipients.
      selectQuery([]),
      selectQuery([
        {
          id: '77777777-7777-4777-8777-777777777777',
          items: JSON.stringify([
            { title: 'Kickoff', owner_role: 'pm', sla_days: 1 },
          ]),
        },
      ]),
      selectQuery(recipients),
    ]
  }
  let selects: ReturnType<typeof selectQuery>[] = []
  let activeFailure = failureAfter
  let transactionWrites: WriteBoundary[] = []
  const committedWrites: WriteBoundary[] = []
  const rolledBackAttempts: WriteBoundary[][] = []
  const recordWrite = (boundary: WriteBoundary) => {
    transactionWrites.push(boundary)
    if (activeFailure === boundary) {
      throw new Error(`Injected failure after ${boundary}`)
    }
  }

  const insertLedger = vi.fn().mockImplementation((values) => {
    const created = request.requestHash === ''
    if (created) request.requestHash = values.request_hash
    return {
      onConflictDoNothing: vi.fn().mockImplementation(async () => {
        if (created) recordWrite('conversion-request-claim')
      }),
    }
  })
  const insertProject = {
    returning: vi.fn().mockImplementation(async () => {
      recordWrite('project-create')
      return [{ id: PROJECT_ID }]
    }),
  }
  const insertChecklist = {
    returning: vi.fn().mockImplementation(async () => {
      recordWrite('checklist-create')
      return [{ id: CHECKLIST_ID }]
    }),
  }
  const insertItems = {
    returning: vi.fn().mockImplementation(async () => {
      recordWrite('checklist-items-create')
      return [
        {
          id: '88888888-8888-4888-8888-888888888888',
          sortOrder: 0,
        },
      ]
    }),
  }
  const insertNotifications = {
    then: (
      resolve: (value: undefined) => unknown,
      reject: (reason: unknown) => unknown
    ) =>
      Promise.resolve()
        .then(() => {
          recordWrite('notifications-create')
          return undefined
        })
        .then(resolve, reject),
  }

  let updateCount = 0
  const transactionClient = {
    select: vi.fn().mockImplementation(() => selects.shift()),
    insert: vi.fn(),
    update: vi.fn().mockImplementation(() => {
      updateCount += 1
      const isCompletion = updateCount === 2
      const boundary: WriteBoundary = isCompletion
        ? 'conversion-request-complete'
        : 'opportunity-backlink'
      let completionPayload: Record<string, unknown> | undefined
      const chain = isCompletion
        ? {
            returning: vi.fn().mockImplementation(async () => {
              recordWrite(boundary)
              request.state = 'succeeded'
              request.result = completionPayload?.result ?? null
              return [{ id: REQUEST_ID }]
            }),
          }
        : {
            then: (
              resolve: (value: undefined) => unknown,
              reject: (reason: unknown) => unknown
            ) =>
              Promise.resolve()
                .then(() => {
                  recordWrite(boundary)
                  return undefined
                })
                .then(resolve, reject),
          }
      const where = vi.fn().mockReturnValue(chain)
      return {
        set: vi.fn().mockImplementation((payload) => {
          completionPayload = payload
          return { where }
        }),
      }
    }),
  }
  let transactionTail = Promise.resolve()
  // Model the two database guarantees this service relies on: row-lock waiters
  // run after the owner transaction, and no recorded write becomes committed
  // when the transaction callback rejects.
  const runTransaction = async (callback: (tx: unknown) => unknown) => {
    const originalRequestHash = request.requestHash
    const originalRequestState = request.state
    const originalRequestResult = request.result
    selects = buildSelects()
    updateCount = 0
    transactionWrites = []
    transactionClient.insert.mockReset()
    transactionClient.insert
      .mockReturnValueOnce({ values: insertLedger })
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue(insertProject) })
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue(insertChecklist) })
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue(insertItems) })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue(insertNotifications),
      })
    try {
      const result = await callback(transactionClient)
      committedWrites.push(...transactionWrites)
      return result
    } catch (error) {
      request.requestHash = originalRequestHash
      request.state = originalRequestState
      request.result = originalRequestResult
      rolledBackAttempts.push([...transactionWrites])
      throw error
    } finally {
      transactionWrites = []
    }
  }
  const transaction = vi.fn((callback: (tx: unknown) => unknown) => {
    const result = transactionTail.then(() => runTransaction(callback))
    transactionTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  })
  const auditMock = {
    stampActor: vi.fn(),
    writeSemantic: vi.fn().mockImplementation(async (_transaction, params) => {
      const boundary: WriteBoundary =
        params.entityType === 'opportunity'
          ? 'opportunity-audit'
          : params.entityType === 'project'
            ? 'project-audit'
            : 'checklist-audit'
      recordWrite(boundary)
    }),
  }
  const candidate = new OpportunityProjectConversionService(
    config,
    { client: { transaction } } as unknown as DatabaseService,
    auditMock as unknown as AuditService
  )
  return {
    candidate,
    transaction,
    transactionClient,
    audit: auditMock,
    request,
    committedWrites,
    rolledBackAttempts,
    clearFailure: () => {
      activeFailure = undefined
    },
  }
}

describe('Opportunity project conversion authority', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = harness({ enabled: false })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it.each(DENIED_CONVERSION_ROLES)(
    'denies %s before claiming idempotency or writing an effect',
    async (role) => {
      const probe = harness({
        membership: [
          {
            tenantId: PRINCIPAL.tenantId,
            role,
            email: `${role}@example.test`,
          },
        ],
      })
      await expect(
        probe.candidate.convert(
          OPPORTUNITY_ID,
          {},
          PRINCIPAL,
          `conversion-${role}-denied`
        )
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(probe.transactionClient.select).toHaveBeenCalledOnce()
      expect(probe.transactionClient.insert).not.toHaveBeenCalled()
      expect(probe.transactionClient.update).not.toHaveBeenCalled()
      expect(probe.audit.stampActor).not.toHaveBeenCalled()
      expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
      expect(probe.committedWrites).toEqual([])
    }
  )

  it('rejects a linked Account outside the tenant before claiming or copying it', async () => {
    const probe = harness({ account: [] })
    await expect(
      probe.candidate.convert(
        OPPORTUNITY_ID,
        {},
        PRINCIPAL,
        'conversion-invalid-linked-account'
      )
    ).rejects.toThrow('Opportunity Account is not available in this tenant')
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(3)
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
    expect(probe.committedWrites).toEqual([])
  })

  it.each<ErpRole>(['owner', 'admin', 'sales'])(
    'creates the atomic Project handoff for authorized %s membership',
    async (role) => {
      const { candidate, transactionClient, audit } = harness({
        membership: [
          {
            tenantId: PRINCIPAL.tenantId,
            role,
            email: `${role}@example.test`,
          },
        ],
      })
      await expect(
        candidate.convert(
          OPPORTUNITY_ID,
          {},
          PRINCIPAL,
          `conversion-exact-${role}`
        )
      ).resolves.toEqual({
        ok: true,
        opportunityId: OPPORTUNITY_ID,
        projectId: PROJECT_ID,
        checklistId: CHECKLIST_ID,
        tenantId: PRINCIPAL.tenantId,
        createdProject: true,
      })
      expect(transactionClient.insert).toHaveBeenCalledTimes(4)
      expect(transactionClient.update).toHaveBeenCalledTimes(2)
      expect(audit.writeSemantic).toHaveBeenCalledTimes(3)
      expect(audit.writeSemantic.mock.calls[0]?.[1]).toMatchObject({
        entityType: 'opportunity',
        action: 'status_change',
      })
    }
  )

  it('replays a succeeded request without repeating side effects', async () => {
    const replay = {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      projectId: PROJECT_ID,
      checklistId: CHECKLIST_ID,
      tenantId: PRINCIPAL.tenantId,
      createdProject: true,
    }
    const { candidate, transactionClient, audit } = harness({
      request: {
        id: REQUEST_ID,
        requestHash: conversionHash(),
        state: 'succeeded',
        result: replay,
      },
    })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-replay')
    ).resolves.toEqual(replay)
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('revalidates an authorized cross-actor replay and commits every effect once', async () => {
    const salesMembership = [
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'sales',
        email: PRINCIPAL.email,
      },
    ]
    const adminMembership = [
      {
        tenantId: ADMIN_PRINCIPAL.tenantId,
        role: 'admin',
        email: ADMIN_PRINCIPAL.email,
      },
    ]
    const probe = harness({
      membershipSequence: [salesMembership, adminMembership],
      recipients: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email: 'recipient@example.test',
        },
      ],
    })

    const first = await probe.candidate.convert(
      OPPORTUNITY_ID,
      {},
      PRINCIPAL,
      'conversion-cross-actor'
    )
    const replay = await probe.candidate.convert(
      OPPORTUNITY_ID,
      {},
      ADMIN_PRINCIPAL,
      'conversion-cross-actor'
    )

    expect(replay).toEqual(first)
    expect(probe.transaction).toHaveBeenCalledTimes(2)
    expect(probe.audit.stampActor.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ userId: PRINCIPAL.userId, role: 'sales' }),
      expect.objectContaining({ userId: ADMIN_PRINCIPAL.userId, role: 'admin' }),
    ])
    for (const onceOnly of [
      'conversion-request-claim',
      'project-create',
      'opportunity-backlink',
      'checklist-create',
      'checklist-items-create',
      'notifications-create',
      'opportunity-audit',
      'project-audit',
      'checklist-audit',
      'conversion-request-complete',
    ] satisfies WriteBoundary[]) {
      expect(
        probe.committedWrites.filter((boundary) => boundary === onceOnly)
      ).toHaveLength(1)
    }
  })

  it('does not disclose a replay to a denied or revoked current membership', async () => {
    const probe = harness({
      membershipSequence: [
        [
          {
            tenantId: PRINCIPAL.tenantId,
            role: 'sales',
            email: PRINCIPAL.email,
          },
        ],
        [
          {
            tenantId: VIEWER_PRINCIPAL.tenantId,
            role: 'viewer',
            email: VIEWER_PRINCIPAL.email,
          },
        ],
        [],
      ],
    })

    await probe.candidate.convert(
      OPPORTUNITY_ID,
      {},
      PRINCIPAL,
      'conversion-replay-denied'
    )
    await expect(
      probe.candidate.convert(
        OPPORTUNITY_ID,
        {},
        VIEWER_PRINCIPAL,
        'conversion-replay-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      probe.candidate.convert(
        OPPORTUNITY_ID,
        {},
        VIEWER_PRINCIPAL,
        'conversion-replay-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(probe.audit.stampActor).toHaveBeenCalledOnce()
    expect(probe.rolledBackAttempts).toEqual([[], []])
    expect(
      probe.committedWrites.filter(
        (boundary) => boundary === 'conversion-request-complete'
      )
    ).toHaveLength(1)
  })

  it('serializes concurrent retries and creates each handoff effect once', async () => {
    const probe = harness({
      recipients: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          email: 'recipient@example.test',
        },
      ],
    })

    const [first, concurrentRetry] = await Promise.all([
      probe.candidate.convert(
        OPPORTUNITY_ID,
        {},
        PRINCIPAL,
        'conversion-concurrent'
      ),
      probe.candidate.convert(
        OPPORTUNITY_ID,
        {},
        PRINCIPAL,
        'conversion-concurrent'
      ),
    ])

    expect(concurrentRetry).toEqual(first)
    expect(probe.transaction).toHaveBeenCalledTimes(2)
    for (const onceOnly of [
      'project-create',
      'opportunity-backlink',
      'checklist-create',
      'checklist-items-create',
      'notifications-create',
      'opportunity-audit',
      'project-audit',
      'checklist-audit',
      'conversion-request-complete',
    ] satisfies WriteBoundary[]) {
      expect(
        probe.committedWrites.filter((boundary) => boundary === onceOnly)
      ).toHaveLength(1)
    }
  })

  it('rejects reuse of an idempotency key with a different command hash', async () => {
    const { candidate } = harness({
      request: {
        id: REQUEST_ID,
        requestHash: 'a'.repeat(64),
        state: 'processing',
        result: null,
      },
    })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-conflict')
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it.each<WriteBoundary>([
    'conversion-request-claim',
    'project-create',
    'opportunity-backlink',
    'checklist-create',
    'checklist-items-create',
    'notifications-create',
    'opportunity-audit',
    'project-audit',
    'checklist-audit',
    'conversion-request-complete',
  ])(
    'rolls back an injected failure after %s and permits a clean retry',
    async (failureAfter) => {
      const probe = harness({
        failureAfter,
        recipients: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            email: 'recipient@example.test',
          },
        ],
      })

      await expect(
        probe.candidate.convert(
          OPPORTUNITY_ID,
          {},
          PRINCIPAL,
          `failure-${failureAfter}`
        )
      ).rejects.toThrow(`Injected failure after ${failureAfter}`)
      expect(probe.committedWrites).toEqual([])
      expect(probe.rolledBackAttempts).toHaveLength(1)
      expect(probe.rolledBackAttempts[0]).toContain(failureAfter)
      expect(probe.request.requestHash).toBe('')

      probe.clearFailure()
      await expect(
        probe.candidate.convert(
          OPPORTUNITY_ID,
          {},
          PRINCIPAL,
          `failure-${failureAfter}`
        )
      ).resolves.toMatchObject({
        ok: true,
        opportunityId: OPPORTUNITY_ID,
        projectId: PROJECT_ID,
        checklistId: CHECKLIST_ID,
      })
      expect(probe.committedWrites).toEqual([
        'conversion-request-claim',
        'project-create',
        'opportunity-backlink',
        'checklist-create',
        'checklist-items-create',
        'notifications-create',
        'opportunity-audit',
        'project-audit',
        'checklist-audit',
        'conversion-request-complete',
      ])
    }
  )
})
