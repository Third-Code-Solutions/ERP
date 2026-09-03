import { describe, expect, it, vi } from 'vitest'

import { ERP_ROLES, type ErpRole } from '@third-code-erp/shared-types'

import {
  PprfSubmissionService,
  pprfIntakeCommandSchema,
  pprfSubmissionResultSchema,
  type PprfSubmissionStore,
  type PprfSubmissionTransaction,
} from './pprf-submission-service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const PPRF_ID = '55555555-5555-4555-8555-555555555555'
const SUBMISSION_ID = '66666666-6666-4666-8666-666666666666'
const NOW = new Date('2026-09-03T02:00:00.000Z')
const DUE_AT = new Date('2026-09-07T15:59:59.999Z')
const OTHER_TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type TestState = {
  membership: { tenantId: string; userId: string; role: ErpRole } | null
  accounts: Array<{ id: string; tenantId: string; name: string }>
  opportunities: Array<{
    id: string
    tenantId: string
    accountId: string | null
    stage: string
    tcvCents: number
    gpCents: number
    weightedTcvCents: number
    closingDate: Date | null
  }>
  pprfs: Array<{
    id: string
    tenantId: string
    opportunityId: string
    version: number
  }>
  kycResets: Array<{ tenantId: string; opportunityId: string; dueAt: Date }>
  audits: Array<{
    tenantId: string
    actorId: string
    entityType: string
    entityId: string
    action: string
    diff: Record<string, unknown>
  }>
  slas: Array<{ tenantId: string; opportunityId: string }>
  notifications: Array<{
    tenantId: string
    recipientUserId: string
    recipientEmail: string
    subject: string
    body: string
    linkUrl: string
  }>
}

const intakeCommand = {
  submissionId: SUBMISSION_ID,
  clientName: 'Acme Philippines',
  industry: 'other' as const,
  billingAddress: 'Makati City',
  primaryEmail: 'ops@acme.test',
  primaryPhone: '+63 917 000 0000',
  tcvCentavos: '125050',
  gpCentavos: '25010',
  areaSqm: 120,
  closingDate: '2026-09-30',
  opportunityType: 'fit_out',
  remarks: 'Qualified referral',
  pprf: {
    siteAddress: 'Makati City',
    floorAreaSqm: 120.5,
    landlordContact: 'Facilities desk',
    asBuiltAvailable: 'partial' as const,
    scopeNotes: '',
    projectType: '',
    expectedStartDate: '2026-10-01',
    budgetRange: '',
  },
}

const resubmissionCommand = {
  submissionId: SUBMISSION_ID,
  opportunityId: OPPORTUNITY_ID,
  pprf: intakeCommand.pprf,
}

type HarnessOptions = {
  role?: ErpRole
  membership?: boolean
  emptyRecipients?: boolean
  failAt?:
    | 'account'
    | 'opportunity'
    | 'pprf'
    | 'kyc'
    | 'account_audit'
    | 'opportunity_audit'
    | 'pprf_audit'
    | 'sla'
    | 'notifications'
}

function createHarness(options: HarnessOptions = {}) {
  let state: TestState = {
    membership:
      options.membership === false
        ? null
        : {
            tenantId: TENANT_ID,
            userId: USER_ID,
            role: options.role ?? 'sales',
          },
    accounts: [],
    opportunities: [],
    pprfs: [],
    kycResets: [],
    audits: [],
    slas: [],
    notifications: [],
  }
  const locks: string[] = []
  let transactionTail = Promise.resolve()

  const transactionImplementation: PprfSubmissionStore['transaction'] =
    <T>(callback: (transaction: PprfSubmissionTransaction) => Promise<T>) => {
      const run = async (): Promise<T> => {
        const original = structuredClone(state)
        const working = structuredClone(state)
        const tx: PprfSubmissionTransaction = {
          lockMembership: async (principal) => {
            if (
              working.membership?.tenantId !== principal.tenantId ||
              working.membership.userId !== principal.userId
            ) {
              return null
            }
            return {
              tenantId: working.membership.tenantId,
              role: working.membership.role,
            }
          },
          lockCommand: async (tenantId, keyHash) => {
            locks.push(`command:${tenantId}:${keyHash}`)
          },
          findReceipts: async (tenantId, kind, keyHash) =>
            working.audits
              .filter(
                (audit) =>
                  audit.tenantId === tenantId &&
                  audit.entityType === 'pprf_submission' &&
                  audit.action === 'create' &&
                  audit.diff.source === 'pprf_submission_service' &&
                  audit.diff.submission_kind === kind &&
                  audit.diff.idempotency_key_hash === keyHash
              )
              .map((audit) => ({ entityId: audit.entityId, diff: audit.diff })),
          loadPprf: async (tenantId, pprfId) =>
            working.pprfs.find(
              (row) => row.tenantId === tenantId && row.id === pprfId
            ) ?? null,
          loadOpportunity: async (tenantId, opportunityId) =>
            working.opportunities.find(
              (row) => row.tenantId === tenantId && row.id === opportunityId
            ) ?? null,
          loadAccount: async (tenantId, accountId) =>
            working.accounts.find(
              (row) => row.tenantId === tenantId && row.id === accountId
            ) ?? null,
          lockAccountName: async (tenantId, normalizedName) => {
            locks.push(`account:${tenantId}:${normalizedName}`)
          },
          findAccountByName: async (tenantId, name) =>
            working.accounts.find(
              (row) => row.tenantId === tenantId && row.name === name
            ) ?? null,
          createAccount: async (input) => {
            if (options.failAt === 'account') throw new Error('account failed')
            working.accounts.push({
              id: ACCOUNT_ID,
              tenantId: input.tenantId,
              name: input.name,
            })
            return { id: ACCOUNT_ID }
          },
          createOpportunity: async (input) => {
            if (options.failAt === 'opportunity') {
              throw new Error('opportunity failed')
            }
            working.opportunities.push({
              id: OPPORTUNITY_ID,
              tenantId: input.tenantId,
              accountId: input.accountId,
              stage: input.stage,
              tcvCents: input.tcvCents,
              gpCents: input.gpCents,
              weightedTcvCents: input.weightedTcvCents,
              closingDate: input.closingDate,
            })
            return { id: OPPORTUNITY_ID }
          },
          createPprf: async (input) => {
            if (options.failAt === 'pprf') throw new Error('pprf failed')
            working.pprfs.push({
              id: PPRF_ID,
              tenantId: input.tenantId,
              opportunityId: input.opportunityId,
              version: input.version,
            })
            return { id: PPRF_ID }
          },
          resetKycTracks: async (input) => {
            if (options.failAt === 'kyc') throw new Error('kyc failed')
            working.kycResets.push({ ...input })
          },
          writeAudit: async (input) => {
            const failAt =
              input.entityType === 'pprf_submission'
                ? 'pprf_audit'
                : `${input.entityType}_audit`
            if (options.failAt === failAt) {
              throw new Error(`${input.entityType} audit failed`)
            }
            working.audits.push({ ...input })
          },
          ensurePprfReviewSla: async (tenantId, opportunityId) => {
            if (options.failAt === 'sla') throw new Error('sla failed')
            if (
              !working.slas.some(
                (sla) =>
                  sla.tenantId === tenantId &&
                  sla.opportunityId === opportunityId
              )
            ) {
              working.slas.push({ tenantId, opportunityId })
            }
          },
          findNotificationRecipients: async (tenantId, roles) =>
            options.emptyRecipients
              ? []
              : roles.map((role, index) => ({
                  id: `77777777-7777-4777-8${index}77-777777777777`,
                  email: `${role}@example.test`,
                  role,
                  tenantId,
                })),
          createNotifications: async (rows) => {
            if (options.failAt === 'notifications') {
              throw new Error('notifications failed')
            }
            working.notifications.push(...rows)
          },
          lockOpportunity: async (tenantId, opportunityId) =>
            working.opportunities.find(
              (row) => row.tenantId === tenantId && row.id === opportunityId
            ) ?? null,
          nextPprfVersion: async (tenantId, opportunityId) =>
            Math.max(
              0,
              ...working.pprfs
                .filter(
                  (row) =>
                    row.tenantId === tenantId &&
                    row.opportunityId === opportunityId
                )
                .map((row) => row.version)
            ) + 1,
        }
        try {
          const result = await callback(tx)
          state = working
          return result
        } catch (error) {
          state = original
          throw error
        }
      }
      const result = transactionTail.then(run)
      transactionTail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    }
  const transaction = vi.fn()
  const store: PprfSubmissionStore = {
    transaction: <T>(
      callback: (transaction: PprfSubmissionTransaction) => Promise<T>
    ) => {
      transaction()
      return transactionImplementation(callback)
    },
  }
  const service = new PprfSubmissionService(store, {
    now: () => NOW,
    kycDueAt: async () => DUE_AT,
  })
  return {
    service,
    state: () => structuredClone(state),
    replaceState: (replacement: TestState) => {
      state = structuredClone(replacement)
    },
    locks,
    transaction,
  }
}

function seedOpportunity(probe: ReturnType<typeof createHarness>): void {
  const state = probe.state()
  state.accounts.push({ id: ACCOUNT_ID, tenantId: TENANT_ID, name: 'Acme' })
  state.opportunities.push({
    id: OPPORTUNITY_ID,
    tenantId: TENANT_ID,
    accountId: ACCOUNT_ID,
    stage: 'lead',
    tcvCents: 125050,
    gpCents: 25010,
    weightedTcvCents: 12505,
    closingDate: null,
  })
  state.pprfs.push({
    id: '88888888-8888-4888-8888-888888888888',
    tenantId: TENANT_ID,
    opportunityId: OPPORTUNITY_ID,
    version: 1,
  })
  probe.replaceState(state)
}

describe('PPRF submission service contract', () => {
  it('accepts only canonical centavo strings and strict intake fields', () => {
    const command = {
      submissionId: '11111111-1111-4111-8111-111111111111',
      clientName: 'Acme Philippines',
      industry: 'other',
      tcvCentavos: '125050',
      gpCentavos: '25010',
      closingDate: '2026-09-30',
      pprf: {
        siteAddress: 'Makati City',
        floorAreaSqm: 120.5,
        landlordContact: 'Facilities desk',
        asBuiltAvailable: 'partial',
        scopeNotes: '',
        projectType: '',
        expectedStartDate: '2026-10-01',
        budgetRange: '',
      },
    }

    expect(pprfIntakeCommandSchema.safeParse(command).success).toBe(true)
    expect(
      pprfIntakeCommandSchema.safeParse({ ...command, tenantId: 'forged' })
        .success
    ).toBe(false)
    expect(
      pprfIntakeCommandSchema.safeParse({ ...command, tcvCentavos: '1250.50' })
        .success
    ).toBe(false)
    expect(
      pprfIntakeCommandSchema.safeParse({ ...command, closingDate: '2026-02-30' })
        .success
    ).toBe(false)
    expect(
      pprfIntakeCommandSchema.safeParse({
        ...command,
        tcvCentavos: '900000000000',
      }).success
    ).toBe(true)
    expect(
      pprfIntakeCommandSchema.safeParse({
        ...command,
        tcvCentavos: '900000000001',
      }).success
    ).toBe(false)
  })

  it('rejects malformed service results', () => {
    expect(
      pprfSubmissionResultSchema.safeParse({
        ok: true,
        kind: 'intake',
        tenantId: 'not-a-uuid',
      }).success
    ).toBe(false)
  })
})

describe('PPRF submission atomic authority', () => {
  it('commits one complete intake with exact monetary and recipient effects', async () => {
    const probe = createHarness()

    await expect(
      probe.service.submitIntake(
        { tenantId: TENANT_ID, userId: USER_ID },
        intakeCommand
      )
    ).resolves.toEqual({
      ok: true,
      kind: 'intake',
      tenantId: TENANT_ID,
      accountId: ACCOUNT_ID,
      opportunityId: OPPORTUNITY_ID,
      pprfSubmissionId: PPRF_ID,
      version: 1,
      replayed: false,
    })

    const state = probe.state()
    expect(state.accounts).toHaveLength(1)
    expect(state.opportunities).toEqual([
      expect.objectContaining({
        stage: 'lead',
        tcvCents: 125050,
        gpCents: 25010,
        weightedTcvCents: 12505,
        closingDate: new Date('2026-09-29T16:00:00.000Z'),
      }),
    ])
    expect(state.pprfs).toHaveLength(1)
    expect(state.kycResets).toEqual([
      { tenantId: TENANT_ID, opportunityId: OPPORTUNITY_ID, dueAt: DUE_AT },
    ])
    expect(state.audits).toHaveLength(3)
    expect(state.slas).toEqual([
      { tenantId: TENANT_ID, opportunityId: OPPORTUNITY_ID },
    ])
    expect(state.notifications.map((row) => row.recipientEmail)).toEqual([
      'finance@example.test',
      'owner@example.test',
      'admin@example.test',
    ])
    expect(probe.transaction).toHaveBeenCalledOnce()
  })

  it('commits a resubmission version with KYC, SLA, audit, and exact recipients', async () => {
    const probe = createHarness()
    seedOpportunity(probe)

    await expect(
      probe.service.submitResubmission(
        { tenantId: TENANT_ID, userId: USER_ID },
        resubmissionCommand
      )
    ).resolves.toEqual({
      ok: true,
      kind: 'resubmission',
      tenantId: TENANT_ID,
      opportunityId: OPPORTUNITY_ID,
      pprfSubmissionId: PPRF_ID,
      version: 2,
      replayed: false,
    })

    const result = probe.state()
    expect(result.pprfs.map((row) => row.version)).toEqual([1, 2])
    expect(result.audits).toHaveLength(1)
    expect(result.kycResets).toHaveLength(1)
    expect(result.slas).toHaveLength(1)
    expect(result.notifications.map((row) => row.recipientEmail)).toEqual([
      'commercial@example.test',
      'finance@example.test',
    ])
  })

  it.each(ERP_ROLES)(
    'enforces the exact three-role intake and resubmission authority for %s',
    async (role) => {
      const intakeProbe = createHarness({ role })
      const intakeResult = await intakeProbe.service.submitIntake(
        { tenantId: TENANT_ID, userId: USER_ID },
        intakeCommand
      )
      const resubmitProbe = createHarness({ role })
      seedOpportunity(resubmitProbe)
      const resubmitResult = await resubmitProbe.service.submitResubmission(
        { tenantId: TENANT_ID, userId: USER_ID },
        resubmissionCommand
      )
      const allowed = ['owner', 'admin', 'sales'].includes(role)

      expect(intakeResult.ok).toBe(allowed)
      expect(resubmitResult.ok).toBe(allowed)
      if (!allowed) {
        expect(intakeProbe.state().accounts).toHaveLength(0)
        expect(resubmitProbe.state().pprfs).toHaveLength(1)
        expect(resubmitProbe.state().audits).toHaveLength(0)
      }
    }
  )

  it('denies absent and cross-tenant membership before durable effects', async () => {
    const absent = createHarness({ membership: false })
    const crossTenant = createHarness()

    await expect(
      absent.service.submitIntake(
        { tenantId: TENANT_ID, userId: USER_ID },
        intakeCommand
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    await expect(
      crossTenant.service.submitIntake(
        {
          tenantId: '99999999-9999-4999-8999-999999999999',
          userId: USER_ID,
        },
        intakeCommand
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(absent.state().audits).toHaveLength(0)
    expect(crossTenant.state().audits).toHaveLength(0)
  })

  it('replays the same intake key exactly and rejects key reuse with changed payload', async () => {
    const probe = createHarness()
    const principal = { tenantId: TENANT_ID, userId: USER_ID }

    const first = await probe.service.submitIntake(principal, intakeCommand)
    const replay = await probe.service.submitIntake(principal, intakeCommand)
    const conflict = await probe.service.submitIntake(principal, {
      ...intakeCommand,
      remarks: 'Different command',
    })

    expect(first).toMatchObject({ ok: true, replayed: false })
    expect(replay).toEqual({ ...first, replayed: true })
    expect(conflict).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(probe.state().accounts).toHaveLength(1)
    expect(probe.state().pprfs).toHaveLength(1)
    expect(probe.state().notifications).toHaveLength(3)
  })

  it('replays the same resubmission result and rejects changed payload reuse', async () => {
    const probe = createHarness()
    seedOpportunity(probe)
    const principal = { tenantId: TENANT_ID, userId: USER_ID }

    const first = await probe.service.submitResubmission(
      principal,
      resubmissionCommand
    )
    const replay = await probe.service.submitResubmission(
      principal,
      resubmissionCommand
    )
    const conflict = await probe.service.submitResubmission(principal, {
      ...resubmissionCommand,
      pprf: { ...resubmissionCommand.pprf, scopeNotes: 'changed' },
    })

    expect(first).toMatchObject({ ok: true, version: 2, replayed: false })
    expect(replay).toEqual({ ...first, replayed: true })
    expect(conflict).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(probe.state().pprfs).toHaveLength(2)
    expect(probe.state().notifications).toHaveLength(2)
  })

  it('serializes concurrent same-key intake into one complete effect', async () => {
    const probe = createHarness()
    const principal = { tenantId: TENANT_ID, userId: USER_ID }

    const results = await Promise.all([
      probe.service.submitIntake(principal, intakeCommand),
      probe.service.submitIntake(principal, intakeCommand),
    ])

    expect(results).toEqual([
      expect.objectContaining({ ok: true, replayed: false }),
      expect.objectContaining({ ok: true, replayed: true }),
    ])
    expect(probe.state().accounts).toHaveLength(1)
    expect(probe.state().audits).toHaveLength(3)
    expect(probe.state().slas).toHaveLength(1)
  })

  it('isolates reuse of the same key by tenant and scopes both advisory locks', async () => {
    const probe = createHarness()
    await probe.service.submitIntake(
      { tenantId: TENANT_ID, userId: USER_ID },
      intakeCommand
    )
    const state = probe.state()
    state.membership = {
      tenantId: OTHER_TENANT_ID,
      userId: OTHER_USER_ID,
      role: 'sales',
    }
    probe.replaceState(state)

    const second = await probe.service.submitIntake(
      { tenantId: OTHER_TENANT_ID, userId: OTHER_USER_ID },
      intakeCommand
    )

    expect(second).toMatchObject({
      ok: true,
      tenantId: OTHER_TENANT_ID,
      replayed: false,
    })
    expect(probe.state().accounts.map((row) => row.tenantId)).toEqual([
      TENANT_ID,
      OTHER_TENANT_ID,
    ])
    expect(probe.locks.filter((lock) => lock.startsWith('command:'))).toEqual([
      expect.stringContaining(TENANT_ID),
      expect.stringContaining(OTHER_TENANT_ID),
    ])
  })

  it('serializes concurrent resubmissions into distinct versions', async () => {
    const probe = createHarness()
    seedOpportunity(probe)
    const principal = { tenantId: TENANT_ID, userId: USER_ID }

    const results = await Promise.all([
      probe.service.submitResubmission(principal, resubmissionCommand),
      probe.service.submitResubmission(principal, {
        ...resubmissionCommand,
        submissionId: '99999999-9999-4999-8999-999999999999',
      }),
    ])

    expect(results.map((result) => (result.ok ? result.version : 0))).toEqual([
      2, 3,
    ])
    expect(probe.state().pprfs.map((row) => row.version)).toEqual([1, 2, 3])
    expect(probe.state().slas).toHaveLength(1)
  })

  it('keeps the semantic receipt free of the raw key and contact/PPRF fields', async () => {
    const probe = createHarness()
    await probe.service.submitIntake(
      { tenantId: TENANT_ID, userId: USER_ID },
      intakeCommand
    )

    const receipt = probe
      .state()
      .audits.find((audit) => audit.entityType === 'pprf_submission')
    const serialized = JSON.stringify(receipt?.diff)
    expect(serialized).not.toContain(SUBMISSION_ID)
    expect(serialized).not.toContain(intakeCommand.primaryEmail)
    expect(serialized).not.toContain(intakeCommand.primaryPhone)
    expect(serialized).not.toContain(intakeCommand.pprf.siteAddress)
    expect(serialized).toContain('idempotency_key_hash')
    expect(serialized).toContain('command_hash')
  })

  it('treats no matching recipient users as a successful no-row outcome', async () => {
    const probe = createHarness({ emptyRecipients: true })
    const result = await probe.service.submitIntake(
      { tenantId: TENANT_ID, userId: USER_ID },
      intakeCommand
    )

    expect(result).toMatchObject({ ok: true })
    expect(probe.state().notifications).toHaveLength(0)
  })

  it('fails closed when a replay receipt no longer resolves to its result rows', async () => {
    const probe = createHarness()
    const principal = { tenantId: TENANT_ID, userId: USER_ID }
    await probe.service.submitIntake(principal, intakeCommand)
    const state = probe.state()
    state.pprfs = []
    probe.replaceState(state)

    await expect(
      probe.service.submitIntake(principal, intakeCommand)
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(probe.state().accounts).toHaveLength(1)
  })

  it('rejects duplicate intake accounts without creating another effect', async () => {
    const probe = createHarness()
    const state = probe.state()
    state.accounts.push({
      id: ACCOUNT_ID,
      tenantId: TENANT_ID,
      name: 'Acme Philippines',
    })
    probe.replaceState(state)

    await expect(
      probe.service.submitIntake(
        { tenantId: TENANT_ID, userId: USER_ID },
        intakeCommand
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_ACCOUNT' },
    })
    expect(probe.state().accounts).toHaveLength(1)
    expect(probe.state().audits).toHaveLength(0)
  })

  it.each([
    'account',
    'opportunity',
    'pprf',
    'kyc',
    'account_audit',
    'opportunity_audit',
    'pprf_audit',
    'sla',
    'notifications',
  ] as const)('rolls the complete intake back when %s fails', async (failAt) => {
    const probe = createHarness({ failAt })
    const result = await probe.service.submitIntake(
      { tenantId: TENANT_ID, userId: USER_ID },
      intakeCommand
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    })
    expect(probe.state()).toMatchObject({
      accounts: [],
      opportunities: [],
      pprfs: [],
      kycResets: [],
      audits: [],
      slas: [],
      notifications: [],
    })
  })

  it.each(['pprf', 'kyc', 'pprf_audit', 'sla', 'notifications'] as const)(
    'rolls a resubmission back when %s fails',
    async (failAt) => {
      const probe = createHarness({ failAt })
      seedOpportunity(probe)
      const result = await probe.service.submitResubmission(
        { tenantId: TENANT_ID, userId: USER_ID },
        resubmissionCommand
      )

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INTERNAL_ERROR' },
      })
      expect(probe.state().pprfs).toHaveLength(1)
      expect(probe.state().kycResets).toHaveLength(0)
      expect(probe.state().audits).toHaveLength(0)
      expect(probe.state().slas).toHaveLength(0)
      expect(probe.state().notifications).toHaveLength(0)
    }
  )

  it('rejects invalid, unsafe, and missing resubmission targets before effects', async () => {
    const invalid = createHarness()
    const missing = createHarness()

    await expect(
      invalid.service.submitIntake(
        { tenantId: TENANT_ID, userId: USER_ID },
        { ...intakeCommand, tcvCentavos: '900000000001' }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    })
    await expect(
      missing.service.submitResubmission(
        { tenantId: TENANT_ID, userId: USER_ID },
        resubmissionCommand
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(invalid.state().accounts).toHaveLength(0)
    expect(missing.state().pprfs).toHaveLength(0)
  })
})
