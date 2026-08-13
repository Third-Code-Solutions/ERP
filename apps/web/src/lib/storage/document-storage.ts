import 'server-only'

import { createSupabaseAdminClient } from '@third-code-erp/auth/server'

export interface StorageDownloadError {
  message: string
}

export interface StorageDownloadResult {
  data: Blob | null
  error: StorageDownloadError | null
}

/**
 * Server-authorized object download contract.
 *
 * Callers depend on this narrow boundary, not on a specific provider SDK.
 * The route still enforces tenant/project scope before this contract is used.
 */
export interface DocumentStorage {
  download(storagePath: string): Promise<StorageDownloadResult>
}

interface SupabaseStorageClientLike {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{
        data: Blob | null
        error: { message: string } | null
      }>
    }
  }
}

export class SupabaseDocumentStorage implements DocumentStorage {
  constructor(
    private readonly client: SupabaseStorageClientLike,
    private readonly bucket = 'documents'
  ) {}

  async download(storagePath: string): Promise<StorageDownloadResult> {
    const result = await this.client.storage
      .from(this.bucket)
      .download(storagePath)

    return {
      data: result.data,
      error: result.error ? { message: result.error.message } : null,
    }
  }
}

type StorageFetch = typeof fetch

export interface HttpDocumentStorageOptions {
  /** Provider base URL, without `/storage/v1/object`. */
  baseUrl: string
  bucket?: string
  bearerToken?: string
  fetchImpl?: StorageFetch
}

/**
 * Minimal HTTP object-storage adapter for providers exposing a Supabase-like
 * object GET endpoint. Useful for a local compatible service and future
 * provider swaps; production defaults to SupabaseDocumentStorage.
 */
export class HttpDocumentStorage implements DocumentStorage {
  private readonly baseUrl: string
  private readonly bucket: string
  private readonly bearerToken: string | undefined
  private readonly fetchImpl: StorageFetch

  constructor(options: HttpDocumentStorageOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.bucket = options.bucket ?? 'documents'
    this.bearerToken = options.bearerToken
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async download(storagePath: string): Promise<StorageDownloadResult> {
    const encodedPath = encodeObjectPath(storagePath)
    if (!encodedPath) {
      return {
        data: null,
        error: { message: 'Storage path must be a relative object key' },
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/octet-stream',
    }
    if (this.bearerToken) {
      headers.Authorization = `Bearer ${this.bearerToken}`
    }

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodedPath}`,
        { headers }
      )
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const detail = body.trim().slice(0, 200)
        return {
          data: null,
          error: {
            message:
              `Storage download failed (${response.status}` +
              `${response.statusText ? ` ${response.statusText}` : ''})` +
              `${detail ? `: ${detail}` : ''}`,
          },
        }
      }

      return { data: await response.blob(), error: null }
    } catch (error) {
      return {
        data: null,
        error: {
          message: `Storage download request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      }
    }
  }
}

export function createDocumentStorage(): DocumentStorage {
  return new SupabaseDocumentStorage(createSupabaseAdminClient())
}

function encodeObjectPath(storagePath: string): string | null {
  const segments = storagePath.split('/')
  if (
    !storagePath ||
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..'
    )
  ) {
    return null
  }

  return segments.map((segment) => encodeURIComponent(segment)).join('/')
}
