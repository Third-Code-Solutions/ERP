export type DatabaseConnectionOptions = {
  prepare?: boolean
  max?: number
  idle_timeout?: number
  connect_timeout?: number
}

type RuntimeEnvironment = Readonly<{ VERCEL?: string }>

export type DatabaseConnectionConfig = {
  connectionString: string
  options: DatabaseConnectionOptions
}

const SUPABASE_POOLER_HOST = /\.pooler\.supabase\.com/i
const PGBOUNCER_QUERY_FLAG = /[?&]pgbouncer=true(?:&|$)/i

/**
 * Select safe client settings for the deployment runtime without changing the
 * migration connection contract. Vercel functions are transient, so Supavisor
 * transaction mode shares backend connections instead of reserving a session
 * per function instance.
 */
export function resolveDatabaseConnectionConfig(
  connectionString: string,
  environment: RuntimeEnvironment = process.env,
): DatabaseConnectionConfig {
  const usesSupabasePooler = SUPABASE_POOLER_HOST.test(connectionString)
  const isVercelRuntime = environment.VERCEL === '1'
  let runtimeConnectionString = connectionString

  if (isVercelRuntime && usesSupabasePooler) {
    const connectionUrl = new URL(connectionString)
    if (!connectionUrl.port || connectionUrl.port === '5432') {
      connectionUrl.port = '6543'
      runtimeConnectionString = connectionUrl.toString()
    }
  }

  const usesPooledConnection =
    PGBOUNCER_QUERY_FLAG.test(runtimeConnectionString) || usesSupabasePooler

  return {
    connectionString: runtimeConnectionString,
    options: {
      ...(usesPooledConnection ? { prepare: false } : {}),
      ...(isVercelRuntime
        ? {
            // postgres.js defaults to ten connections per runtime. One is
            // enough for an ephemeral runtime and protects the database from
            // serverless connection fan-out.
            max: 1,
            idle_timeout: 20,
            connect_timeout: 10,
          }
        : {}),
    },
  }
}
