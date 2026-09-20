import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const lifecycleAcknowledgementSchema = z.object({
  id: z.string().uuid(),
  banned_until: z.string().datetime({ offset: true }).nullish(),
})

@Injectable()
export class PlatformIdentityAdminService {
  private readonly client: SupabaseClient | null
  private readonly webBaseUrl: string | null

  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL')
    const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    this.webBaseUrl = config.get<string>('ERP_WEB_BASE_URL') ?? null
    this.client =
      url && serviceRoleKey
        ? createClient(url, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            global: {
              fetch: (input, init) => fetch(input, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)])
                  : AbortSignal.timeout(8_000),
              }),
            },
          })
        : null
  }

  async invite(email: string): Promise<string> {
    const client = this.requireClient()
    if (!this.webBaseUrl) {
      throw new ServiceUnavailableException(
        'User invitation is unavailable because the Web base URL is not configured'
      )
    }
    const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${this.webBaseUrl}/auth/accept-invite`,
    })
    if (error || !data.user) {
      throw new ServiceUnavailableException(
        'The authentication provider could not send the invitation'
      )
    }
    return data.user.id
  }

  async resendInvitation(email: string): Promise<void> {
    // Supabase resend() supports signup/email/phone changes, not invitations.
    // The admin invite endpoint accepts an existing unconfirmed identity.
    await this.invite(email)
  }

  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    const client = this.requireClient()
    let response: Awaited<ReturnType<typeof client.auth.admin.updateUserById>>
    try {
      response = await client.auth.admin.updateUserById(
        userId,
        { ban_duration: suspended ? '876000h' : 'none' }
      )
    } catch {
      throw new ServiceUnavailableException(
        'The authentication provider lifecycle outcome could not be confirmed'
      )
    }
    const { data, error } = response
    if (error) {
      throw new ServiceUnavailableException(
        'The authentication provider could not update the user lifecycle'
      )
    }
    // Auth clears banned_until for ban_duration='none'. A 2xx response alone
    // does not bind the affected identity or acknowledge the requested state.
    // https://github.com/supabase/auth/blob/master/internal/models/user.go
    const acknowledgement = lifecycleAcknowledgementSchema.safeParse(data.user)
    if (!acknowledgement.success
      || acknowledgement.data.id.toLowerCase() !== userId.toLowerCase()
      || (suspended
        ? !acknowledgement.data.banned_until || Date.parse(acknowledgement.data.banned_until) <= Date.now()
        : acknowledgement.data.banned_until != null)) {
      throw new ServiceUnavailableException(
        'The authentication provider lifecycle outcome could not be confirmed'
      )
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    const client = this.requireClient()
    if (!this.webBaseUrl) {
      throw new ServiceUnavailableException(
        'Password reset is unavailable because the Web base URL is not configured'
      )
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${this.webBaseUrl}/api/auth/callback?next=${encodeURIComponent('/auth/update-password')}`,
    })
    if (error) {
      throw new ServiceUnavailableException(
        'The authentication provider could not send the password reset'
      )
    }
  }

  configured(): boolean {
    return this.client !== null
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Platform identity administration is not configured'
      )
    }
    return this.client
  }
}
