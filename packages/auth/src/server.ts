import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

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
            // Called from a Server Component — mutations are no-ops
          }
        },
      },
    }
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
  if (!user) throw new Error('Unauthorized')
  return user
}

export type AppRole = 'owner' | 'admin' | 'estimator' | 'sales' | 'pm' | 'viewer'

export interface UserProfile {
  user: User
  tenantId: string
  role: AppRole
  email: string
  fullName: string
}

/**
 * Like getUser() but additionally hydrates the caller's tenant_id and role
 * from the public.users table. Returns null when there is no session OR when
 * the auth user has no row in public.users yet (which can happen briefly
 * after signup before the trigger fills the row).
 *
 * Use this in server components and server actions when you need to make
 * authorization decisions — never trust user_metadata for role.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getUser()
  if (!user) return null

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
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
  if (!profile) throw new Error('Unauthorized')
  return profile
}

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  pm: 1,
  estimator: 1,
  sales: 1,
  admin: 2,
  owner: 3,
}

/** True when `role` has at least the privileges of `minRole`. */
export function hasRole(role: AppRole, minRole: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
