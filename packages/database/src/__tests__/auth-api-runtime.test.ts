import { describe, expect, it } from 'vitest'

import { resolveAuthRuntime } from './auth-api-runtime'

const LOCAL_SERVICE_ROLE_KEY =
  'local-service-role-key-for-disposable-supabase-auth-proof-only'

const LOCAL_RUNTIME = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_AUTH_API_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_KEY,
}

describe('ADR-030 Auth API runtime contract', () => {
  it('accepts explicit loopback-only disposable runtime values', () => {
    expect(resolveAuthRuntime(LOCAL_RUNTIME)).toEqual({
      apiUrl: LOCAL_RUNTIME.SUPABASE_AUTH_API_URL,
      databaseUrl: LOCAL_RUNTIME.DATABASE_URL,
      serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
    })
  })

  it.each([
    ['missing Auth API URL', { ...LOCAL_RUNTIME, SUPABASE_AUTH_API_URL: undefined }],
    ['hosted Auth API URL', { ...LOCAL_RUNTIME, SUPABASE_AUTH_API_URL: 'https://project.supabase.co' }],
    ['Auth API path instead of API root', { ...LOCAL_RUNTIME, SUPABASE_AUTH_API_URL: 'http://127.0.0.1:54321/auth/v1' }],
    ['missing database URL', { ...LOCAL_RUNTIME, DATABASE_URL: undefined }],
    ['hosted database URL', { ...LOCAL_RUNTIME, DATABASE_URL: 'postgresql://db.example.com/postgres' }],
    ['placeholder service key', { ...LOCAL_RUNTIME, SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key' }],
  ])('fails closed for %s', (_label, environment) => {
    expect(() => resolveAuthRuntime(environment)).toThrow(/ADR-030 Auth API proof/)
  })
})
