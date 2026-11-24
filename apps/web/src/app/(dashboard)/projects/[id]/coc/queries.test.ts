import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  select: vi.fn(),
  whereArgs: [] as unknown[],
}))

vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))

import { findDefaultCocSigner, findLatestCocSigner } from './queries'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
const COC_ID = '55555555-5555-4555-8555-555555555555'

function rendered(condition: unknown) {
  return new PgDialect().sqlToQuery(condition as SQL)
}

function collectValues(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (!value || typeof value !== 'object') return [value]
  if (seen.has(value)) return []
  seen.add(value)
  return Object.values(value as Record<string, unknown>).flatMap((child) =>
    collectValues(child, seen)
  )
}

describe('findDefaultCocSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.whereArgs.length = 0
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.whereArgs.push(condition)
          const limit = () => Promise.resolve(mocks.selectResults.shift() ?? [])
          return { limit, orderBy: () => ({ limit }) }
        },
      }),
    }))
  })

  it('uses the linked opportunity account first', async () => {
    mocks.selectResults.push(
      [{ account_id: OPPORTUNITY_ACCOUNT_ID }],
      [{ full_name: ' Ana Client ', email: ' ana@client.test ' }]
    )

    await expect(
      findDefaultCocSigner(TENANT_ID, PROJECT_ID, PROJECT_ACCOUNT_ID)
    ).resolves.toEqual({ name: 'Ana Client', email: 'ana@client.test' })
    expect(collectValues(mocks.whereArgs[1])).toContain(OPPORTUNITY_ACCOUNT_ID)
    expect(collectValues(mocks.whereArgs[1])).toContain(TENANT_ID)
  })

  it('falls back to the project account when no opportunity is linked (hand-created project)', async () => {
    mocks.selectResults.push([], [{ full_name: 'Ben Owner', email: 'ben@owner.test' }])

    await expect(
      findDefaultCocSigner(TENANT_ID, PROJECT_ID, PROJECT_ACCOUNT_ID)
    ).resolves.toEqual({ name: 'Ben Owner', email: 'ben@owner.test' })
    expect(collectValues(mocks.whereArgs[1])).toContain(PROJECT_ACCOUNT_ID)
  })

  it('returns null without a contact lookup when there is no client account at all', async () => {
    mocks.selectResults.push([{ account_id: null }])

    await expect(findDefaultCocSigner(TENANT_ID, PROJECT_ID, null)).resolves.toBeNull()
    expect(mocks.select).toHaveBeenCalledOnce()
  })

  it('returns null when the account has no primary contact', async () => {
    mocks.selectResults.push([], [])

    await expect(
      findDefaultCocSigner(TENANT_ID, PROJECT_ID, PROJECT_ACCOUNT_ID)
    ).resolves.toBeNull()
  })

  it('reads the opportunity and the contact of the session tenant only', async () => {
    mocks.selectResults.push(
      [{ account_id: OPPORTUNITY_ACCOUNT_ID }],
      [{ full_name: 'Ana', email: 'ana@client.test' }]
    )

    await findDefaultCocSigner(TENANT_ID, PROJECT_ID, PROJECT_ACCOUNT_ID)

    const opportunity = rendered(mocks.whereArgs[0])
    expect(opportunity.sql).toContain('"opportunities"."tenant_id"')
    expect(opportunity.params).toEqual([PROJECT_ID, TENANT_ID])
    const contact = rendered(mocks.whereArgs[1])
    expect(contact.sql).toContain('"contacts"."tenant_id"')
    expect(contact.params).toEqual([OPPORTUNITY_ACCOUNT_ID, TENANT_ID, true])
  })
})

describe('findLatestCocSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.whereArgs.length = 0
  })

  it('reads the last link of this certificate in the session tenant', async () => {
    mocks.selectResults.push([{ signer_name: ' Ana ', signer_email: 'ana@client.test' }])

    await expect(findLatestCocSigner(TENANT_ID, COC_ID)).resolves.toEqual({
      name: 'Ana',
      email: 'ana@client.test',
    })
    const where = rendered(mocks.whereArgs[0])
    expect(where.sql).toContain('"signature_sessions"."tenant_id"')
    expect(where.params).toEqual([TENANT_ID, 'coc', COC_ID])
  })

  it('returns null when no link recorded a signer email', async () => {
    mocks.selectResults.push([{ signer_name: 'Ana', signer_email: null }])

    await expect(findLatestCocSigner(TENANT_ID, COC_ID)).resolves.toBeNull()
  })
})
