import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanvasSignSession } from './canvas-sign'
import {
  createDocuSealSubmission,
  createSigningSession,
  isDevelopmentStubSubmissionId,
} from './docuseal'

vi.mock('./canvas-sign', () => ({
  createCanvasSignSession: vi.fn(),
}))

const mockedCreateCanvasSignSession = vi.mocked(createCanvasSignSession)

describe('signing integration routing', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    mockedCreateCanvasSignSession.mockReset()
  })

  it('recognizes only legacy development submission markers', () => {
    expect(isDevelopmentStubSubmissionId('dev-sub-example')).toBe(true)
    expect(isDevelopmentStubSubmissionId('live-submission')).toBe(false)
    expect(isDevelopmentStubSubmissionId(null)).toBe(false)
  })

  it('treats in-app canvas signing as production-capable', async () => {
    mockedCreateCanvasSignSession.mockResolvedValue({
      token: 'canvas-token',
      url: 'http://localhost:3000/portal/sign/canvas-token',
      expires_at: new Date('2026-08-15T00:00:00.000Z'),
    })

    await expect(
      createSigningSession({
        tenantId: 'tenant-id',
        entityType: 'bom',
        entityId: 'bom-id',
      })
    ).resolves.toEqual({
      url: 'http://localhost:3000/portal/sign/canvas-token',
      token: 'canvas-token',
      submissionId: null,
      slug: null,
      is_dev_stub: false,
      mechanism: 'canvas',
    })
  })

  it('keeps direct unconfigured DocuSeal calls explicitly marked as stubs', async () => {
    await expect(
      createDocuSealSubmission({
        templateId: 'bom-template',
        submitters: [{ email: 'client@example.test' }],
      })
    ).resolves.toMatchObject({
      is_dev_stub: true,
      url: expect.stringMatching(/^\/portal\/dev-sign\//),
    })
  })

  it('fails closed instead of returning a DocuSeal stub in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(
      createDocuSealSubmission({
        templateId: 'bom-template',
        submitters: [{ email: 'client@example.test' }],
      })
    ).rejects.toThrow('DocuSeal integration is not configured for production')
  })

  it('fails closed for partial DocuSeal URL/token configuration', async () => {
    vi.stubEnv('DOCUSEAL_API_URL', 'https://api.docuseal.example.test/v1')

    await expect(
      createSigningSession({
        tenantId: 'tenant-id',
        entityType: 'bom',
        entityId: 'bom-id',
      })
    ).rejects.toThrow('DOCUSEAL_API_URL and DOCUSEAL_API_TOKEN')
    expect(mockedCreateCanvasSignSession).not.toHaveBeenCalled()
  })

  it('requires the exact entity template and a real signer email', async () => {
    vi.stubEnv('DOCUSEAL_API_URL', 'https://api.docuseal.example.test/v1')
    vi.stubEnv('DOCUSEAL_API_TOKEN', 'x'.repeat(32))

    await expect(
      createSigningSession({
        tenantId: 'tenant-id',
        entityType: 'bom',
        entityId: 'bom-id',
        signerEmail: 'client@example.test',
      })
    ).rejects.toThrow('DOCUSEAL_BOM_TEMPLATE_ID is required')

    vi.stubEnv('DOCUSEAL_BOM_TEMPLATE_ID', 'bom-template-123')
    await expect(
      createSigningSession({
        tenantId: 'tenant-id',
        entityType: 'bom',
        entityId: 'bom-id',
      })
    ).rejects.toThrow('A valid client signer email is required')
  })

  it('creates a DocuSeal submission with configured template and normalized signer', async () => {
    vi.stubEnv('DOCUSEAL_API_URL', 'https://api.docuseal.example.test/v1')
    vi.stubEnv('DOCUSEAL_API_TOKEN', 'x'.repeat(32))
    vi.stubEnv('DOCUSEAL_BOM_TEMPLATE_ID', 'bom-template-123')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'submission-123',
          slug: 'signing-slug',
          url: 'https://sign.docuseal.example.test/signing-slug',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createSigningSession({
        tenantId: 'tenant-id',
        entityType: 'bom',
        entityId: 'bom-id',
        signerEmail: ' Client@Example.Test ',
        signerName: 'Client Contact',
      })
    ).resolves.toEqual({
      url: 'https://sign.docuseal.example.test/signing-slug',
      mechanism: 'docuseal',
      token: 'signing-slug',
      submissionId: 'submission-123',
      slug: 'signing-slug',
      is_dev_stub: false,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.docuseal.example.test/v1/submissions'
    )
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Auth-Token': 'x'.repeat(32),
        }),
        body: expect.stringContaining('client@example.test'),
      })
    )
  })
})
