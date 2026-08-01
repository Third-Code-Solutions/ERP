import 'reflect-metadata'

import { createHmac } from 'node:crypto'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ClaimedDocumentProcessingJob } from './document-processing.state'
import { DocumentProcessingStorageService } from './document-processing.storage'
import {
  DocumentProcessingWorkerClient,
  DocumentProcessingWorkerError,
} from './document-processing.worker'

const JOB: ClaimedDocumentProcessingJob = {
  jobId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  documentId: '33333333-3333-4333-8333-333333333333',
  projectId: '44444444-4444-4444-8444-444444444444',
  createdBy: '55555555-5555-4555-8555-555555555555',
  role: 'pm',
  email: 'pm@example.test',
  requestedFormat: 'auto',
  createDraftBom: false,
  storagePath: 'cad/plan.dxf',
  fileName: 'plan.dxf',
  attempt: 1,
}

function config(): ConfigService {
  const values: Record<string, unknown> = {
    DXF_PARSER_URL: 'https://parser.example.test/',
    PARSER_SHARED_SECRET: 's'.repeat(20),
  }
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService
}

function evidence(jobId = JOB.jobId) {
  return {
    schema_version: 1,
    job_id: jobId,
    attempt: 1,
    source_sha256: 'a'.repeat(64),
    producer: { name: 'third-code-cad-extractor', version: '0.3.0' },
    source_format: 'dxf',
    parsed_format: 'dxf',
    items: [
      {
        item_key: 'b'.repeat(64),
        code: null,
        description: 'Office diffuser',
        unit: 'unit',
        quantity: 2,
        recommended_unit_cost_cents: 0,
        notes: null,
      },
    ],
    warnings: [],
  }
}

describe('DocumentProcessingWorkerClient', () => {
  it('signs the exact request body and maps evidence to the commit contract', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue('https://storage.example.test/signed?token=secret')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(evidence()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new DocumentProcessingWorkerClient(
      config(),
      { createSignedUrl } as unknown as DocumentProcessingStorageService
    )

    const result = await client.extract(JOB)
    expect(createSignedUrl).toHaveBeenCalledWith('cad/plan.dxf')
    expect(result.response.document_id).toBe(JOB.documentId)
    expect(result.response.scope_items[0]?.quantity).toBe(2)
    expect(result.evidence.job_id).toBe(JOB.jobId)
    expect(result.evidence.items[0]?.item_key).toBe('b'.repeat(64))

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = String(init.body)
    const timestamp = String(
      (init.headers as Record<string, string>)[
        'X-Third-Code-Request-Timestamp'
      ]
    )
    const signature = String(
      (init.headers as Record<string, string>)[
        'X-Third-Code-Request-Signature'
      ]
    )
    expect(signature).toBe(
      createHmac('sha256', 's'.repeat(20))
        .update(`${timestamp}.${JOB.jobId}.${body}`)
        .digest('hex')
    )
    expect(body).not.toContain(JOB.tenantId)
    expect(body).not.toContain(JOB.projectId)
  })

  it('rejects worker responses for another job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(evidence('66666666-6666-4666-8666-666666666666')), {
          status: 200,
        })
      )
    )
    const client = new DocumentProcessingWorkerClient(
      config(),
      {
        createSignedUrl: vi
          .fn()
          .mockResolvedValue('https://storage.example.test/signed'),
      } as unknown as DocumentProcessingStorageService
    )
    await expect(client.extract(JOB)).rejects.toMatchObject({
      code: 'worker_response_mismatched_job',
    } satisfies Partial<DocumentProcessingWorkerError>)
  })
})
