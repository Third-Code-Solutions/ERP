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
      validateEnvironment(REQUIRED).ERP_PO_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_PO_CREATE_WRITES_ENABLED
    ).toBe(true)
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222, 33333333-3333-4333-8333-333333333333',
      }).ERP_PO_CREATE_WRITES_TENANT_IDS
    ).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps purchase-order workflow writes disabled by default', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PO_WORKFLOW_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_PO_WORKFLOW_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_WRITES_ENABLED: 'true',
        ERP_PO_WORKFLOW_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_PO_WORKFLOW_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_WORKFLOW_WRITES_TENANT_IDS')
  })

  it('keeps Purchase Order workflow notifications fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED: 'true',
        ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS')
  })
})
