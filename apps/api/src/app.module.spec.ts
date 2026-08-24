import 'reflect-metadata'

import { MODULE_METADATA } from '@nestjs/common/constants'
import { afterAll, describe, expect, it, vi } from 'vitest'

const originalEnvironment = vi.hoisted(() => {
  const keys = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'REDIS_URL',
  ] as const
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/erp'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'a'.repeat(20)
  process.env.REDIS_URL = 'redis://localhost:6379'
  return { keys, original }
})

import { AppModule } from './app.module'
import { ProcessModule } from './process/process.module'

afterAll(() => {
  for (const key of originalEnvironment.keys) {
    const value = originalEnvironment.original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('AppModule route registration', () => {
  it('registers ProcessModule in the production application graph', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule
    ) as readonly unknown[] | undefined

    expect(imports).toContain(ProcessModule)
  })
})
