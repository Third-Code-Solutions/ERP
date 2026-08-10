import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  notifyRoles: vi.fn(),
  writeAuditLog: vi.fn(),
  docuSealWebhookUseCoreApi: vi.fn(),
  processDocuSealWebhookThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({ db: mocks }))
vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/erp-core-client', () => ({
  docuSealWebhookUseCoreApi: mocks.docuSealWebhookUseCoreApi,
  processDocuSealWebhookThroughCoreApi:
    mocks.processDocuSealWebhookThroughCoreApi,
}))

import { POST } from './route'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const TOKEN_ID = '55555555-5555-4555-8555-555555555555'

function request() {
  return new NextRequest('http://localhost/api/webhooks/docuseal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: 'submission.completed',
      submission_id: 'submission-123',
      documents: [{ url: 'https://sign.example.test/signed.pdf' }],
    }),
  })
}

describe('DocuSeal Web compatibility route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    }
    query.from.mockReturnValue(query)
    query.where.mockReturnValue(query)
    query.limit.mockResolvedValue([
      {
        id: TOKEN_ID,
        tenant_id: TENANT_ID,
        bom_id: BOM_ID,
        used_at: null,
      },
    ])
    mocks.select.mockReturnValue(query)
    mocks.docuSealWebhookUseCoreApi.mockReturnValue(true)
    mocks.notifyRoles.mockResolvedValue(undefined)
  })

  it('forwards the business transaction to Core and preserves notifications', async () => {
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
    expect(mocks.notifyRoles).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('returns a terminal Core error without falling back to Web writes', async () => {
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
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.notifyRoles).not.toHaveBeenCalled()
  })
})
