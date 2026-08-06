import { spawnSync } from 'node:child_process'

function describeDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    return {
      present: false,
      valid: false,
      blockers: ['DATABASE_URL is missing'],
    }
  }

  try {
    const url = new URL(databaseUrl)
    const port = Number(url.port || 5432)
    const isPostgres = url.protocol === 'postgres:' || url.protocol === 'postgresql:'
    const poolerMode =
      port === 6543
        ? 'transaction'
        : port === 5432 && url.hostname.includes('.pooler.')
          ? 'session'
          : 'direct_or_unknown'

    return {
      present: true,
      valid: isPostgres,
      host: url.hostname,
      port,
      user: url.username || null,
      database: url.pathname.replace(/^\//, '') || null,
      passwordPresent: Boolean(url.password),
      poolerMode,
      recommendedPort: poolerMode === 'transaction' ? 5432 : port,
      blockers: isPostgres
        ? []
        : ['DATABASE_URL must use the postgres:// or postgresql:// protocol'],
    }
  } catch {
    return {
      present: true,
      valid: false,
      blockers: ['DATABASE_URL is not a valid PostgreSQL connection URL'],
    }
  }
}

export function planDatabaseExport({ databaseUrl, availableCommands = {} }) {
  const connection = describeDatabaseUrl(databaseUrl)
  const blockers = [...connection.blockers]

  if (connection.poolerMode === 'transaction') {
    blockers.push(
      'DATABASE_URL uses the transaction pooler on port 6543; use a session pooler or direct connection on port 5432 for a supported dump'
    )
  }

  const hasSupabaseCli = availableCommands.supabase === true
  const hasPgDump = availableCommands.pg_dump === true
  const hasDocker = availableCommands.docker === true
  let method = 'unavailable'

  if (hasSupabaseCli && hasDocker) {
    method = 'supabase-cli'
  } else if (hasPgDump) {
    method = 'pg_dump'
  } else if (hasSupabaseCli && !hasDocker) {
    blockers.push(
      'Supabase CLI is present but Docker is unavailable; supabase db dump cannot run'
    )
  } else {
    blockers.push(
      'No supported database dump tool is available; install Supabase CLI with Docker or PostgreSQL 17 client tools'
    )
  }

  return {
    status: blockers.length === 0 ? 'ready' : 'review_required',
    method,
    connection: {
      present: connection.present,
      valid: connection.valid,
      host: connection.host ?? null,
      port: connection.port ?? null,
      user: connection.user ?? null,
      database: connection.database ?? null,
      passwordPresent: connection.passwordPresent ?? false,
      poolerMode: connection.poolerMode ?? null,
      recommendedPort: connection.recommendedPort ?? null,
    },
    blockers,
    commands: {
      roles:
        'supabase db dump --db-url "<SESSION_POOLER_DATABASE_URL>" -f roles.sql --role-only',
      schema:
        'supabase db dump --db-url "<SESSION_POOLER_DATABASE_URL>" -f schema.sql',
      data:
        'supabase db dump --db-url "<SESSION_POOLER_DATABASE_URL>" -f data.sql --use-copy --data-only',
    },
    safety: [
      'Keep roles.sql, schema.sql, and data.sql outside git and outside public build artifacts',
      'Scrub auth users, secrets, tokens, and personal data before sharing or committing any fixture',
      'Use the export only for an isolated PostgreSQL 17 replay until parity and owner mapping are reviewed',
    ],
  }
}

function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which'
  return spawnSync(lookup, [command], { stdio: 'ignore' }).status === 0
}

export function inspectDatabaseExportPrerequisites({
  databaseUrl = process.env.DATABASE_URL,
} = {}) {
  return planDatabaseExport({
    databaseUrl,
    availableCommands: {
      supabase: commandExists('supabase'),
      pg_dump: commandExists('pg_dump'),
      docker: commandExists('docker'),
    },
  })
}
