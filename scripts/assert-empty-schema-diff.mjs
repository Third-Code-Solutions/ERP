#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const diffPath = resolve(process.argv[2] ?? '')

if (!process.argv[2] || !existsSync(diffPath)) {
  console.error('Usage: node scripts/assert-empty-schema-diff.mjs <schema-diff.sql>')
  process.exit(1)
}

const sql = readFileSync(diffPath, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '')
  .trim()

if (sql.length > 0) {
  console.error('FAIL local database differs from the migration-built shadow schema')
  console.error(sql)
  process.exit(1)
}

console.log('PASS local database and migration-built shadow schema are identical')
