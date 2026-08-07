#!/usr/bin/env node

/**
 * Read-only database export preflight.
 *
 * This never connects to Postgres and never writes provider state. It only
 * checks connection-string shape and local dump-tool availability so a backup
 * cannot accidentally run through a transaction pooler or an unsupported
 * environment.
 *
 * DATABASE_EXPORT_URL may supply a session-pooler/direct URL without changing
 * the application's transaction-pooler DATABASE_URL. PG_DUMP_PATH may point to
 * an approved portable PostgreSQL 17 client outside the repository.
 */
import { inspectDatabaseExportPrerequisites } from './lib/database-export-plan.mjs'

const report = inspectDatabaseExportPrerequisites()
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'ready') process.exitCode = 2
