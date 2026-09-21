import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResendAndSemaphoreAdapter, SapHttpAdapter } from './roadmap-integration.service'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('roadmap external adapters', () => {
  it('fails closed when Resend credentials are absent', async () => {
    const adapter = new ResendAndSemaphoreAdapter(new ConfigService({}))
    await expect(adapter.send({
      channel: 'email',
      provider: 'resend',
      recipient: 'ops@example.com',
      subject: 'Test',
      body: 'Body',
      idempotencyKey: 'delivery-1',
    })).rejects.toThrow('Resend email delivery is not configured')
  })

  it('validates and returns a Resend message id without logging credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 're_123' }))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new ResendAndSemaphoreAdapter(new ConfigService({
      RESEND_API_KEY: 'r'.repeat(24),
      EMAIL_FROM: 'ops@example.com',
    }))

    await expect(adapter.send({
      channel: 'email',
      provider: 'resend',
      recipient: 'ops@example.com',
      subject: 'Test',
      body: 'Body <safe>',
      idempotencyKey: 'delivery-2',
    })).resolves.toEqual({ messageId: 're_123', statusCode: 200 })
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': 'delivery-2' }),
    }))
  })

  it('accepts Semaphore array responses and normalizes the message id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ message_id: 987654 }]))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new ResendAndSemaphoreAdapter(new ConfigService({
      SEMAPHORE_API_KEY: 's'.repeat(24),
      SEMAPHORE_SENDER_NAME: 'ABI OPS',
    }))

    await expect(adapter.send({
      channel: 'sms',
      provider: 'semaphore',
      recipient: '+639171234567',
      subject: null,
      body: 'Approved',
      idempotencyKey: 'delivery-3',
    })).resolves.toEqual({ messageId: '987654', statusCode: 200 })
  })

  it('requires a typed SAP document identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ documentId: 'SAP-1001' }))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = new SapHttpAdapter(new ConfigService({
      SAP_API_URL: 'https://sap.example.com/api',
      SAP_API_TOKEN: 't'.repeat(24),
    }))

    await expect(adapter.post({
      aggregateType: 'supplier_bill',
      aggregateId: '11111111-1111-4111-8111-111111111111',
      postingType: 'invoice_receipt',
      payload: { amountCents: '1000' },
      idempotencyKey: 'sap-1',
    })).resolves.toEqual({ documentId: 'SAP-1001', statusCode: 200 })
  })
})
