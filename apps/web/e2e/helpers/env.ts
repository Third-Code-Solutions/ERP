import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SUPABASE_E2E_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

export type E2EEnv = Record<string, string>

export function readE2EEnv(): E2EEnv {
  const values: E2EEnv = {}
  const envPath = resolve(__dirname, '..', '..', '.env.local')

  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (match) values[match[1]!] = match[2]!.trim().replace(/^"(.*)"$/, '$1')
    }
  }

  for (const key of SUPABASE_E2E_KEYS) {
    const value = process.env[key]?.trim()
    if (value) values[key] = value
  }

  return values
}
