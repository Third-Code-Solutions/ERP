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

  it('keeps BOM Purchase Order writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_PO_BOM_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_PO_BOM_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_BOM_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_PO_BOM_CREATE_WRITES_ENABLED: true,
      ERP_PO_BOM_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_BOM_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps grouped BOM Purchase Order writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED: 'true',
        ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED: true,
      ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps delivery cancellation writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_DELIVERY_CANCEL_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS
    ).toEqual([])

    const enabled = validateEnvironment({
      ...REQUIRED,
      ERP_DELIVERY_CANCEL_WRITES_ENABLED: 'true',
      ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS:
        '22222222-2222-4222-8222-222222222222',
    })
    expect(enabled.ERP_DELIVERY_CANCEL_WRITES_ENABLED).toBe(true)
    expect(enabled.ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS')
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

  it('keeps finance journal posting disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED: 'true',
        ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS')
  })

  it('keeps finance journal reversal disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED: 'true',
        ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS')
  })

  it('keeps supplier-bill reversal disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED: 'true',
        ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED: true,
      ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS')
  })

  it('keeps Supplier Bill posting disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED: 'true',
        ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED: true,
      ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS')
  })

  it('keeps cash workflow writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED: 'true',
        ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED: true,
      ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS')
  })

  it('keeps cash draft writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED: 'true',
        ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED: true,
      ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice issuance disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice reversal disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS')
  })

  it('keeps customer invoice cancellation disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED: 'true',
        ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({
      ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED: true,
      ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS: [
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS')
  })

  it('keeps Change Request command writes disabled and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_CHANGE_REQUEST_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_CHANGE_REQUEST_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_CHANGE_REQUEST_WRITES_ENABLED: 'true',
        ERP_CHANGE_REQUEST_WRITES_TENANT_IDS:
          '22222222-2222-4222-8222-222222222222',
      }).ERP_CHANGE_REQUEST_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_CHANGE_REQUEST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_CHANGE_REQUEST_WRITES_TENANT_IDS')
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

  it('keeps Stock Receipt draft creation fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED: 'true',
        ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS')
  })

  it('keeps Stock Receipt posting and reversal fail-closed', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS).toEqual([])
    expect(parsed.ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED: 'true',
        ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
        ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED: 'true',
        ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS:
          '44444444-4444-4444-8444-444444444444',
      })
    ).toMatchObject({
      ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED: true,
      ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
      ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED: true,
      ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS: [
        '44444444-4444-4444-8444-444444444444',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS')
  })

  it('keeps Delivery receipt writes fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_RECEIPT_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_RECEIPT_WRITES_ENABLED: 'true',
        ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_RECEIPT_WRITES_ENABLED: true,
      ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS')
  })

  it('keeps delivery site-preparation start fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS).toEqual(
      []
    )

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED: 'true',
        ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED: true,
      ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS')
  })

  it('keeps delivery site-preparation completion fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED).toBe(
      false
    )
    expect(
      parsed.ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS
    ).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED: 'true',
        ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED: true,
      ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS:
          'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS')
  })

  it('keeps delivery inspection start fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED: 'true',
        ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED: true,
      ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS')
  })

  it('keeps delivery inspection completion fail-closed and tenant-scoped', () => {
    const parsed = validateEnvironment(REQUIRED)
    expect(parsed.ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED).toBe(false)
    expect(parsed.ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS).toEqual([])

    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED: 'true',
        ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      })
    ).toMatchObject({
      ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED: true,
      ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS: [
        '33333333-3333-4333-8333-333333333333',
      ],
    })
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS')
  })

  it('keeps document processing intake fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_PROCESSING_JOBS_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_JOBS_ENABLED: 'true',
        ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_PROCESSING_JOBS_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS')
  })

  it('keeps document processing recovery scheduling fail-closed and scoped', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED: 'true',
        ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS
    ).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS')
  })

  it('keeps the private worker bridge closed and validates its server URL', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED
    ).toBe(false)
    expect(validateEnvironment(REQUIRED).DXF_PARSER_URL).toBeUndefined()
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: 'true',
        DXF_PARSER_URL: 'ftp://parser.example.test',
      })
    ).toThrow('DXF_PARSER_URL')
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: 'true',
        DXF_PARSER_URL: 'https://parser.example.test',
        PARSER_SHARED_SECRET: 's'.repeat(20),
        SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(20),
      }).ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED
    ).toBe(true)
  })

  it('keeps draft BOM creation independently fail-closed', () => {
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED)
        .ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED: 'true',
        ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED
    ).toBe(true)
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS')
  })

  it('keeps document deletion fail-closed and tenant-scoped', () => {
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_DELETE_WRITES_ENABLED
    ).toBe(false)
    expect(
      validateEnvironment(REQUIRED).ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS
    ).toEqual([])
    expect(
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_DELETE_WRITES_ENABLED: 'true',
        ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS:
          '33333333-3333-4333-8333-333333333333',
      }).ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS
    ).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(() =>
      validateEnvironment({
        ...REQUIRED,
        ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: 'not-a-tenant',
      })
    ).toThrow('ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS')
  })
})
