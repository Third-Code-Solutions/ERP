import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}))

vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: mocks.eq,
}))

import {
  bomPortalTokens,
  cnpsSurveys,
  customerPortalSessions,
  signatureSessions,
  tenants,
  vendorConfirmationSessions,
  warrantyPortalTokens,
} from '@third-code-erp/database/schema'
import { parsePortalPath, resolvePortalCompanyName } from './portal-tenant'

describe('parsePortalPath', () => {
  it.each([
    ['/portal/project/abc123/progress', 'project', 'abc123'],
    ['/portal/bom/abc123', 'bom', 'abc123'],
    ['/portal/cnps/abc123', 'cnps', 'abc123'],
    ['/portal/warranty/abc123', 'warranty', 'abc123'],
    ['/portal/sign/abc123', 'sign', 'abc123'],
    ['/portal/purchase-order/abc123/confirmation', 'purchase-order', 'abc123'],
  ])('reads kind and token from %s', (path, kind, token) => {
    expect(parsePortalPath(path)).toEqual({ kind, token })
  })

  it.each([null, undefined, '', '/', '/finance', '/portal', '/portal/project', '/portal/unknown/abc', '/portal/constructor/abc'])(
    'ignores %j',
    (path) => {
      expect(parsePortalPath(path)).toBeNull()
    }
  )
})

describe('resolvePortalCompanyName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin })
    mocks.innerJoin.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ limit: mocks.limit })
  })

  it('returns the tenant name found through the token record', async () => {
    mocks.limit.mockResolvedValue([{ name: 'Northwind Builders' }])

    await expect(resolvePortalCompanyName('/portal/warranty/abc123')).resolves.toBe('Northwind Builders')
    expect(mocks.limit).toHaveBeenCalledWith(1)
  })

  it('looks the token up by its hash, never by the plaintext', async () => {
    mocks.limit.mockResolvedValue([])
    await resolvePortalCompanyName('/portal/cnps/abc123')

    const hash = createHash('sha256').update('abc123').digest('hex')
    const values = mocks.eq.mock.calls.map((call) => call[1])
    expect(values).toContain(hash)
    expect(values).not.toContain('abc123')
  })

  it.each([
    ['bom', bomPortalTokens, bomPortalTokens.tenant_id, bomPortalTokens.token_hash],
    ['cnps', cnpsSurveys, cnpsSurveys.tenant_id, cnpsSurveys.response_token_hash],
    ['project', customerPortalSessions, customerPortalSessions.tenant_id, customerPortalSessions.token_hash],
    ['purchase-order', vendorConfirmationSessions, vendorConfirmationSessions.tenant_id, vendorConfirmationSessions.token_hash],
    ['sign', signatureSessions, signatureSessions.tenant_id, signatureSessions.token_hash],
    ['warranty', warrantyPortalTokens, warrantyPortalTokens.tenant_id, warrantyPortalTokens.token_hash],
  ])('a %s link joins the tenant on its own token row and matches that table hash column', async (kind, table, tenantColumn, hashColumn) => {
    mocks.limit.mockResolvedValue([])
    await resolvePortalCompanyName(`/portal/${kind}/abc123`)

    expect(mocks.from).toHaveBeenCalledWith(table)
    expect(mocks.innerJoin).toHaveBeenCalledWith(tenants, expect.anything())
    const [join, match] = mocks.eq.mock.calls
    // Identity checks: Drizzle columns are circular, so deep equality would pass for any column.
    expect(join?.[0]).toBe(tenants.id)
    expect(join?.[1]).toBe(tenantColumn)
    expect(match?.[0]).toBe(hashColumn)
    expect(match?.[1]).toBe(createHash('sha256').update('abc123').digest('hex'))
  })

  it('returns null for an unknown link and for non-portal paths without querying', async () => {
    mocks.limit.mockResolvedValue([])
    await expect(resolvePortalCompanyName('/portal/bom/nope')).resolves.toBeNull()

    mocks.select.mockClear()
    await expect(resolvePortalCompanyName('/finance')).resolves.toBeNull()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('falls back to null when the lookup fails, so the portal still renders', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.limit.mockRejectedValue(new Error('db down'))

    await expect(resolvePortalCompanyName('/portal/project/abc123')).resolves.toBeNull()
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})
