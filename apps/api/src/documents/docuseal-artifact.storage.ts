import { createHash } from 'node:crypto'

import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Environment } from '../config/environment'

const DOCUMENTS_BUCKET = 'documents'

export function docuSealArtifactObjectKey(input: {
  tenantId: string
  projectId: string
  submissionId: string
}): string {
  const submissionDigest = createHash('sha256')
    .update(input.submissionId, 'utf8')
    .digest('hex')
  return `${input.tenantId}/${input.projectId}/esign/docuseal/${submissionDigest}.pdf`
}

@Injectable()
export class DocuSealArtifactStorage {
  private client: SupabaseClient | undefined

  constructor(private readonly config: ConfigService<Environment, true>) {}

  async upload(objectKey: string, bytes: Buffer): Promise<void> {
    const { error } = await this.storageClient()
      .storage.from(DOCUMENTS_BUCKET)
      .upload(objectKey, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (error) {
      throw new ServiceUnavailableException(
        'Unable to persist the completed DocuSeal PDF'
      )
    }
  }

  private storageClient(): SupabaseClient {
    if (this.client) return this.client

    const serviceRoleKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', {
      infer: true,
    })
    if (!serviceRoleKey) {
      throw new ServiceUnavailableException(
        'DocuSeal artifact storage is not configured'
      )
    }

    this.client = createClient(
      this.config.get('SUPABASE_URL', { infer: true }),
      serviceRoleKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
    return this.client
  }
}
