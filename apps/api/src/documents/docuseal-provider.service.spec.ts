import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from '../config/environment'
import { docuSealArtifactObjectKey } from './docuseal-artifact.storage'
import { DocuSealProviderService } from './docuseal-provider.service'

const SUBMISSION_ID = 'submission-123'
const PDF_BYTES = Buffer.from('%PDF-1.7\ncompleted', 'ascii')

function service(overrides: Partial<Environment> = {}) {
  const values: Partial<Environment> = {
    NODE_ENV: 'production',
    DOCUSEAL_API_URL: 'https://api.docuseal.example.test/v1/',
    DOCUSEAL_API_TOKEN: 'x'.repeat(32),
    DOCUSEAL_DOCUMENT_HOSTS: ['documents.docuseal.example.test'],
    ...overrides,
  }
  const config = {
    get: vi.fn((key: keyof Environment) => values[key]),
  } as unknown as ConfigService<Environment, true>
  return new DocuSealProviderService(config)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DocuSeal completed artifact provider', () => {
  it('retrieves a fresh URL and returns only a bounded PDF artifact', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [
              {
                name: 'signed.pdf',
                url: 'https://documents.docuseal.example.test/fresh.pdf',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(PDF_BYTES, {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      service().downloadCompletedPdf(SUBMISSION_ID)
    ).resolves.toEqual({ name: 'signed.pdf', bytes: PDF_BYTES })

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.docuseal.example.test/v1/submissions/submission-123/documents?merge=true'
    )
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: { 'X-Auth-Token': 'x'.repeat(32) },
        redirect: 'error',
      })
    )
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://documents.docuseal.example.test/fresh.pdf'
    )
  })

  it('blocks document URLs outside the exact configured host allowlist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documents: [
            {
              name: 'signed.pdf',
              url: 'https://documents.docuseal.example.test.attacker.invalid/file.pdf',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      service().downloadCompletedPdf(SUBMISSION_ID)
    ).rejects.toThrow('outside the configured allowlist')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects invalid PDF magic bytes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [
              {
                url: 'https://documents.docuseal.example.test/fresh.pdf',
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response('not a pdf', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      service().downloadCompletedPdf(SUBMISSION_ID)
    ).rejects.toThrow('valid PDF signature')
  })

  it('rejects a non-PDF download media type before accepting magic bytes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [
              {
                url: 'https://documents.docuseal.example.test/fresh.pdf',
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(PDF_BYTES, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      service().downloadCompletedPdf(SUBMISSION_ID)
    ).rejects.toThrow('did not use the PDF media type')
  })

  it('rejects declared documents over the maximum before reading the body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [
              {
                url: 'https://documents.docuseal.example.test/fresh.pdf',
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(PDF_BYTES, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(25 * 1024 * 1024 + 1),
          },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      service().downloadCompletedPdf(SUBMISSION_ID)
    ).rejects.toThrow('oversized response')
  })

  it('derives a deterministic tenant/project key without provider URL data', () => {
    const input = {
      tenantId: '22222222-2222-4222-8222-222222222222',
      projectId: '44444444-4444-4444-8444-444444444444',
      submissionId: SUBMISSION_ID,
    }
    const first = docuSealArtifactObjectKey(input)
    expect(docuSealArtifactObjectKey(input)).toBe(first)
    expect(
      docuSealArtifactObjectKey({ ...input, submissionId: 'submission-124' })
    ).not.toBe(first)
    expect(first).toBe(
      '22222222-2222-4222-8222-222222222222/' +
        '44444444-4444-4444-8444-444444444444/esign/docuseal/' +
        'c38c010f98910ae5710b340cdc221a044ebb58aac3d8f4a3f8ae2deb8725a133.pdf'
    )
  })
})
