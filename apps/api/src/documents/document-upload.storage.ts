import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { BadRequestException, Inject, Injectable, PayloadTooLargeException, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Request } from 'express'

export const MAX_DOCUMENT_UPLOAD_BYTES = 100 * 1024 * 1024
const DEADLINE_MS = 120_000

@Injectable()
export class DocumentUploadStorage {
  private active = 0
  private client: SupabaseClient | undefined
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private credentials(): { url: string; key: string } {
    const url = this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '')
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new ServiceUnavailableException('Document Storage is not configured')
    return { url, key }
  }

  private bucket() {
    const { url, key } = this.credentials()
    this.client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) } })
    return this.client.storage.from('documents')
  }

  async size(path: string): Promise<number | null> {
    try {
      const { data, error } = await this.bucket().info(path)
      if (error && 'statusCode' in error && String(error.statusCode) === '404') return null
      if (error || !data || typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || data.size < 0) throw new ServiceUnavailableException('Unable to verify stored document bytes')
      return data.size
    } catch { throw new ServiceUnavailableException('Unable to verify stored document bytes') }
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.bucket().remove([path])
    if (error || await this.size(path) !== null) throw new ServiceUnavailableException('Document cleanup could not be confirmed')
  }

  // A fulfilled result means a definitive provider response. A rejected promise
  // is uncertain: its reservation must stay charged, even after expiry.
  async put(path: string, file: string, size: number, mime: string): Promise<boolean> {
    const { url, key } = this.credentials()
    const input = createReadStream(file)
    const body = Readable.toWeb(input) as ReadableStream<Uint8Array>
    const options: RequestInit & { duplex: 'half' } = {
      method: 'POST', headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': mime, 'content-length': String(size), 'x-upsert': 'false' },
      body, duplex: 'half', signal: AbortSignal.timeout(DEADLINE_MS),
    }
    try {
      const response = await fetch(`${url}/storage/v1/object/documents/${path.split('/').map(encodeURIComponent).join('/')}`, options)
      await response.body?.cancel()
      return response.ok
    } finally {
      input.destroy()
      // Abort is an expected stream error; wait for its file descriptor to close
      // before stage() removes the temporary file on Windows.
      await finished(input).catch(() => undefined)
    }
  }

  async stage<T>(request: Request, expected: number, consume: (file: string, hash: string) => Promise<T>): Promise<T> {
    if (this.active >= 2) throw new ServiceUnavailableException('Document upload capacity is busy; retry shortly')
    if (request.headers['content-type'] !== 'application/octet-stream' || request.headers['content-encoding']) throw new BadRequestException('Upload requires unencoded application/octet-stream')
    const length = request.headers['content-length']
    if (!length || !/^\d+$/.test(length) || Number(length) !== expected) throw new BadRequestException('Content-Length must equal reserved document size')
    if (expected <= 0 || expected > MAX_DOCUMENT_UPLOAD_BYTES) throw new PayloadTooLargeException()
    this.credentials()
    this.active += 1
    let directory: string | undefined
    try {
      directory = await mkdtemp(join(tmpdir(), 'erp-document-'))
      const file = join(directory, 'body')
      const hash = createHash('sha256')
      let received = 0
      const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > expected) return callback(new PayloadTooLargeException('Upload exceeds reserved document size'))
        hash.update(chunk)
        callback(null, chunk)
      } })
      try {
        await pipeline(request, counter, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: AbortSignal.timeout(DEADLINE_MS) })
      } catch (error) {
        if (error instanceof PayloadTooLargeException) throw error
        throw new RequestTimeoutException('Document upload was interrupted or timed out; retry the same reservation')
      }
      if (received !== expected) throw new BadRequestException('Upload bytes do not match reserved size')
      return await consume(file, hash.digest('hex'))
    } finally {
      try { if (directory) await rm(directory, { recursive: true, force: true }) }
      finally { this.active -= 1 }
    }
  }
}
