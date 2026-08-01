import { describe, expect, it } from 'vitest'
import { validateEnvironment } from './environment'

const REQUIRED = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/erp',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'a'.repeat(20),
  REDIS_URL: 'redis://localhost:6379',
}

describe('ERP API environment', () => {
  it('keeps notification recovery polling disabled by default', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_NOTIFICATION_SWEEP_ENABLED
    ).toBe(false)
  })

  it('requires the exact true value to enable recovery polling', () => {
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_NOTIFICATION_SWEEP_ENABLED: 'true',
      }).ERP_NOTIFICATION_SWEEP_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_NOTIFICATION_SWEEP_ENABLED: '1',
      })
    ).toThrow('ERP_NOTIFICATION_SWEEP_ENABLED')
  })

  it('keeps purchase-order command writes disabled by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PO_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_ENABLED: 'true',
      }).ERP_PO_CREATE_WRITES_ENABLED
    ).toBe(true)
  })
})
