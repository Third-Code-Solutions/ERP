import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH,
  documentUploadContentTypeSchema,
  isDocumentUploadHttpUrl,
} from '@third-code-erp/shared-types'
import { z } from 'zod'

import type { Environment } from '../config/environment'
import { DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGE_SIZE } from './document-upload-reservation-reconciliation.constants'

const DOCUMENTS_BUCKET = 'documents'
export const DOCUMENT_UPLOAD_STORAGE_REQUEST_TIMEOUT_MS = 30_000

async function boundedDocumentUploadFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const requestSignal = input instanceof Request ? input.signal : undefined
  const callerSignal = init?.signal ?? requestSignal
  const timeoutSignal = AbortSignal.timeout(
    DOCUMENT_UPLOAD_STORAGE_REQUEST_TIMEOUT_MS
  )
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal
  return fetch(input, { ...init, signal })
}

export type DocumentUploadSignedCredential = Readonly<{
  signedUrl: string
  token: string
  storagePath: string
}>

export type DocumentUploadObjectInfo = Readonly<{
  sizeBytes: number
  contentType: string
}>

export type DocumentUploadReservationObjectPage = Readonly<{
  objects: readonly Readonly<{ storagePath: string; createdAt: Date }>[]
  hasNext: boolean
  nextCursor?: string
}>

const documentUploadStorageCreatedAtSchema = z
  .string()
  .min(20)
  .max(35)
  .datetime({ offset: true })

function isBoundedToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH
  )
}

function isBoundedHttpUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH
  ) {
    return false
  }
  return isDocumentUploadHttpUrl(value)
}

/** Server-only boundary for reservation-owned objects in the private bucket. */
@Injectable()
export class DocumentUploadReservationStorage {
  private client: SupabaseClient | undefined

  constructor(private readonly config: ConfigService<Environment, true>) {}

  async createSignedUpload(
    storagePath: string
  ): Promise<DocumentUploadSignedCredential> {
    try {
      const { data, error } = await this.bucket().createSignedUploadUrl(
        storagePath,
        { upsert: false }
      )
      if (
        error ||
        !data ||
        data.path !== storagePath ||
        !isBoundedHttpUrl(data.signedUrl) ||
        !isBoundedToken(data.token)
      ) {
        throw new ServiceUnavailableException(
          'Document upload authorization is unavailable'
        )
      }

      return {
        signedUrl: data.signedUrl,
        token: data.token,
        storagePath,
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw new ServiceUnavailableException(
        'Document upload authorization is unavailable'
      )
    }
  }

  async info(storagePath: string): Promise<DocumentUploadObjectInfo> {
    try {
      const { data, error } = await this.bucket().info(storagePath)
      if (error || !data) {
        throw new ServiceUnavailableException(
          'Document upload object metadata is unavailable'
        )
      }

      const size = data.size
      const contentType = documentUploadContentTypeSchema.safeParse(
        data.contentType
      )
      if (
        typeof size !== 'number' ||
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        !contentType.success
      ) {
        throw new BadGatewayException(
          'Document upload object metadata is invalid'
        )
      }

      return { sizeBytes: size, contentType: contentType.data }
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error
      }
      throw new ServiceUnavailableException(
        'Document upload object metadata is unavailable'
      )
    }
  }

  async remove(storagePath: string): Promise<void> {
    try {
      const { error } = await this.bucket().remove([storagePath])
      if (!error) return
    } catch {
      // Provider diagnostics are intentionally redacted at this boundary.
    }
    throw new ServiceUnavailableException(
      'Document upload object removal is unavailable'
    )
  }

  async listReservationObjects(input: {
    tenantId: string
    cursor?: string
    limit: number
  }): Promise<DocumentUploadReservationObjectPage> {
    const prefix = `${input.tenantId}/`
    if (
      input.limit < 1 ||
      input.limit >
        DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGE_SIZE
    ) {
      throw new BadGatewayException(
        'Document upload object listing request is invalid'
      )
    }
    try {
      const { data, error } = await this.bucket().listV2({
        prefix,
        cursor: input.cursor,
        limit: input.limit,
        with_delimiter: false,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (
        error ||
        !data ||
        typeof data.hasNext !== 'boolean' ||
        !Array.isArray(data.objects) ||
        data.objects.length > input.limit ||
        (data.hasNext && !isBoundedToken(data.nextCursor))
      ) {
        throw new ServiceUnavailableException(
          'Document upload object listing is unavailable'
        )
      }

      const objects = data.objects.map((object) => {
        const createdAtValue = documentUploadStorageCreatedAtSchema.safeParse(
          object.created_at
        )
        const createdAt = createdAtValue.success
          ? new Date(createdAtValue.data)
          : null
        if (
          typeof object.key !== 'string' ||
          !object.key.startsWith(prefix) ||
          object.key.length > 2_000 ||
          !createdAt ||
          !Number.isFinite(createdAt.getTime())
        ) {
          throw new BadGatewayException(
            'Document upload object listing is invalid'
          )
        }
        return { storagePath: object.key, createdAt }
      })

      return {
        objects,
        hasNext: data.hasNext,
        ...(data.hasNext ? { nextCursor: data.nextCursor } : {}),
      }
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error
      }
      throw new ServiceUnavailableException(
        'Document upload object listing is unavailable'
      )
    }
  }

  private bucket(): ReturnType<SupabaseClient['storage']['from']> {
    if (!this.client) {
      const serviceRoleKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', {
        infer: true,
      })
      if (!serviceRoleKey) {
        throw new ServiceUnavailableException(
          'Document upload Storage is not configured'
        )
      }

      this.client = createClient(
        this.config.get('SUPABASE_URL', { infer: true }),
        serviceRoleKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: boundedDocumentUploadFetch },
        }
      )
    }
    return this.client.storage.from(DOCUMENTS_BUCKET)
  }
}
