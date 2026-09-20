import { createHash } from 'node:crypto'
import { Inject, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { inspectionPhotoCommandSchema, type InspectionPhotoCommand } from '@third-code-erp/shared-types'

const MAX_BYTES = 15 * 1024 * 1024
const READ_TIMEOUT_MS = 10_000
const PROVIDER_ERROR_MAX_BYTES = 64 * 1024
const UUID_SEGMENT = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/

interface UploadStorageConfiguration {
  origin: string
  serviceRoleKey: string
}

export interface VerifiedInspectionPhoto {
  sha256: string
  sizeBytes: number
  mimeType: InspectionPhotoCommand['mimeType']
}

function imageType(prefix: Buffer): InspectionPhotoCommand['mimeType'] | null {
  if (prefix.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (['GIF87a', 'GIF89a'].includes(prefix.toString('ascii', 0, 6))) return 'image/gif'
  if (prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (prefix.toString('ascii', 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(prefix.toString('ascii', 8, 12))) return 'image/heic'
  return null
}

function canonicalPhotoPath(command: InspectionPhotoCommand): { parts: string[]; leafHash: string } {
  const parts = command.storagePath.split('/')
  const leaf = parts.at(-1) ?? ''
  const match = /^([a-fA-F0-9]{64})-([a-zA-Z0-9._-]{1,160})$/.exec(leaf)
  if (!match || match[2] !== command.fileName || parts.length !== 5 ||
    !UUID_SEGMENT.test(parts[0] ?? '') || parts[1] !== 'opportunities' ||
    parts[2]?.toLowerCase() !== command.opportunityId.toLowerCase() || parts[3] !== 'inspection' ||
    parts.some((part) => part.includes('..'))) {
    throw new UnprocessableEntityException('Inspection photo requires a canonical content-addressed path')
  }
  return { parts, leafHash: match[1]!.toLowerCase() }
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}

function isKnownObjectAlreadyExists(status: number, body: Buffer): boolean {
  if (status !== 400 && status !== 409) return false
  const text = body.toString('utf8').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    parsed = undefined
  }
  const values = [
    text,
    stringField(parsed, 'code'),
    stringField(parsed, 'error'),
    stringField(parsed, 'message'),
  ].filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().replace(/\s+/g, ' ').toLowerCase())
  const duplicateCodes = new Set(['resourcealreadyexists', 'keyalreadyexists', 'already_exists'])
  const duplicateMessages = new Set([
    'asset already exists',
    'resource already exists',
    'the specified resource already exists',
    'key already exists',
    'the specified key already exists',
  ])
  return values.some((value) => duplicateCodes.has(value) || duplicateMessages.has(value))
}

@Injectable()
export class InspectionPhotoStorageService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async upload(input: InspectionPhotoCommand, bytes: Buffer): Promise<void> {
    const command = inspectionPhotoCommandSchema.parse(input)
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_BYTES) {
      throw new UnprocessableEntityException('Inspection photo bytes are invalid')
    }
    if (command.sizeBytes !== bytes.length) {
      throw new UnprocessableEntityException('Inspection photo size does not match')
    }

    const path = canonicalPhotoPath(command)
    if (imageType(bytes.subarray(0, 12)) !== command.mimeType) {
      throw new UnprocessableEntityException('Inspection photo MIME does not match')
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== path.leafHash) {
      throw new UnprocessableEntityException('Inspection photo bytes do not match the storage path')
    }

    const configuration = this.uploadStorageConfiguration()
    const url = `${configuration.origin}/storage/v1/object/documents/${path.parts.map(encodeURIComponent).join('/')}`
    const requestBody = Buffer.from(bytes)
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        abort.abort()
        reject(new ServiceUnavailableException('Inspection photo upload timed out'))
      }, READ_TIMEOUT_MS)
    })
    void deadline.catch(() => undefined)

    try {
      const request: RequestInit & { cache: 'no-store' } = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.serviceRoleKey}`,
          apikey: configuration.serviceRoleKey,
          'content-length': String(requestBody.length),
          'content-type': command.mimeType,
          'x-upsert': 'false',
        },
        body: requestBody,
        redirect: 'error',
        cache: 'no-store',
        signal: abort.signal,
      }
      const response = await Promise.race([fetch(url, request), deadline])
      const body = await this.readProviderBody(response, deadline, PROVIDER_ERROR_MAX_BYTES)
      if (timedOut) throw new ServiceUnavailableException('Inspection photo upload timed out')
      if (response.status === 200 || response.status === 201 || isKnownObjectAlreadyExists(response.status, body)) return
      throw new ServiceUnavailableException('Inspection photo upload was rejected')
    } catch (error) {
      if (error instanceof UnprocessableEntityException || error instanceof ServiceUnavailableException) throw error
      if (timedOut || abort.signal.aborted) {
        throw new ServiceUnavailableException('Inspection photo upload timed out')
      }
      // Provider errors may contain credentials, signed URLs, or private object paths.
      throw new ServiceUnavailableException('Inspection photo upload is unconfirmed')
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      abort.abort()
    }
  }

  async verify(input: InspectionPhotoCommand): Promise<VerifiedInspectionPhoto> {
    const command = inspectionPhotoCommandSchema.parse(input)
    const parts = command.storagePath.split('/')
    const leaf = parts.at(-1) ?? ''
    const match = /^([a-fA-F0-9]{64})-([a-zA-Z0-9._-]{1,160})$/.exec(leaf)
    // New objects follow the uploader's canonical key. Never normalize a stored path.
    if (!match || match[2] !== command.fileName || parts.length !== 5 ||
      !/^[a-fA-F0-9-]{36}$/.test(parts[0] ?? '') || parts[1] !== 'opportunities' ||
      parts[2]?.toLowerCase() !== command.opportunityId.toLowerCase() || parts[3] !== 'inspection' ||
      parts.some((part) => part.includes('..'))) {
      throw new UnprocessableEntityException('Inspection photo requires a canonical content-addressed path')
    }
    const base = this.config.get<string>('SUPABASE_URL')
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    let origin: URL
    try {
      origin = new URL(base ?? '')
      if (!key || origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Storage configuration')
    } catch {
      throw new ServiceUnavailableException('Stored inspection photo verification is unavailable')
    }
    const url = `${origin.origin}/storage/v1/object/authenticated/documents/${parts.map(encodeURIComponent).join('/')}`
    const abort = new AbortController()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        abort.abort()
        reject(new ServiceUnavailableException('Stored inspection photo verification timed out'))
      }, READ_TIMEOUT_MS)
    })
    try {
      // Node's bundled RequestInit omits cache, although native fetch accepts it.
      const request: RequestInit & { cache: 'no-store' } = {
        headers: { Authorization: `Bearer ${key}`, apikey: key! },
        redirect: 'error', cache: 'no-store', signal: abort.signal,
      }
      const response = await Promise.race([fetch(url, request), deadline])
      if (!response.body) throw new ServiceUnavailableException('Stored inspection photo could not be read')
      reader = response.body.getReader()
      // No Range was requested: a partial representation cannot prove the stored object.
      if (response.status !== 200 || response.headers.has('content-range')) {
        throw new ServiceUnavailableException('Stored inspection photo could not be read in full')
      }
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (mime !== command.mimeType) throw new UnprocessableEntityException('Stored inspection photo MIME does not match')
      const hash = createHash('sha256')
      let count = 0
      let prefix = Buffer.alloc(0)
      for (;;) {
        const chunk = await Promise.race([reader.read(), deadline])
        if (chunk.done) break
        count += chunk.value.byteLength
        if (count > MAX_BYTES || count > command.sizeBytes) throw new UnprocessableEntityException('Stored inspection photo size does not match')
        hash.update(chunk.value)
        if (prefix.length < 12) prefix = Buffer.concat([prefix, chunk.value.subarray(0, 12 - prefix.length)])
      }
      const sha256 = hash.digest('hex')
      if (timedOut) throw new ServiceUnavailableException('Stored inspection photo verification timed out')
      if (count !== command.sizeBytes || imageType(prefix) !== command.mimeType || sha256 !== match[1]?.toLowerCase()) {
        throw new UnprocessableEntityException('Stored inspection photo bytes do not match')
      }
      return { sha256, sizeBytes: count, mimeType: command.mimeType }
    } catch (error) {
      if (error instanceof UnprocessableEntityException || error instanceof ServiceUnavailableException) throw error
      // Provider errors may include signed URLs or credentials; never expose their text.
      throw new ServiceUnavailableException('Stored inspection photo verification is unconfirmed')
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      abort.abort()
      if (reader) {
        // Cancellation must not extend the deadline if a provider stream fails to settle.
        void reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    }
  }

  private uploadStorageConfiguration(): UploadStorageConfiguration {
    try {
      const base = this.config.get<string>('SUPABASE_URL')
      const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
      if (
        typeof base !== 'string' ||
        typeof serviceRoleKey !== 'string' ||
        serviceRoleKey.trim() === '' ||
        /[\r\n]/.test(serviceRoleKey)
      ) {
        throw new Error('Invalid Storage configuration')
      }
      const origin = new URL(base)
      if (
        origin.protocol !== 'https:' ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash ||
        origin.hostname === ''
      ) {
        throw new Error('Invalid Storage configuration')
      }
      return { origin: origin.origin, serviceRoleKey }
    } catch {
      throw new ServiceUnavailableException('Inspection photo upload is unavailable')
    }
  }

  private async readProviderBody(
    response: Response,
    deadline: Promise<never>,
    maximumBytes: number,
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
        if (!chunk.value || !Number.isSafeInteger(chunk.value.byteLength) || chunk.value.byteLength < 0) {
          throw new Error('Invalid provider response body')
        }
        totalBytes += chunk.value.byteLength
        if (totalBytes > maximumBytes) throw new Error('Provider response body exceeded the limit')
        if (chunk.value.byteLength > 0) chunks.push(Buffer.from(chunk.value))
      }
      return Buffer.concat(chunks, totalBytes)
    } finally {
      if (!completed) {
        try {
          void reader.cancel().catch(() => undefined)
        } catch {
          // A provider may already have closed or locked the response body.
        }
      }
      try {
        reader.releaseLock()
      } catch {
        // Cleanup must not replace the bounded provider result.
      }
    }
  }
}
