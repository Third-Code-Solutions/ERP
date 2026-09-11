import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { resolveDatabaseConnectionConfig } from './connection'
import * as schema from './schema'

// Lazy database client. We avoid throwing at module-load time so that
// `next build` page-data collection doesn't fail when DATABASE_URL is unbound
// (Vercel sets envs at runtime, not at all build phases).
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

let _db: DrizzleDb | null = null

// Next development reloads module state without ending the driver connections.
// Cache the driver, not Drizzle: schema metadata must refresh after a code edit.
// Keys include the complete connection configuration so a changed target can
// never accidentally reuse another database's pool. This cache is server-only.
const runtime = globalThis as typeof globalThis & {
  __thirdCodeErpQueryClients?: Map<string, ReturnType<typeof postgres>>
}

function init(): DrizzleDb {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const connection = resolveDatabaseConnectionConfig(connectionString)
  let queryClient: ReturnType<typeof postgres>
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const pools = runtime.__thirdCodeErpQueryClients ??= new Map()
    const key = JSON.stringify(connection)
    const cached = pools.get(key)
    queryClient = cached ?? postgres(connection.connectionString, connection.options)
    if (!cached) pools.set(key, queryClient)
  } else {
    queryClient = postgres(connection.connectionString, connection.options)
  }
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
