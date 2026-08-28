import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import authApiConfig from '../../vitest.auth-api.config'
import defaultConfig from '../../vitest.config'
import rawPostgresConfig from '../../vitest.raw-postgres.config'

const AUTH_API_PROOF =
  'src/__tests__/tenant-invitation-auth-api.database.test.ts'
const PACKAGE_JSON = readFileSync(
  new URL('../../package.json', import.meta.url),
  'utf8'
)

describe('database Vitest runtime topology', () => {
  it('keeps the generic and raw PostgreSQL matrices separate from the Auth API proof', () => {
    expect(defaultConfig).toEqual({
      test: {
        include: ['src/**/*.test.ts'],
        exclude: [AUTH_API_PROOF],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        pool: 'forks',
      },
    })
    expect(rawPostgresConfig).toEqual({
      test: {
        include: ['src/**/*.test.ts'],
        exclude: [AUTH_API_PROOF],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        pool: 'forks',
      },
    })
  })

  it('keeps the dedicated Auth API command limited to the required proof', () => {
    expect(PACKAGE_JSON).toMatch(/"test": "vitest run"/)
    expect(PACKAGE_JSON).toMatch(
      /"test:auth-api": "vitest run --config vitest\.auth-api\.config\.ts"/
    )
    expect(authApiConfig).toEqual({
      test: {
        include: [AUTH_API_PROOF],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        pool: 'forks',
      },
    })
  })
})
