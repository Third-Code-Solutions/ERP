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
})
