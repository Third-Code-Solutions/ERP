import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Lazy database client. We avoid throwing at module-load time so that
// `next build` page-data collection doesn't fail when DATABASE_URL is unbound
// (Vercel sets envs at runtime, not at all build phases).
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

let _db: DrizzleDb | null = null

function init(): DrizzleDb {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  // pgbouncer/transaction pooling does not support prepared statements.
  // Detect either an explicit ?pgbouncer=true flag or the Supabase pooler hostname.
  const isPooled =
    /[?&]pgbouncer=true(?:&|$)/i.test(connectionString) ||
    /\.pooler\.supabase\.com/i.test(connectionString)

  const queryClient = postgres(connectionString, isPooled ? { prepare: false } : {})
  return drizzle(queryClient, { schema })
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = init()
    }
    return Reflect.get(_db as object, prop, receiver)
  },
})

export type Database = DrizzleDb
