import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { resolveDatabaseConnectionConfig } from './connection'
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

  const connection = resolveDatabaseConnectionConfig(connectionString)
  const queryClient = postgres(connection.connectionString, connection.options)
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
