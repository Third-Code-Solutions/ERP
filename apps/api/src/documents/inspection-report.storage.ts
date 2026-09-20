import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export const MAX_INSPECTION_REPORT_BYTES = 2 * 1024 * 1024

const DOCUMENTS_BUCKET = 'documents'
const STORAGE_DEADLINE_MS = 10_000
const PROVIDER_ERROR_MAX_BYTES = 64 * 1024
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CANONICAL_REPORT_PATH = new RegExp(
  `^(${UUID})/opportunities/(${UUID})/inspections/(${UUID})/report-([0-9a-f]{64})\\.html$`
)

type InspectionReportStorageErrorCode =
  | 'configuration'
  | 'validation'
  | 'timeout'
  | 'upload_rejected'
  | 'verification_failed'
  | 'unconfirmed'

export class InspectionReportStorageError extends Error {
  constructor(
    readonly code: InspectionReportStorageErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'InspectionReportStorageError'
  }
}

interface StorageConfiguration {
  origin: string
  serviceRoleKey: string
}

interface ReportPathParts {
  tenantId: string
  opportunityId: string
  inspectionId: string
  sha256: string
}

function invalidInput(): InspectionReportStorageError {
  return new InspectionReportStorageError(
    'validation',
    'Inspection report storage input is invalid'
  )
}

function isReportHtml(bytes: Buffer): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    return (
      (/^<!doctype\s+html\b/i.test(text) || /^<html(?:\s|>)/i.test(text)) &&
      /<html(?:\s|>)/i.test(text) &&
      /<\/html>\s*$/i.test(text)
    )
  } catch {
    return false
  }
}

function parseCanonicalPath(storagePath: string, bytes: Buffer): ReportPathParts {
  if (storagePath !== storagePath.toLowerCase()) throw invalidInput()
  const match = CANONICAL_REPORT_PATH.exec(storagePath)
  if (!match) throw invalidInput()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (match[4] !== sha256) throw invalidInput()
  return {
    tenantId: match[1]!,
    opportunityId: match[2]!,
    inspectionId: match[3]!,
    sha256,
  }
}

function responseBodyCancel(response: Response): void {
  if (!response.body) return
  try {
    void response.body.cancel().catch(() => undefined)
  } catch {
    // A provider may already have closed or locked the response body.
  }
}

function objectStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}

function isDocumentAlreadyExists(status: number, body: Buffer): boolean {
  const text = body.toString('utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    parsed = undefined
  }
  const code = objectStringField(parsed, 'code') ?? objectStringField(parsed, 'error')
  const normalizedCode = code?.trim().toLowerCase()
  const documentedDuplicateCode =
    normalizedCode === 'resourcealreadyexists' ||
    normalizedCode === 'keyalreadyexists' ||
    normalizedCode === 'already_exists'
  if (status === 400) {
    return (
      documentedDuplicateCode ||
      /asset\s+already\s+exists/i.test(text) ||
      /resourcealreadyexists/i.test(text)
    )
  }
  if (status !== 409) return false
  return (
    documentedDuplicateCode ||
    /resource\s+already\s+exists/i.test(text) ||
    /key\s+already\s+exists/i.test(text) ||
    /resourcealreadyexists/i.test(text) ||
    /keyalreadyexists/i.test(text)
  )
}

@Injectable()
export class InspectionReportStorageService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async ensure(input: { storagePath: string; bytes: Buffer }): Promise<void> {
    if (
      !input ||
      typeof input.storagePath !== 'string' ||
      !Buffer.isBuffer(input.bytes) ||
      input.bytes.length === 0 ||
      input.bytes.length > MAX_INSPECTION_REPORT_BYTES ||
      !isReportHtml(input.bytes)
    ) {
      throw invalidInput()
    }

    const pathParts = parseCanonicalPath(input.storagePath, input.bytes)
    const configuration = this.storageConfiguration()
    const uploadUrl = this.objectUrl(configuration.origin, input.storagePath, false)
    const verifyUrl = this.objectUrl(configuration.origin, input.storagePath, true)
    const requestBody = Buffer.from(input.bytes)
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        abort.abort()
        reject(
          new InspectionReportStorageError(
            'timeout',
            'Inspection report storage request timed out'
          )
        )
      }, STORAGE_DEADLINE_MS)
    })

    try {
      const headers = {
        Authorization: `Bearer ${configuration.serviceRoleKey}`,
        apikey: configuration.serviceRoleKey,
      }
      const uploadRequest: RequestInit & { cache: 'no-store' } = {
        method: 'POST',
        headers: {
          ...headers,
          'content-length': String(requestBody.length),
          'content-type': 'text/html',
          'x-upsert': 'false',
        },
        body: requestBody,
        redirect: 'error',
        cache: 'no-store',
        signal: abort.signal,
      }
      const uploadResponse = await Promise.race([
        fetch(uploadUrl, uploadRequest),
        deadline,
      ])
      const uploadBody = await this.readResponseBody(
        uploadResponse,
        deadline,
        PROVIDER_ERROR_MAX_BYTES
      )
      const duplicate = isDocumentAlreadyExists(uploadResponse.status, uploadBody)
      if (!duplicate && uploadResponse.status !== 200 && uploadResponse.status !== 201) {
        responseBodyCancel(uploadResponse)
        throw new InspectionReportStorageError(
          'upload_rejected',
          'Inspection report upload was rejected'
        )
      }

      await this.verifyStoredObject(
        verifyUrl,
        headers,
        requestBody,
        pathParts.sha256,
        abort,
        deadline
      )
    } catch (error) {
      if (error instanceof InspectionReportStorageError) throw error
      if (timedOut || abort.signal.aborted) {
        throw new InspectionReportStorageError(
          'timeout',
          'Inspection report storage request timed out'
        )
      }
      // Provider errors can contain URLs, credentials, or internal object paths.
      throw new InspectionReportStorageError(
        'unconfirmed',
        'Inspection report upload is unconfirmed'
      )
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      abort.abort()
    }
  }

  private storageConfiguration(): StorageConfiguration {
    try {
      const rawUrl = this.config.get<string>('SUPABASE_URL')
      const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
      if (
        typeof rawUrl !== 'string' ||
        typeof serviceRoleKey !== 'string' ||
        serviceRoleKey.trim() === '' ||
        /[\r\n]/.test(serviceRoleKey)
      ) {
        throw new Error('missing storage configuration')
      }
      const url = new URL(rawUrl)
      if (
        url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.hostname === ''
      ) {
        throw new Error('unsafe storage origin')
      }
      return { origin: url.origin, serviceRoleKey }
    } catch {
      throw new InspectionReportStorageError(
        'configuration',
        'Inspection report storage is unavailable'
      )
    }
  }

  private objectUrl(origin: string, storagePath: string, authenticated: boolean): string {
    const route = authenticated ? 'authenticated/' : ''
    const encodedPath = storagePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `${origin}/storage/v1/object/${route}${DOCUMENTS_BUCKET}/${encodedPath}`
  }

  private async verifyStoredObject(
    url: string,
    headers: Record<string, string>,
    expectedBytes: Buffer,
    expectedSha256: string,
    abort: AbortController,
    deadline: Promise<never>
  ): Promise<void> {
    const verifyRequest: RequestInit & { cache: 'no-store' } = {
      method: 'GET',
      headers: { ...headers, Accept: 'text/html' },
      redirect: 'error',
      cache: 'no-store',
      signal: abort.signal,
    }
    const response = await Promise.race([
      fetch(url, verifyRequest),
      deadline,
    ])
    if (
      response.status !== 200 ||
      response.headers.has('content-range')
    ) {
      responseBodyCancel(response)
      throw new InspectionReportStorageError(
        'verification_failed',
        'Inspection report object could not be verified in full'
      )
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    if (mimeType !== 'text/html') {
      responseBodyCancel(response)
      throw new InspectionReportStorageError(
        'verification_failed',
        'Inspection report object MIME could not be verified'
      )
    }
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null && !/^\d+$/.test(declaredLength.trim())) {
      responseBodyCancel(response)
      throw new InspectionReportStorageError(
        'verification_failed',
        'Inspection report object size could not be verified'
      )
    }
    if (declaredLength !== null && Number(declaredLength) !== expectedBytes.length) {
      responseBodyCancel(response)
      throw new InspectionReportStorageError(
        'verification_failed',
        'Inspection report object size could not be verified'
      )
    }
    const storedBytes = await this.readResponseBody(
      response,
      deadline,
      MAX_INSPECTION_REPORT_BYTES
    )
    const storedSha256 = createHash('sha256').update(storedBytes).digest('hex')
    if (
      storedBytes.length !== expectedBytes.length ||
      storedSha256 !== expectedSha256 ||
      !isReportHtml(storedBytes)
    ) {
      throw new InspectionReportStorageError(
        'verification_failed',
        'Inspection report object bytes could not be verified'
      )
    }
  }

  private async readResponseBody(
    response: Response,
    deadline: Promise<never>,
    maximumBytes: number
  ): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0)
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let totalBytes = 0
    let completed = false
    try {
      for (;;) {
        const chunk = await Promise.race([reader.read(), deadline])
        if (chunk.done) {
          completed = true
          break
        }
        if (!chunk.value || chunk.value.byteLength === 0) continue
        totalBytes += chunk.value.byteLength
        if (totalBytes > maximumBytes) {
          throw new InspectionReportStorageError(
            'verification_failed',
            'Inspection report response exceeded the verification limit'
          )
        }
        chunks.push(Buffer.from(chunk.value))
      }
      return Buffer.concat(chunks, totalBytes)
    } finally {
      if (!completed) void reader.cancel().catch(() => undefined)
      try {
        reader.releaseLock()
      } catch {
        // A provider may leave a pending read after the deadline; do not wait
        // for cleanup or allow that provider error to replace the safe result.
      }
    }
  }
}
