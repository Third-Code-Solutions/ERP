export {
  createSupabaseServerClient,
  getUser,
  requireUser,
  getUserProfile,
  requireUserProfile,
  hasRole,
  can,
  requireCapability,
  createSupabaseAdminClient,
  AuthError,
  type AppRole,
  type AuthErrorCode,
  type ErpCapability,
  type UserProfile,
} from './server'
export { createSupabaseBrowserClient } from './client'
