import { createHmac } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentProcessingWorkerRequestSchema,
  documentProcessingWorkerResponseSchema,
  parseCadWorkerResponse,
  type CadWorkerResponse,
  type DocumentProcessingWorkerResponse,
} from '@third-code-erp/shared-types'
import {
  DOCUMENT_PROCESSING_MAX_ITEMS,
  DOCUMENT_PROCESSING_MAX_SOURCE_BYTES,
} from '@third-code-erp/shared-types'
import { DocumentProcessingStorageService } from './document-processing.storage'
import type { ClaimedDocumentProcessingJob } from './document-processing.state'

const WORKER_TIMEOUT_MS = 90_000
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024

export class DocumentProcessingWorkerError extends Error {
  constructor(
    readonly code: string,
    message = code
  ) {
    super(message)
    this.name = 'DocumentProcessingWorkerError'
  }
}

function formatFromJob(
  requestedFormat: string,
  fileName: string
): 'dxf' | 'dwg' {
  if (requestedFormat === 'dxf' || requestedFormat === 'dwg') {
    return requestedFormat
  }
  const extension = fileName.toLowerCase().split('.').pop()
  if (extension === 'dxf' || extension === 'dwg') return extension
  throw new DocumentProcessingWorkerError('unsupported_source_format')
}

function workerUrl(config: ConfigService): string {
  const value = config.get<string>('DXF_PARSER_URL')?.replace(/\/$/, '')
  if (!value) throw new DocumentProcessingWorkerError('worker_url_unavailable')
  return `${value}/parse-evidence`
}

function workerSecret(config: ConfigService): string {
  const value = config.get<string>('PARSER_SHARED_SECRET')
  if (!value || value.length < 20) {
    throw new DocumentProcessingWorkerError('worker_secret_unavailable')
  }
  return value
}

function toCadWorkerResponse(
  evidence: DocumentProcessingWorkerResponse,
  documentId: string
): CadWorkerResponse {
  const workerResponse = {
    document_id: documentId,
    scope_items: evidence.items.map((item) => ({
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost_cents: item.recommended_unit_cost_cents,
      notes: item.notes,
    })),
    count: evidence.items.length,
    warnings: evidence.warnings,
    parsed_format: evidence.parsed_format,
    source_format: evidence.source_format,
  }
  return parseCadWorkerResponse(workerResponse, documentId)
}

export interface DocumentProcessingWorkerResult {
  response: CadWorkerResponse
  sourceSha256: string
  producer: DocumentProcessingWorkerResponse['producer']
}

@Injectable()
export class DocumentProcessingWorkerClient {
  constructor(
    private readonly config: ConfigService,
    private readonly storage: DocumentProcessingStorageService
  ) {}

  async extract(
    job: ClaimedDocumentProcessingJob
  ): Promise<DocumentProcessingWorkerResult> {
    const sourceFormat = formatFromJob(job.requestedFormat, job.fileName)
    const sourceUrl = await this.storage.createSignedUrl(job.storagePath)
    const payload = documentProcessingWorkerRequestSchema.parse({
      job_id: job.jobId,
      attempt: job.attempt,
      source_url: sourceUrl,
      source_format: sourceFormat,
      file_name: job.fileName,
      limits: {
        max_bytes: DOCUMENT_PROCESSING_MAX_SOURCE_BYTES,
        max_items: DOCUMENT_PROCESSING_MAX_ITEMS,
      },
    })
    const body = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1_000).toString()
    const requestId = job.jobId
    const signature = createHmac('sha256', workerSecret(this.config))
      .update(`${timestamp}.${requestId}.${body}`)
      .digest('hex')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(workerUrl(this.config), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Third-Code-Request-Timestamp': timestamp,
          'X-Third-Code-Request-Id': requestId,
          'X-Third-Code-Request-Signature': signature,
        },
        body,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DocumentProcessingWorkerError('worker_timeout')
      }
      throw new DocumentProcessingWorkerError('worker_unavailable')
    } finally {
      clearTimeout(timeout)
    }

    const responseText = await response.text()
    if (new TextEncoder().encode(responseText).byteLength > MAX_RESPONSE_BYTES) {
      throw new DocumentProcessingWorkerError('worker_response_too_large')
    }
    if (!response.ok) {
      throw new DocumentProcessingWorkerError(
        `worker_http_${response.status}`,
        'Private worker rejected the evidence request'
      )
    }

    let rawResponse: unknown
    try {
      rawResponse = JSON.parse(responseText)
    } catch {
      throw new DocumentProcessingWorkerError('worker_response_invalid_json')
    }
    const parsed = documentProcessingWorkerResponseSchema.safeParse(rawResponse)
    if (!parsed.success) {
      throw new DocumentProcessingWorkerError('worker_response_invalid_shape')
    }
    if (
      parsed.data.job_id !== job.jobId ||
      parsed.data.attempt !== job.attempt
    ) {
      throw new DocumentProcessingWorkerError('worker_response_mismatched_job')
    }
    if (
      parsed.data.source_format !== sourceFormat ||
      parsed.data.producer.name !== 'third-code-cad-extractor'
    ) {
      throw new DocumentProcessingWorkerError('worker_response_mismatched_source')
    }

    return {
      response: toCadWorkerResponse(parsed.data, job.documentId),
      sourceSha256: parsed.data.source_sha256,
      producer: parsed.data.producer,
    }
  }
}
