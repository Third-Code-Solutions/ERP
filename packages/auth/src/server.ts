import { createServerClient } from '@supabase/ssr'
import { createClient, type User } from '@supabase/supabase-js'
import {
  roleHasCapability,
  type ErpCapability,
  type ErpRole,
} from '@third-code-erp/shared-types/authorization'
import { cookies } from 'next/headers'

export type { ErpCapability }

export type AuthErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            }
          } catch {
            // Called from a Server Component — mutations are no-ops.
          }
        },
      },
    },
  )
}

export async function getUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return user
}

export async function requireUser() {
  const user = await getUser()
  if (!user) throw new AuthError('UNAUTHENTICATED', 'Unauthorized')
  return user
}

// Legacy values remain for backwards compatibility. Their user-interface
// presentation is handled by the navigation layer; policy is canonical here.
export type AppRole = ErpRole

export interface UserProfile {
  user: User
  tenantId: string
  role: AppRole
  email: string
  fullName: string
}

/**
 * Like getUser() but additionally hydrates the caller's tenant_id and role
 * from public.users. Do not trust user metadata for authorization decisions.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  const { data, error } = await supabase
    .from('users')
    .select('tenant_id, role, email, full_name')
    .eq('id', user.id)
    .single()

  if (error || !data) return null

  return {
    user,
    tenantId: data.tenant_id as string,
    role: (data.role as AppRole) ?? 'viewer',
    email: data.email as string,
    fullName: data.full_name as string,
  }
}

export async function requireUserProfile(): Promise<UserProfile> {
  const profile = await getUserProfile()
  if (!profile) throw new AuthError('UNAUTHENTICATED', 'Unauthorized')
  return profile
}

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  sales: 1,
  commercial: 1,
  design: 1,
  sd_pm_pe: 1,
  finance: 1,
  procurement: 1,
  safety: 1,
  cx: 1,
  estimator: 1,
  pm: 1,
  admin: 2,
  owner: 3,
}

/** True when `role` has at least the privileges of `minRole`. */
export function hasRole(role: AppRole, minRole: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

export function can(role: AppRole, capability: ErpCapability): boolean {
  return roleHasCapability(role, capability)
}

export function requireCapability(profile: UserProfile, capability: ErpCapability): void {
  if (!can(profile.role, capability)) {
    throw new AuthError(
      'FORBIDDEN',
      `Forbidden: role "${profile.role}" lacks capability "${capability}"`,
    )
  }
}

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
