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

import type { Environment } from '../config/environment'

const DOCUMENTS_BUCKET = 'documents'

export type DocumentUploadSignedCredential = Readonly<{
  signedUrl: string
  token: string
  storagePath: string
}>

export type DocumentUploadObjectInfo = Readonly<{
  sizeBytes: number
  contentType: string
}>

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
        }
      )
    }
    return this.client.storage.from(DOCUMENTS_BUCKET)
  }
}
