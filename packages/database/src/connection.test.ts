import { describe, expect, it } from 'vitest'
import { resolveDatabaseConnectionConfig } from './connection'

const sessionPoolerUrl =
  'postgresql://postgres.example:password@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require'

describe('resolveDatabaseConnectionConfig', () => {
  it('uses the Supabase transaction pooler with a bounded client in Vercel', () => {
    const config = resolveDatabaseConnectionConfig(sessionPoolerUrl, {
      VERCEL: '1',
    })

    expect(new URL(config.connectionString).port).toBe('6543')
    expect(config.options).toEqual({
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  })

  it('keeps persistent clients on their configured Supabase session endpoint', () => {
    const config = resolveDatabaseConnectionConfig(sessionPoolerUrl, {})

    expect(config.connectionString).toBe(sessionPoolerUrl)
    expect(config.options).toEqual({ prepare: false })
  })

  it('bounds a Vercel client without rewriting a direct database endpoint', () => {
    const directUrl =
      'postgresql://postgres:password@db.example.supabase.co:5432/postgres?sslmode=require'
    const config = resolveDatabaseConnectionConfig(directUrl, { VERCEL: '1' })

    expect(config.connectionString).toBe(directUrl)
    expect(config.options).toEqual({
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  })

  it('disables prepared statements for explicit transaction-pooler URLs', () => {
    const config = resolveDatabaseConnectionConfig(
      'postgresql://postgres:password@database.internal:6432/postgres?pgbouncer=true',
      {},
    )

    expect(config.options).toEqual({ prepare: false })
  })
})
