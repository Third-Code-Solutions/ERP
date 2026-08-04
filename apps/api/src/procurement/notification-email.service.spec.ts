import type { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationEmailService } from './notification-email.service'

const INPUT = {
  idempotencyKey:
    'rfq-created/77777777-7777-4777-8777-777777777777',
  lineCount: 2,
  projectName: 'HQ <Fit-out>',
  recipientEmail: 'procurement@example.test',
  rfqId: '33333333-3333-4333-8333-333333333333',
}

const PO_INPUT = {
  idempotencyKey:
    'po-workflow/88888888-8888-4888-8888-888888888888/admin/email',
  poNumber: 'PO-0042',
  projectName: 'HQ <Fit-out>',
  recipientEmail: 'commercial@example.test',
  purchaseOrderId: '33333333-3333-4333-8333-333333333333',
  payload: {
    schemaVersion: 1 as const,
    purchase_order_id: '33333333-3333-4333-8333-333333333333',
    action: 'commercial_approve' as const,
    from_status: 'pending_commercial_approval' as const,
    to_status: 'pending_scm_issuance' as const,
  },
}

const SUPPLIER_INPUT = {
  idempotencyKey:
    'po-supplier/99999999-9999-4999-8999-999999999999',
  poNumber: 'PO-0042',
  projectName: 'HQ <Fit-out>',
  recipientEmail: 'supplier@example.test',
  supplierName: 'Concrete <Co>',
  totalCents: 123_405,
  purchaseOrderId: '33333333-3333-4333-8333-333333333333',
}

const CONFIRMATION_URL =
  'https://third-code-erp-api.example.test/v1/public/purchase-orders/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/confirmation'

function service(
  values: Record<string, string | undefined>
): NotificationEmailService {
  const config = {
    get: vi.fn((name: string) => values[name]),
  }
  return new NotificationEmailService(
    config as unknown as ConfigService
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NotificationEmailService', () => {
  it('sends bounded RFQ email with provider idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-provider-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const email = service({
      RESEND_API_KEY: 're_test_key_long_enough',
      EMAIL_FROM: 'Third Code ERP <erp@example.test>',
      ERP_WEB_BASE_URL: 'https://thirdcode-erp.example.test',
    })

    await expect(email.sendRfqCreated(INPUT)).resolves.toBe(
      'email-provider-id'
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(request.headers).toMatchObject({
      'Idempotency-Key': INPUT.idempotencyKey,
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(String(request.body)) as {
      html: string
      text: string
      to: string[]
    }
    expect(body.to).toEqual([INPUT.recipientEmail])
    expect(body.html).toContain('HQ &lt;Fit-out&gt;')
    expect(body.html).not.toContain('HQ <Fit-out>')
    expect(body.text).toContain(
      `https://thirdcode-erp.example.test/procurement/rfqs/${INPUT.rfqId}`
    )
  })

  it('fails closed before a network call when configuration is absent', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const email = service({})

    await expect(email.sendRfqCreated(INPUT)).rejects.toThrow(
      'RFQ email delivery is not configured'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not copy provider response content into errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('recipient and provider detail', {
          status: 503,
        })
      )
    )
    const email = service({
      RESEND_API_KEY: 're_test_key_long_enough',
      EMAIL_FROM: 'Third Code ERP <erp@example.test>',
      ERP_WEB_BASE_URL: 'https://thirdcode-erp.example.test',
    })

    await expect(email.sendRfqCreated(INPUT)).rejects.toThrow(
      'Resend RFQ email failed (503)'
    )
    await expect(email.sendRfqCreated(INPUT)).rejects.not.toThrow(
      'recipient and provider detail'
    )
  })

  it('sends escaped Purchase Order workflow email with provider idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'po-email-provider-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const email = service({
      RESEND_API_KEY: 're_test_key_long_enough',
      EMAIL_FROM: 'Third Code ERP <erp@example.test>',
      ERP_WEB_BASE_URL: 'https://thirdcode-erp.example.test',
    })

    await expect(email.sendPurchaseOrderWorkflow(PO_INPUT)).resolves.toBe(
      'po-email-provider-id'
    )
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(request.headers).toMatchObject({
      'Idempotency-Key': PO_INPUT.idempotencyKey,
    })
    const body = JSON.parse(String(request.body)) as {
      html: string
      text: string
      to: string[]
    }
    expect(body.to).toEqual([PO_INPUT.recipientEmail])
    expect(body.html).toContain('HQ &lt;Fit-out&gt;')
    expect(body.html).not.toContain('HQ <Fit-out>')
    expect(body.text).toContain(
      'https://thirdcode-erp.example.test/purchase-orders/33333333-3333-4333-8333-333333333333'
    )
  })

  it('sends an exact-cent supplier issuance email with provider idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'supplier-email-provider-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const email = service({
      RESEND_API_KEY: 're_test_key_long_enough',
      EMAIL_FROM: 'Third Code ERP <erp@example.test>',
      ERP_WEB_BASE_URL: 'https://thirdcode-erp.example.test',
    })

    await expect(email.sendPurchaseOrderSupplier(SUPPLIER_INPUT)).resolves.toBe(
      'supplier-email-provider-id'
    )
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(request.headers).toMatchObject({
      'Idempotency-Key': SUPPLIER_INPUT.idempotencyKey,
    })
    const body = JSON.parse(String(request.body)) as {
      html: string
      text: string
      to: string[]
    }
    expect(body.to).toEqual([SUPPLIER_INPUT.recipientEmail])
    expect(body.html).toContain('Concrete &lt;Co&gt;')
    expect(body.html).toContain('PHP 1,234.05')
    expect(body.text).toBe(
      'Hello Concrete <Co>, Purchase order PO-0042 for HQ <Fit-out> is issued. Total: PHP 1,234.05. https://thirdcode-erp.example.test/purchase-orders/33333333-3333-4333-8333-333333333333'
    )
  })

  it('adds a supplier confirmation link only when the gated sender provides one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'supplier-email-provider-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const email = service({
      RESEND_API_KEY: 're_test_key_long_enough',
      EMAIL_FROM: 'Third Code ERP <erp@example.test>',
      ERP_WEB_BASE_URL: 'https://thirdcode-erp.example.test',
    })

    await email.sendPurchaseOrderSupplier({
      ...SUPPLIER_INPUT,
      confirmationUrl: CONFIRMATION_URL,
    })
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body)) as {
      html: string
      text: string
    }
    expect(body.html).toContain(CONFIRMATION_URL)
    expect(body.text).toContain(CONFIRMATION_URL)
  })
})
