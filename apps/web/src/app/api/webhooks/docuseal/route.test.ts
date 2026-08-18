import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  emailRoles: vi.fn(),
  processDocuSealWebhookThroughCoreApi: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  emailRoles: mocks.emailRoles,
}))
vi.mock('@/lib/erp-core-client', () => ({
  processDocuSealWebhookThroughCoreApi:
    mocks.processDocuSealWebhookThroughCoreApi,
}))

import { POST } from './route'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const WEBHOOK_SECRET = 'test-docuseal-webhook-secret'
const ORIGINAL_WEBHOOK_SECRET = process.env.DOCUSEAL_WEBHOOK_SECRET

function request({
  secret = WEBHOOK_SECRET,
  payload = {
    event: 'submission.completed',
    submission_id: 'submission-123',
    documents: [{ url: 'https://sign.example.test/signed.pdf' }],
  },
}: {
  secret?: string | null
  payload?: unknown
} = {}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (secret !== null) headers.set('x-docuseal-secret', secret)
  return new NextRequest('http://localhost/api/webhooks/docuseal', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
}

describe('DocuSeal Web ingress route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DOCUSEAL_WEBHOOK_SECRET = WEBHOOK_SECRET
    mocks.emailRoles.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (ORIGINAL_WEBHOOK_SECRET === undefined) {
      delete process.env.DOCUSEAL_WEBHOOK_SECRET
    } else {
      process.env.DOCUSEAL_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET
    }
  })

  it('forwards the durable transaction to Core and sends email only after commit', async () => {
    mocks.processDocuSealWebhookThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        received: true,
        handled: true,
        duplicate: false,
        tenantId: TENANT_ID,
        bomId: BOM_ID,
        projectId: PROJECT_ID,
        projectName: 'Fit-out',
        tcvCents: 125_000,
        signedDocument: { url: 'https://sign.example.test/signed.pdf' },
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      handled: true,
      duplicate: false,
    })
    expect(mocks.processDocuSealWebhookThroughCoreApi).toHaveBeenCalledWith({
      event: 'submission.completed',
      submissionId: 'submission-123',
      documents: [{ url: 'https://sign.example.test/signed.pdf' }],
    })
    expect(mocks.emailRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        recipientRoles: ['sales', 'commercial', 'admin', 'owner'],
        templateId: 'bom-signed',
      })
    )
  })

  it('returns a terminal Core error without falling back to Web mutation', async () => {
    mocks.processDocuSealWebhookThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core webhook authority is unavailable.',
      status: 503,
    })

    const response = await POST(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      received: false,
      error: 'ERP Core webhook authority is unavailable.',
    })
    expect(mocks.emailRoles).not.toHaveBeenCalled()
  })

  it('fails closed when the DocuSeal secret is absent', async () => {
    delete process.env.DOCUSEAL_WEBHOOK_SECRET

    const response = await POST(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      received: false,
      error: 'DocuSeal webhook is not configured.',
    })
    expect(mocks.processDocuSealWebhookThroughCoreApi).not.toHaveBeenCalled()
  })

  it('rejects an invalid provider secret before calling Core', async () => {
    const response = await POST(request({ secret: 'wrong-secret' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.processDocuSealWebhookThroughCoreApi).not.toHaveBeenCalled()
  })

  it('acknowledges non-completion events without forwarding a mutation', async () => {
    const response = await POST(
      request({
        payload: {
          event: 'submission.opened',
          submission_id: 'submission-123',
        },
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      ignored: 'submission.opened',
    })
    expect(mocks.processDocuSealWebhookThroughCoreApi).not.toHaveBeenCalled()
  })
})
