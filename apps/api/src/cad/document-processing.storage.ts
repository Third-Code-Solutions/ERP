import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'

export const DOCUMENT_PROCESSING_SIGNED_URL_TTL_SECONDS = 120

/** Server-only exact-object URL issuer for the private worker bridge. */
@Injectable()
export class DocumentProcessingStorageService {
  constructor(private readonly config: ConfigService) {}

  async createSignedUrl(
    storagePath: string,
    expiresIn = DOCUMENT_PROCESSING_SIGNED_URL_TTL_SECONDS
  ): Promise<string> {
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new Error('storage_credentials_unavailable')
    }

    const supabase = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      serviceRoleKey,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, expiresIn)
    if (error || !data?.signedUrl) {
      throw new Error('storage_signed_url_unavailable')
    }
    return data.signedUrl
  }
}
