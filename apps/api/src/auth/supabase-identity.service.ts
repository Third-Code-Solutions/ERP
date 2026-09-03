import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { verifiedAuthenticationTime } from './verified-authentication'

export interface VerifiedIdentity {
  userId: string
  email: string | null
  emailConfirmedAt: string | null
  authenticatedAt?: number
}

@Injectable()
export class SupabaseIdentityService {
  private readonly supabase: SupabaseClient
  private readonly supabaseUrl: string
  private readonly supabaseAnonKey: string

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.supabaseUrl = config.getOrThrow<string>('SUPABASE_URL')
    this.supabaseAnonKey = config.getOrThrow<string>('SUPABASE_ANON_KEY')
    this.supabase = createClient(
      this.supabaseUrl,
      this.supabaseAnonKey,
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
    return {
      userId: user.id,
      email: user.email?.trim().toLowerCase() ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      authenticatedAt: verifiedAuthenticationTime(token, user.id),
    }
  }

  async activateInvitedUser(token: string): Promise<boolean> {
    const authenticatedClient = createClient(
      this.supabaseUrl,
      this.supabaseAnonKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { data, error } = await authenticatedClient.rpc(
      'activate_current_invited_user'
    )
    return !error && data === true
  }
}
