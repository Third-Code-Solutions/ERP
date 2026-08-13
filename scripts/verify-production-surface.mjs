#!/usr/bin/env node

/**
 * Read-only production surface contract.
 *
 * This checks public health, readiness, manifest, and landing output. It never
 * authenticates, mutates application data, or changes deployment state.
 */
const LEGACY_BRAND_PATTERN =
  /Third\s+Code(?:\s+Solutions(?:\s+Inc\.)?)?|ABI\s+OS|abi-os|AbiOs/i

function parseUrlArgument() {
  const index = process.argv.indexOf('--url')
  const value = index >= 0 ? process.argv[index + 1] : process.env.PRODUCTION_URL
  if (!value) {
    throw new Error('Provide --url <absolute-http-url> or PRODUCTION_URL')
  }
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Production URL must use HTTP(S)')
  }
  return url.origin
}

export function evaluateProductionSurface(input) {
  const failures = []
  const health = input.health.json
  const ready = input.ready.json
  const manifest = input.manifest.json

  if (input.health.status !== 200) {
    failures.push(`health returned HTTP ${input.health.status}`)
  }
  if (health?.ok !== true || health?.service !== 'abi-ops-web') {
    failures.push('health identity is not abi-ops-web with ok=true')
  }
  if (input.ready.status !== 200) {
    failures.push(`readiness returned HTTP ${input.ready.status}`)
  }
  if (ready?.ok !== true || ready?.database !== 'up') {
    failures.push('readiness does not report ok=true and database=up')
  }
  if (input.manifest.status !== 200) {
    failures.push(`manifest returned HTTP ${input.manifest.status}`)
  }
  if (manifest?.name !== 'ABI OPS' || manifest?.short_name !== 'ABI OPS') {
    failures.push('manifest name and short_name must both be ABI OPS')
  }
  if (input.root.status !== 200) {
    failures.push(`landing returned HTTP ${input.root.status}`)
  }
  if (!input.root.text.includes('ABI OPS')) {
    failures.push('landing output does not contain ABI OPS')
  }
  if (LEGACY_BRAND_PATTERN.test(input.root.text)) {
    failures.push('landing output contains legacy product or legal branding')
  }

  return {
    passed: failures.length === 0,
    failures,
    revision:
      typeof health?.revision === 'string' ? health.revision : null,
  }
}

async function fetchText(origin, path) {
  const response = await fetch(`${origin}${path}`, {
    headers: { accept: 'application/json,text/html,*/*' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // Non-JSON landing output is expected.
  }
  return { status: response.status, text, json }
}

async function main() {
  const origin = parseUrlArgument()
  const [health, ready, manifest, root] = await Promise.all([
    fetchText(origin, '/api/health'),
    fetchText(origin, '/api/ready'),
    fetchText(origin, '/manifest.webmanifest'),
    fetchText(origin, '/'),
  ])
  const report = evaluateProductionSurface({ health, ready, manifest, root })

  console.log(`Production surface: ${report.passed ? 'PASS' : 'BLOCKED'}`)
  console.log(`Origin: ${origin}`)
  console.log(`Revision: ${report.revision ?? 'unknown'}`)
  for (const failure of report.failures) console.log(`- ${failure}`)
  if (!report.passed) process.exitCode = 1
}

if (process.argv[1]?.endsWith('verify-production-surface.mjs')) {
  main().catch((error) => {
    console.error(
      `Production surface inspection failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    process.exitCode = 2
  })
}
