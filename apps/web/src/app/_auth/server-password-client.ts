import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Isolated, non-persistent password-grant client. It never adopts or mutates
 * the request cookie session, and its resulting session can update only the
 * identity whose current password was just verified.
 */
export function createPasswordVerificationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Supabase Auth is not configured')

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
