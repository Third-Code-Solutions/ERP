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

// Third Code ERP role taxonomy per REFACTOR.md §2.
// Legacy values (owner/estimator/pm) retained for back-compat — they map
// onto the current Third Code ERP roles via ROLE_RANK below.
export type AppRole =
  // Legacy
  | 'owner'
  | 'estimator'
  | 'pm'
  // Third Code ERP
  | 'admin'
  | 'sales'
  | 'commercial'
  | 'design'
  | 'sd_pm_pe'
  | 'finance'
  | 'procurement'
  | 'safety'
  | 'cx'
  | 'viewer'

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

// Privilege ladder. Higher = more authority. Legacy roles map onto their
// Third Code ERP equivalents so old data keeps working unchanged.
const ROLE_RANK: Record<AppRole, number> = {
  // Viewer — read-only
  viewer: 0,
  // Operator roles — equal authority within their domain
  sales: 1,
  commercial: 1,
  design: 1,
  sd_pm_pe: 1,
  finance: 1,
  procurement: 1,
  safety: 1,
  cx: 1,
  // Legacy operators
  estimator: 1,
  pm: 1,
  // Admin — workspace-wide write
  admin: 2,
  // Legacy "owner" was the highest role; keep it above admin.
  owner: 3,
}

/** True when `role` has at least the privileges of `minRole`. */
export function hasRole(role: AppRole, minRole: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/**
 * The set of Third Code ERP roles permitted to perform the given capability.
 * Mirrors the permission matrix in REFACTOR.md §2. Use in server actions
 * and route guards. Returns true if the role is in the allow-list.
 */
export type ErpCapability =
  | 'project.create'
  | 'project.update'
  | 'account.create'
  | 'opportunity.read'
  | 'account.kyc_review'
  | 'opportunity.create'
  | 'opportunity.advance_stage'
  | 'pprf.submit'
  | 'change_request.create'
  | 'site_inspection.submit'
  | 'design.upload'
  | 'document.manage'
  | 'bom.generate'
  | 'bom.edit'
  | 'bom.approve_internal'
  | 'rfq.dispatch'
  | 'kyc.create_ar_code'
  | 'precon.manage_checklist'
  | 'po.create'
  | 'po.approve'
  | 'po.issue'
  | 'po.receive'
  | 'sd.daily_tasks'
  | 'punchlist.manage'
  | 'warranty.manage'
  | 'admin.rate_card'
  | 'admin.users'
  | 'admin.system_config'
  // Phase 3 — Cost Tracking (F3.2)
  | 'cost.record'
  | 'finance.manage'
  | 'finance.post'
  | 'finance.issue_invoice'
  | 'finance.post_supplier_bill'
  | 'finance.manage_cash'
  | 'asset.read'
  | 'asset.maintenance.manage'
  | 'inventory.read'
  | 'inventory.manage'
  | 'inventory.post_receipt'
  | 'inventory.post_movement'
  | 'budget.read'
  | 'budget.manage'
  | 'budget.approve_commercial'
  | 'budget.approve_finance'
  | 'notification.read'

const CAPABILITY_ROLES: Record<ErpCapability, AppRole[]> = {
  'project.create': ['admin', 'owner', 'sales', 'commercial', 'sd_pm_pe', 'pm', 'estimator'],
  'project.update': ['admin', 'owner', 'sales', 'commercial', 'sd_pm_pe', 'pm'],
  // CRM
  'account.create': ['admin', 'owner', 'sales'],
  'opportunity.read': [
    'admin',
    'owner',
    'estimator',
    'pm',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'finance',
    'procurement',
    'safety',
    'cx',
    'viewer',
  ],
  'account.kyc_review': ['admin', 'owner', 'finance'],
  'opportunity.create': ['admin', 'owner', 'sales'],
  'opportunity.advance_stage': ['admin', 'owner', 'sales'],
  // Proposal
  'pprf.submit': ['admin', 'owner', 'sales'],
  'change_request.create': ['admin', 'owner', 'sales'],
  'site_inspection.submit': ['admin', 'owner', 'commercial'],
  'design.upload': ['admin', 'owner', 'design'],
  'document.manage': [
    'admin',
    'owner',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'pm',
    'finance',
    'procurement',
    'safety',
    'cx',
    'estimator',
  ],
  // BOM
  'bom.generate': ['admin', 'owner', 'commercial', 'estimator'],
  'bom.edit': ['admin', 'owner', 'commercial', 'estimator'],
  'bom.approve_internal': ['admin', 'owner', 'commercial'],
  'rfq.dispatch': ['admin', 'owner', 'procurement'],
  // Finance
  'kyc.create_ar_code': ['admin', 'owner', 'finance'],
  // Pre-Con
  'precon.manage_checklist': ['admin', 'owner', 'commercial', 'sd_pm_pe', 'pm'],
  'po.create': ['admin', 'owner', 'commercial', 'sd_pm_pe', 'pm', 'procurement'],
  'po.approve': ['admin', 'owner', 'commercial'],
  'po.issue': ['admin', 'owner', 'procurement'],
  'po.receive': ['admin', 'owner', 'procurement', 'finance'],
  // Construction
  'sd.daily_tasks': ['admin', 'owner', 'sd_pm_pe', 'pm', 'safety'],
  'punchlist.manage': ['admin', 'owner', 'sd_pm_pe', 'pm', 'cx'],
  'warranty.manage': ['admin', 'owner', 'cx'],
  // Admin
  'admin.rate_card': ['admin', 'owner', 'commercial'],
  'admin.users': ['admin', 'owner'],
  'admin.system_config': ['admin', 'owner'],
  // Cost Tracking — site PMs, commercial and finance record actual spend.
  'cost.record': ['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'finance'],
  'finance.manage': ['admin', 'owner', 'finance'],
  'finance.post': ['admin', 'owner', 'finance'],
  'finance.issue_invoice': ['admin', 'owner', 'finance'],
  'finance.post_supplier_bill': ['admin', 'owner', 'finance'],
  'finance.manage_cash': ['admin', 'owner', 'finance'],
  'asset.read': [
    'admin',
    'owner',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'pm',
    'finance',
    'procurement',
    'safety',
    'cx',
    'viewer',
  ],
  'asset.maintenance.manage': [
    'admin',
    'owner',
    'pm',
    'sd_pm_pe',
    'procurement',
  ],
  'inventory.read': [
    'admin',
    'owner',
    'finance',
    'procurement',
    'sd_pm_pe',
    'pm',
    'commercial',
  ],
  'inventory.manage': ['admin', 'owner', 'procurement'],
  'inventory.post_receipt': ['admin', 'owner', 'finance'],
  'inventory.post_movement': ['admin', 'owner', 'finance'],
  'budget.read': [
    'admin',
    'owner',
    'finance',
    'commercial',
    'procurement',
    'sd_pm_pe',
    'pm',
    'estimator',
  ],
  'budget.manage': [
    'admin',
    'owner',
    'finance',
    'commercial',
    'sd_pm_pe',
    'pm',
    'estimator',
  ],
  'budget.approve_commercial': ['admin', 'owner', 'commercial'],
  'budget.approve_finance': ['admin', 'owner', 'finance'],
  'notification.read': [
    'admin',
    'owner',
    'estimator',
    'pm',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'finance',
    'procurement',
    'safety',
    'cx',
    'viewer',
  ],
}

export function can(role: AppRole, capability: ErpCapability): boolean {
  return CAPABILITY_ROLES[capability].includes(role)
}

export function requireCapability(profile: UserProfile, capability: ErpCapability): void {
  if (!can(profile.role, capability)) {
    throw new Error(`Forbidden: role "${profile.role}" lacks capability "${capability}"`)
  }
}

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
