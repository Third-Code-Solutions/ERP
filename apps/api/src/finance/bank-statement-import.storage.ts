import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'

export const BANK_STATEMENT_IMPORT_BUCKET = 'documents'
export const BANK_STATEMENT_IMPORT_MAX_BYTES = 2_000_000
const SIGNED_URL_TTL_SECONDS = 60
const DOWNLOAD_TIMEOUT_MS = 10_000

export type BankStatementImportStorageErrorCode =
  | 'credentials_unavailable'
  | 'signed_url_unavailable'
  | 'object_unavailable'
  | 'object_too_large'

export class BankStatementImportStorageError extends Error {
  constructor(readonly code: BankStatementImportStorageErrorCode) {
    super(`bank_statement_storage_${code}`)
    this.name = 'BankStatementImportStorageError'
  }
}

/**
 * Server-only reader for the private documents bucket. It never exposes a
 * service-role key and consumes at most the import byte cap while streaming.
 */
@Injectable()
export class BankStatementImportStorageService {
  constructor(private readonly config: ConfigService) {}

  async readCsv(storagePath: string): Promise<Uint8Array> {
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new BankStatementImportStorageError('credentials_unavailable')
    }

    const supabase = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data, error } = await supabase.storage
      .from(BANK_STATEMENT_IMPORT_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      throw new BankStatementImportStorageError('signed_url_unavailable')
    }

    let response: Response
    try {
      response = await fetch(data.signedUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      })
    } catch {
      throw new BankStatementImportStorageError('object_unavailable')
    }
    if (!response.ok) {
      throw new BankStatementImportStorageError('object_unavailable')
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > BANK_STATEMENT_IMPORT_MAX_BYTES) {
      await response.body?.cancel()
      throw new BankStatementImportStorageError('object_too_large')
    }
    if (!response.body) {
      throw new BankStatementImportStorageError('object_unavailable')
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > BANK_STATEMENT_IMPORT_MAX_BYTES) {
          await reader.cancel()
          throw new BankStatementImportStorageError('object_too_large')
        }
        chunks.push(value)
      }
    } catch (error) {
      if (error instanceof BankStatementImportStorageError) throw error
      throw new BankStatementImportStorageError('object_unavailable')
    } finally {
      reader.releaseLock()
    }

    const result = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result
  }
}
