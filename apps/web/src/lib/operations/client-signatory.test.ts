import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

import { resolvePrimaryClientSignatory } from './client-signatory'

function query(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  return chain
}

describe('primary client signatory resolver', () => {
  beforeEach(() => {
    mocks.select.mockReset()
  })

  it('rejects a project without a tenant-scoped account', async () => {
    mocks.select.mockReturnValueOnce(query([{ accountId: null }]))

    await expect(
      resolvePrimaryClientSignatory('tenant-id', 'project-id')
    ).resolves.toBeNull()
    expect(mocks.select).toHaveBeenCalledOnce()
  })

  it('rejects a primary contact without a valid email', async () => {
    mocks.select
      .mockReturnValueOnce(query([{ accountId: 'account-id' }]))
      .mockReturnValueOnce(
        query([{ name: 'Primary Client', email: 'not-an-email' }])
      )

    await expect(
      resolvePrimaryClientSignatory('tenant-id', 'project-id')
    ).resolves.toBeNull()
  })

  it('returns a normalized primary client contact', async () => {
    mocks.select
      .mockReturnValueOnce(query([{ accountId: 'account-id' }]))
      .mockReturnValueOnce(
        query([{ name: 'Primary Client', email: ' Client@Example.COM ' }])
      )

    await expect(
      resolvePrimaryClientSignatory('tenant-id', 'project-id')
    ).resolves.toEqual({
      name: 'Primary Client',
      email: 'client@example.com',
    })
  })
})
