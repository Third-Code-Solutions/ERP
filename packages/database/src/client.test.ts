import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ postgres: vi.fn(() => ({ end: vi.fn() })), drizzle: vi.fn(() => ({ select: vi.fn() })) }))
vi.mock('postgres', () => ({ default: mocks.postgres }))
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: mocks.drizzle }))
vi.mock('./schema', () => ({}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1:54322/fixture')
  vi.stubGlobal('__thirdCodeErpQueryClients', new Map())
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('lazy database pool lifecycle', () => {
  it('reuses one driver pool across route module reloads but refreshes the ORM schema', async () => {
    for (let index = 0; index < 50; index++) {
      vi.resetModules()
      const { db } = await import('./client')
      void db.select
    }
    expect(mocks.postgres).toHaveBeenCalledTimes(1)
    expect(mocks.drizzle).toHaveBeenCalledTimes(50)
  })

  it('never reuses a pool for a different database configuration', async () => {
    void (await import('./client')).db.select
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1:54322/other_fixture')
    void (await import('./client')).db.select
    expect(mocks.postgres).toHaveBeenCalledTimes(2)
  })

  it('keeps production module instances independent', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    void (await import('./client')).db.select
    vi.resetModules()
    void (await import('./client')).db.select
    expect(mocks.postgres).toHaveBeenCalledTimes(2)
  })

  it('does not require a database URL until first use', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { db } = await import('./client')
    expect(mocks.postgres).not.toHaveBeenCalled()
    expect(() => db.select).toThrow('DATABASE_URL environment variable is required')
  })
})
