import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DOCUMENTS_BUCKET = 'documents'

@Injectable()
export class PublicSigningStorageService {
  private client: SupabaseClient | null = null

  constructor(private readonly config: ConfigService) {}

  async upload(path: string, bytes: Buffer): Promise<void> {
    const { error } = await this.clientOrThrow().storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, bytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (error) throw new Error('storage_upload_failed')
  }

  async remove(path: string): Promise<void> {
    try {
      await this.clientOrThrow().storage.from(DOCUMENTS_BUCKET).remove([path])
    } catch {
      // Cleanup is best effort after a failed transaction.
    }
  }

  private clientOrThrow(): SupabaseClient {
    if (this.client) return this.client
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) throw new Error('storage_credentials_unavailable')
    this.client = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    return this.client
  }
}
