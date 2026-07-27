import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

export interface VerifiedIdentity {
  userId: string
}

@Injectable()
export class SupabaseIdentityService {
  private readonly supabase: SupabaseClient

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.supabase = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_ANON_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  async verifyAccessToken(
    token: string
  ): Promise<VerifiedIdentity | null> {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(token)

    if (error || !user) return null
    return { userId: user.id }
  }
}
