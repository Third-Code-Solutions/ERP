import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

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

export const db = drizzle(queryClient, { schema })

export type Database = typeof db
