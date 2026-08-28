#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateSupabaseContainment } from './lib/supabase-containment.mjs'

const inputPath = process.argv[2] ? resolve(process.argv[2]) : ''

if (!inputPath || !existsSync(inputPath)) {
  console.error('Usage: node scripts/ci/verify-supabase-containment.mjs <non-secret-evidence.json>')
  process.exit(1)
}

try {
  const evidence = JSON.parse(readFileSync(inputPath, 'utf8'))
  const result = validateSupabaseContainment(evidence)
  console.log(
    `PASS local Supabase loopback containment verified (${result.bindingCount} bindings across ${result.containerCount} containers)`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
