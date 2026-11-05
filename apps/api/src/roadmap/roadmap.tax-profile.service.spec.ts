import 'reflect-metadata'

import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { RoadmapService } from './roadmap.service'

const CHECKER: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'checker@example.test',
}
const PREPARER_ID = '33333333-3333-4333-8333-333333333333'
const PROFILE_ID = '44444444-4444-4444-8444-444444444444'
const ACTIVE_ID = '55555555-5555-4555-8555-555555555555'

type Row = Record<string, unknown>

// Every Drizzle builder step returns the same node; awaiting it yields rows.
function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  }
  for (const method of ['from', 'where', 'limit', 'for', 'orderBy', 'returning']) {
    node[method] = vi.fn(() => node)
  }
  return node
}

function profileRow(overrides: Row = {}): Row {
  return {
    id: PROFILE_ID,
    tenant_id: CHECKER.tenantId,
    code: 'B-2027',
    name: 'Profile B',
    valid_from: '2027-06-01',
    valid_to: '2027-12-31',
    vat_rate_bps: 1200,
    withholding_rate_bps: 200,
    retention_rate_bps: 1000,
    vat_registered: true,
    bir_form_version: null,
    statutory_configuration: {},
    status: 'draft',
    created_by: PREPARER_ID,
    approved_by: null,
    approved_at: null,
    created_at: new Date('2026-11-01T00:00:00Z'),
    updated_at: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  }
}

function harness(selectRows: unknown[][], featureEnabled = true) {
  const select = vi.fn()
  for (const rows of selectRows) select.mockReturnValueOnce(chain(rows))
  const inserts: Row[] = []
  const updates: Row[] = []
  const transactionClient = {
    select,
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({
      values: vi.fn((values: Row) => {
        inserts.push(values)
        return chain('statutory_configuration' in values ? [profileRow({ ...values, id: PROFILE_ID })] : [])
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Row) => {
        updates.push(values)
        return chain([profileRow(values)])
      }),
    })),
  }
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const config = {
    get: vi.fn((key: string) => featureEnabled && key === 'ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED'),
  } as unknown as ConfigService
  const service = new RoadmapService(
    config,
    {
      client: {
        transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
      },
    } as unknown as DatabaseService,
    audit as unknown as AuditService,
  )
  const activate = (key = 'tax-activate-1') =>
    service.transitionTaxProfile(PROFILE_ID, { action: 'activate' }, CHECKER, key)
  return { service, activate, inserts, updates, audit }
}

// Transition select order: principal, prior workflow event, profile FOR UPDATE, overlap.
function activation(profile: Row, overlapRows: unknown[] = []) {
  return harness([[{ id: CHECKER.userId }], [], [profile], overlapRows])
}

function expectNothingWritten(h: ReturnType<typeof harness>) {
  expect(h.updates).toHaveLength(0)
  expect(h.inserts).toHaveLength(0)
  expect(h.audit.writeSemantic).not.toHaveBeenCalled()
}

describe('tax profile activation guards (spec tenancy §6, today 2026-11-05 Manila)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T02:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('G-1 / AC-TEN-16: the preparer cannot activate; B stays draft and nothing is written', async () => {
    const h = activation(profileRow({ created_by: CHECKER.userId }))

    const result = h.activate()

    await expect(result).rejects.toBeInstanceOf(ForbiddenException)
    await expect(result).rejects.toThrow('The tax profile preparer cannot activate it')
    expectNothingWritten(h)
  })

  it('G-2: a different finance user activates and is recorded as approver', async () => {
    const h = activation(profileRow())

    await expect(h.activate()).resolves.toMatchObject({ taxProfileId: PROFILE_ID, status: 'active' })
    expect(h.updates[0]).toMatchObject({ status: 'active', approved_by: CHECKER.userId })
    expect(h.audit.writeSemantic).toHaveBeenCalledTimes(1)
  })

  it('G-3 / AC-TEN-15: a backdated profile is refused and stays draft', async () => {
    const h = activation(profileRow({ valid_from: '2026-11-04', valid_to: null }))

    const result = h.activate()

    await expect(result).rejects.toBeInstanceOf(ConflictException)
    await expect(result).rejects.toThrow('valid-from must be today or later')
    expectNothingWritten(h)
  })

  it('G-3: "today" is the Manila date, not the UTC date', async () => {
    // 2026-11-05T17:00Z is already 2026-11-06 in Manila.
    vi.setSystemTime(new Date('2026-11-05T17:00:00.000Z'))
    const h = activation(profileRow({ valid_from: '2026-11-05', valid_to: null }))

    await expect(h.activate()).rejects.toThrow('valid-from must be today or later')
    expectNothingWritten(h)
  })

  it('G-4: a profile starting today activates', async () => {
    const h = activation(profileRow({ valid_from: '2026-11-05', valid_to: null }))

    await expect(h.activate()).resolves.toMatchObject({ status: 'active' })
  })

  it('G-5 / AC-TEN-14: an overlapping active profile is named and B stays draft', async () => {
    const h = activation(profileRow(), [{ id: ACTIVE_ID, code: 'A-2027' }])

    const result = h.activate()

    await expect(result).rejects.toBeInstanceOf(ConflictException)
    await expect(result).rejects.toThrow(
      'An active tax profile (A-2027) already covers this effective date range',
    )
    expectNothingWritten(h)
  })

  it('G-6: with no overlapping active profile (adjacent range) B activates', async () => {
    const h = activation(profileRow({ valid_from: '2027-01-01', valid_to: null }), [])

    await expect(h.activate()).resolves.toMatchObject({ status: 'active' })
  })
})

describe('tax profile create replay (spec tenancy G-7)', () => {
  const COMMAND = {
    code: 'B-2027',
    name: 'Profile B',
    validFrom: '2027-06-01',
    validTo: '2027-12-31',
    vatRateBps: 1200,
    withholdingRateBps: 200,
    retentionRateBps: 1000,
    vatRegistered: true,
    statutoryConfiguration: {},
  }

  // Create select order: principal, prior workflow event, existing profile by code.
  function createWith(existing: Row) {
    return harness([[{ id: CHECKER.userId }], [], [existing]])
  }

  it.each([
    ['vatRegistered flipped', { vatRegistered: false }],
    ['valid-from moved', { validFrom: '2027-07-01' }],
    ['valid-to moved', { validTo: '2028-01-31' }],
    ['valid-to cleared', { validTo: null }],
  ])('%s is a conflict and changes nothing', async (_name, change) => {
    const h = createWith(profileRow())

    await expect(
      h.service.createTaxProfile({ ...COMMAND, ...change }, CHECKER, 'tax-create-1'),
    ).rejects.toThrow('Tax profile code is already used by a different definition')
    expectNothingWritten(h)
  })

  it('an identical definition returns the existing profile', async () => {
    const h = createWith(profileRow())

    await expect(h.service.createTaxProfile(COMMAND, CHECKER, 'tax-create-2')).resolves.toMatchObject({
      taxProfileId: PROFILE_ID,
      created: false,
    })
    expectNothingWritten(h)
  })

  it('an omitted valid-to matches a stored open-ended profile', async () => {
    const h = createWith(profileRow({ valid_to: null }))
    const { validTo: _omitted, ...openEnded } = COMMAND

    await expect(h.service.createTaxProfile(openEnded, CHECKER, 'tax-create-3')).resolves.toMatchObject({
      created: false,
    })
  })
})

describe('tax profile writes stay gated (spec tenancy AC-TEN-05)', () => {
  it('create is refused with 503 and writes nothing when the feature is off', async () => {
    // The only read is the tenant feature-flag lookup, which finds no enabled row.
    const h = harness([[]], false)

    const result = h.service.createTaxProfile(
      {
        code: 'B-2027',
        name: 'Profile B',
        validFrom: '2027-06-01',
        vatRateBps: 1200,
        withholdingRateBps: 200,
        retentionRateBps: 1000,
        vatRegistered: true,
        statutoryConfiguration: {},
      },
      CHECKER,
      'tax-create-gated',
    )

    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(result).rejects.toThrow('Roadmap feature tax_statutory_outputs is disabled')
    expectNothingWritten(h)
  })

  it('activate is refused with 503 and writes nothing when the feature is off', async () => {
    const h = harness([[]], false)

    await expect(h.activate('tax-activate-gated')).rejects.toBeInstanceOf(ServiceUnavailableException)
    expectNothingWritten(h)
  })
})
