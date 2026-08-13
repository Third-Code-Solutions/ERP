import type { BrowserContext } from '@playwright/test'
import { readE2EEnv, type E2EEnv } from './env'

export type MagicLinkRole =
  | 'admin'
  | 'commercial'
  | 'cx'
  | 'design'
  | 'finance'
  | 'owner'
  | 'procurement'
  | 'safety'
  | 'sales'
  | 'sd_pm_pe'
  | 'viewer'

const ROLE_TEST_EMAILS: Record<MagicLinkRole, string> = {
  admin: 'admin@abi.demo.ph',
  commercial: 'commercial@abi.demo.ph',
  cx: 'cx@abi.demo.ph',
  design: 'design@abi.demo.ph',
  finance: 'finance@abi.demo.ph',
  owner: 'owner@abi.demo.ph',
  procurement: 'procurement@abi.demo.ph',
  safety: 'safety@abi.demo.ph',
  sales: 'sales@abi.demo.ph',
  sd_pm_pe: 'sd@abi.demo.ph',
  viewer: 'viewer@abi.demo.ph',
}

type UserProfile = {
  email: string
  tenant_id: string
}

type AuthenticatedRole = {
  role: MagicLinkRole
  tenantId: string
  accessToken: string
  supabaseUrl: string
  anonKey: string
  cleanup: () => Promise<void>
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') return false
  // The REST payload is untrusted JSON; this post-guard view is limited to
  // checking the two primitive fields required by the role harness.
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.tenant_id === 'string'
  )
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} response was not an object`)
  }
  // The caller validates each field immediately after this boundary check.
  return value as Record<string, unknown>
}

export async function authenticateRole(
  context: BrowserContext,
  baseUrl: string,
  role: MagicLinkRole
): Promise<AuthenticatedRole> {
  const env: E2EEnv = readE2EEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error('Supabase E2E environment is incomplete')
  }

  const serviceHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  }
  const roleEmail = ROLE_TEST_EMAILS[role]
  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/users?select=email,tenant_id&role=eq.${encodeURIComponent(role)}&email=eq.${encodeURIComponent(roleEmail)}&limit=2`,
    { headers: serviceHeaders }
  )
  if (!profileResponse.ok) {
    throw new Error(`Role profile lookup failed (${profileResponse.status})`)
  }
  const profilePayload: unknown = await profileResponse.json()
  if (!Array.isArray(profilePayload)) {
    throw new Error('Role profile lookup did not return an array')
  }
  const profiles = profilePayload.filter(isUserProfile)
  if (profiles.length !== 1 || profiles[0]?.email !== roleEmail) {
    throw new Error(
      `Expected deterministic ${role} profile ${roleEmail}, found ${profiles.length}`
    )
  }
  const profile = profiles[0]!

  const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      ...serviceHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo: `${baseUrl}/dashboard` },
    }),
  })
  if (!linkResponse.ok) {
    throw new Error(`Magic-link generation failed (${linkResponse.status})`)
  }
  const linkPayload = assertObject(await linkResponse.json(), 'Magic-link')
  const actionLink = linkPayload.action_link
  if (typeof actionLink !== 'string' || actionLink.length === 0) {
    throw new Error('Magic-link response did not contain an action link')
  }

  const verifyResponse = await fetch(actionLink, { redirect: 'manual' })
  const redirectLocation = verifyResponse.headers.get('location')
  if (!redirectLocation) throw new Error('Magic-link verification did not redirect')
  const authParams = new URLSearchParams(
    new URL(redirectLocation).hash.replace(/^#/, '')
  )
  const accessToken = authParams.get('access_token')
  const refreshToken = authParams.get('refresh_token')
  const expiresAt = Number(authParams.get('expires_at'))
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) {
    throw new Error('Magic-link redirect did not contain a complete session')
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!userResponse.ok) {
    throw new Error(`Authenticated user lookup failed (${userResponse.status})`)
  }
  const user = assertObject(await userResponse.json(), 'Authenticated user')
  const projectRef = new URL(supabaseUrl).host.split('.')[0]!
  const sessionValue = `base64-${Buffer.from(
    JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(authParams.get('expires_in')),
      expires_at: expiresAt,
      token_type: authParams.get('token_type'),
      user,
    })
  ).toString('base64')}`
  const baseOrigin = new URL(baseUrl)
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: sessionValue,
      domain: baseOrigin.hostname,
      path: '/',
      httpOnly: false,
      secure: baseOrigin.protocol === 'https:',
      sameSite: 'Lax',
      expires: expiresAt,
    },
  ])

  return {
    role,
    tenantId: profile.tenant_id,
    accessToken,
    supabaseUrl,
    anonKey,
    cleanup: async () => {
      const logoutResponse = await fetch(
        // Revoke only this test session. A global logout would invalidate a
        // concurrently running role or branding test using the same seed.
        `${supabaseUrl}/auth/v1/logout?scope=local`,
        {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      // A one-time-link session may already be invalidated by the hosted
      // auth flow. Treat that idempotent cleanup outcome as success; callers
      // still clear the browser cookie context after this callback.
      if (!logoutResponse.ok && ![401, 403].includes(logoutResponse.status)) {
        throw new Error(`Magic-link logout failed (${logoutResponse.status})`)
      }
    },
  }
}
