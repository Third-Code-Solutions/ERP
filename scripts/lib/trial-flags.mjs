/**
 * Pure helpers behind scripts/check-trial-flags.mjs.
 *
 * The check mirrors how the code reads the switches: the API schema
 * (apps/api/src/config/environment.ts) accepts only the literal `true` plus a
 * list of UUIDs, and one bad entry stops the API from booting; the web selector
 * (apps/web/src/lib/erp-core-client.ts, tenantEnabledForCoreApi) also accepts a
 * sole `*` entry. Only variables named in docs/erp/trial-flags.json are ever
 * read into a report, and presence-only variables are never printed by value.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const EXIT_OK = 0
export const EXIT_PROBLEMS = 1
export const EXIT_USAGE = 2

/** Reads `KEY=value` lines (Vercel `env pull`, `railway variables --kv`) or a flat JSON object. */
export function parseEnvText(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    let parsed
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // The parser message can quote the file; say nothing about its content.
      throw new Error('The file is not valid JSON.')
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')])
    )
  }

  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

/**
 * Splits a `*_TENANT_IDS` value. `entries` are lowercased and de-duplicated in
 * order; `invalid` holds the 1-based positions of entries that are neither a
 * UUID nor (when allowed) the sole `*`. Entry text is never returned for
 * invalid positions, only the position.
 */
export function parseTenantList(raw, { allowWildcard = false } = {}) {
  const entries = []
  for (const piece of (raw ?? '').split(',')) {
    const entry = piece.trim().toLowerCase()
    if (entry && !entries.includes(entry)) entries.push(entry)
  }
  const wildcard = allowWildcard && entries.length === 1 && entries[0] === '*'
  const invalid = []
  entries.forEach((entry, index) => {
    if (!UUID_PATTERN.test(entry) && !wildcard) invalid.push(index + 1)
  })
  return { entries, invalid, wildcard }
}

function evaluateGate(gate, host, env, tenantId) {
  const allowWildcard = host === 'web' && gate.wildcard === true
  const list = parseTenantList(env[gate.tenantIds], { allowWildcard })
  return {
    host,
    gate,
    enabledOk: env[gate.enabled] === 'true',
    listOk: list.invalid.length === 0 && (list.wildcard || list.entries.includes(tenantId)),
    invalid: list.invalid,
  }
}

function featureStatus(feature, tenantId, envs) {
  const gates = [
    ...feature.api.map((gate) => evaluateGate(gate, 'api', envs.api, tenantId)),
    ...feature.web.map((gate) => evaluateGate(gate, 'web', envs.web, tenantId)),
  ]
  const failing = gates.filter(
    (gate) => !gate.enabledOk || !gate.listOk || gate.invalid.length > 0
  )
  return { feature, gates, failing, ok: failing.length === 0 }
}

/** Per-variable fixes for every gate a requested tenant still fails, merged across tenants. */
function buildFixes(results, envs, tenants) {
  const fixes = new Map()
  for (const result of results) {
    for (const status of result.features) {
      for (const gate of status.failing) {
        const env = envs[gate.host]
        const list = parseTenantList(env[gate.gate.tenantIds], {
          allowWildcard: gate.host === 'web' && gate.gate.wildcard === true,
        })
        if (!gate.enabledOk) {
          fixes.set(`${gate.host}:${gate.gate.enabled}`, {
            host: gate.host,
            name: gate.gate.enabled,
            value: 'true',
          })
        }
        const key = `${gate.host}:${gate.gate.tenantIds}`
        if (list.invalid.length > 0) {
          fixes.set(key, {
            host: gate.host,
            name: gate.gate.tenantIds,
            invalid: list.invalid,
          })
        } else if (!list.wildcard && !list.entries.includes(result.tenantId)) {
          // Reaching here means a tenant is missing; merge all requested tenants once.
          const merged = [...list.entries]
          for (const tenantId of tenants) {
            if (!merged.includes(tenantId)) merged.push(tenantId)
          }
          fixes.set(key, {
            host: gate.host,
            name: gate.gate.tenantIds,
            value: merged.join(','),
          })
        }
      }
    }
  }
  return [...fixes.values()]
}

function checkPresence(entry, envs) {
  const env = envs[entry.host]
  const missing = entry.variables.filter((name) => !env[name]?.trim())
  return { entry, missing, ok: missing.length === 0 }
}

/**
 * @param manifest parsed docs/erp/trial-flags.json
 * @param tenants  raw `--tenant` values (validated here)
 * @param envs     { web, api } variable maps from the pulled files
 */
export function checkTrialFlags({ manifest, tenants, envs, includeOptional = false }) {
  const invalidTenants = tenants.filter((tenant) => !UUID_PATTERN.test(tenant))
  const validTenants = []
  for (const tenant of tenants) {
    const normalized = tenant.toLowerCase()
    if (UUID_PATTERN.test(tenant) && !validTenants.includes(normalized)) {
      validTenants.push(normalized)
    }
  }

  const requiredFeatures = manifest.features.map((feature) => ({
    ...feature,
    required: feature.required || includeOptional,
  }))
  const results = validTenants.map((tenantId) => ({
    tenantId,
    features: requiredFeatures.map((feature) => featureStatus(feature, tenantId, envs)),
  }))
  const presence = manifest.presence.map((entry) => checkPresence(entry, envs))
  const fixes = buildFixes(
    results.map((result) => ({
      ...result,
      features: result.features.filter((status) => status.feature.required),
    })),
    envs,
    validTenants
  )

  const failedRequired = results.some((result) =>
    result.features.some((status) => status.feature.required && !status.ok)
  )
  const failedPresence = presence.some((item) => item.entry.required && !item.ok)
  const ok = invalidTenants.length === 0 && validTenants.length > 0 && !failedRequired && !failedPresence

  return { invalidTenants, results, presence, fixes, ok }
}

function gateDescription(gate) {
  const parts = []
  if (!gate.enabledOk) parts.push(`${gate.gate.enabled} is not "true"`)
  if (gate.invalid.length > 0) {
    parts.push(`${gate.gate.tenantIds} has an entry that is not a UUID (position ${gate.invalid.join(', ')})`)
  } else if (!gate.listOk) {
    parts.push(`${gate.gate.tenantIds} does not list this tenant`)
  }
  return `${gate.host}: ${parts.join('; ')}`
}

export function formatReport(report) {
  const lines = []
  for (const tenant of report.invalidTenants) {
    lines.push(`INVALID tenant id argument "${tenant}" is not a UUID`)
  }
  if (report.invalidTenants.length === 0 && report.results.length === 0) {
    lines.push('No tenant given. Pass --tenant <uuid>.')
  }

  for (const result of report.results) {
    lines.push('', `Tenant ${result.tenantId}`)
    for (const status of result.features) {
      const { feature } = status
      if (status.ok) {
        lines.push(`  OK       ${feature.id}  ${feature.label}`)
        continue
      }
      const word = feature.required ? 'MISSING ' : 'optional'
      lines.push(`  ${word} ${feature.id}  ${feature.label}`)
      for (const gate of status.failing) lines.push(`             ${gateDescription(gate)}`)
      lines.push(`             if left off: ${feature.symptom}`)
    }
  }

  lines.push('', 'Shared variables (names only, values are never printed)')
  for (const item of report.presence) {
    const word = item.ok ? 'OK       ' : item.entry.required ? 'MISSING  ' : 'optional '
    const detail = item.ok ? '' : `  missing: ${item.missing.join(', ')}  (${item.entry.symptom})`
    lines.push(`  ${word}${item.entry.host} ${item.entry.id}  ${item.entry.label}${detail}`)
  }

  if (report.fixes.length > 0) {
    lines.push('', 'Set these variables (API first, then web):')
    const ordered = [...report.fixes].sort(
      (left, right) => (left.host === right.host ? 0 : left.host === 'api' ? -1 : 1)
    )
    for (const fix of ordered) {
      if (fix.invalid) {
        lines.push(`  ${fix.host}  ${fix.name}: fix the entry at position ${fix.invalid.join(', ')} first (not a UUID; one bad entry stops the API booting)`)
      } else {
        lines.push(`  ${fix.host}  ${fix.name}=${fix.value}`)
      }
    }
  }

  lines.push('', report.ok ? 'RESULT: every required switch is on for every tenant.' : 'RESULT: not ready (see MISSING / INVALID above).')
  return lines
}

export function parseCheckArgs(argv) {
  const options = {
    tenants: [],
    webEnv: null,
    apiEnv: null,
    manifest: null,
    includeOptional: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--include-optional') {
      options.includeOptional = true
    } else if (flag === '--tenant') {
      let consumed = 0
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
        index += 1
        consumed += 1
        for (const piece of argv[index].split(',')) {
          if (piece.trim()) options.tenants.push(piece.trim())
        }
      }
      if (consumed === 0) throw new Error('--tenant needs at least one UUID')
    } else if (flag === '--web-env' || flag === '--api-env' || flag === '--manifest') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${flag} needs a file path`)
      index += 1
      if (flag === '--web-env') options.webEnv = value
      else if (flag === '--api-env') options.apiEnv = value
      else options.manifest = value
    } else {
      throw new Error(`Unknown argument ${flag}`)
    }
  }
  if (options.tenants.length === 0) throw new Error('--tenant <uuid> is required')
  if (!options.webEnv) throw new Error('--web-env <file> is required')
  if (!options.apiEnv) throw new Error('--api-env <file> is required')
  return options
}
