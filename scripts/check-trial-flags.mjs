#!/usr/bin/env node
/**
 * Checks that a trial tenant is switched on for the Core writes it needs, in
 * the web (Vercel) and API (Railway) environments, before the tenant's first
 * day. Reads only the files you hand it, never the live platforms.
 *
 * Usage:
 *   vercel env pull <web-env-file> --environment production
 *   railway variables --kv > <api-env-file>          (or `--json`)
 *   node scripts/check-trial-flags.mjs --tenant <uuid> [<uuid> ...] \
 *     --web-env <web-env-file> --api-env <api-env-file> [--include-optional]
 *
 * Prints OK / MISSING per tenant per feature from docs/erp/trial-flags.json,
 * then the exact variable values to set. It prints no other variable and no
 * value of a presence-only variable. Exit 0: ready. Exit 1: something is
 * MISSING or INVALID. Exit 2: bad arguments or an unreadable file.
 *
 * Keep the pulled files outside the repo and delete them afterwards: they hold
 * secrets.
 */
import { readFile } from 'node:fs/promises'
import {
  EXIT_OK,
  EXIT_PROBLEMS,
  EXIT_USAGE,
  checkTrialFlags,
  formatReport,
  parseCheckArgs,
  parseEnvText,
} from './lib/trial-flags.mjs'

const DEFAULT_MANIFEST = new URL('../docs/erp/trial-flags.json', import.meta.url)

async function readEnvFile(label, path) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new Error(`Cannot read the ${label} file.`)
  }
  try {
    return parseEnvText(text)
  } catch (error) {
    throw new Error(`${label}: ${error.message}`)
  }
}

async function main() {
  let options
  let envs
  let manifest
  try {
    options = parseCheckArgs(process.argv.slice(2))
    manifest = JSON.parse(await readFile(options.manifest ?? DEFAULT_MANIFEST, 'utf8'))
    envs = {
      web: await readEnvFile('--web-env', options.webEnv),
      api: await readEnvFile('--api-env', options.apiEnv),
    }
  } catch (error) {
    console.error(`check-trial-flags: ${error.message}`)
    process.exit(EXIT_USAGE)
  }

  const report = checkTrialFlags({
    manifest,
    tenants: options.tenants,
    envs,
    includeOptional: options.includeOptional,
  })
  for (const line of formatReport(report)) console.log(line)
  process.exitCode = report.ok ? EXIT_OK : EXIT_PROBLEMS
}

await main()
