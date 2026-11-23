import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  checkTrialFlags,
  formatReport,
  parseCheckArgs,
  parseEnvText,
  parseTenantList,
} from './trial-flags.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const manifest = JSON.parse(readFileSync(join(ROOT, 'docs/erp/trial-flags.json'), 'utf8'))

const TENANT = '2b2b039c-b066-412b-af4c-564f2af6097e'
const OTHER = '0b6d8c68-2b7a-4f75-92f6-b539c91ad199'
const THIRD = '9f1c7a4e-3d52-4b8e-a1c6-0e5d2f7b8c13'

const miniManifest = {
  features: [
    {
      id: 'api-only',
      label: 'API only',
      required: true,
      api: [{ enabled: 'API_ENABLED', tenantIds: 'API_TENANT_IDS' }],
      web: [],
      symptom: 'API closed.',
    },
    {
      id: 'both',
      label: 'API and web',
      required: true,
      api: [{ enabled: 'BOTH_ENABLED', tenantIds: 'BOTH_TENANT_IDS' }],
      web: [{ enabled: 'BOTH_VIA_API', tenantIds: 'BOTH_VIA_API_TENANT_IDS', wildcard: true }],
      symptom: 'Both closed.',
    },
    {
      id: 'later',
      label: 'Optional',
      required: false,
      api: [{ enabled: 'LATER_ENABLED', tenantIds: 'LATER_TENANT_IDS' }],
      web: [],
      symptom: 'Later closed.',
    },
  ],
  presence: [
    { id: 'url', label: 'URL', host: 'web', required: true, variables: ['CORE_URL'], symptom: 'No URL.' },
    { id: 'mail', label: 'Mail', host: 'api', required: false, variables: ['MAIL_KEY'], symptom: 'No mail.' },
  ],
}

const readyApi = {
  API_ENABLED: 'true',
  API_TENANT_IDS: TENANT,
  BOTH_ENABLED: 'true',
  BOTH_TENANT_IDS: TENANT,
  LATER_ENABLED: 'true',
  LATER_TENANT_IDS: TENANT,
}
const readyWeb = { BOTH_VIA_API: 'true', BOTH_VIA_API_TENANT_IDS: TENANT, CORE_URL: 'https://example.invalid' }

function run(overrides = {}) {
  return checkTrialFlags({
    manifest: miniManifest,
    tenants: [TENANT],
    envs: { api: readyApi, web: readyWeb },
    ...overrides,
  })
}

test('parseEnvText reads dotenv lines with quotes, export and comments', () => {
  const env = parseEnvText(
    ['# Created by Vercel CLI', 'A="one"', "B='two'", 'export C=three', '', 'D=', 'not a line'].join('\r\n')
  )
  assert.deepEqual(env, { A: 'one', B: 'two', C: 'three', D: '' })
})

test('parseEnvText reads a flat JSON object and refuses anything else without echoing it', () => {
  assert.deepEqual(parseEnvText('{"A":"1","B":2}'), { A: '1', B: '2' })
  assert.throws(() => parseEnvText('{"A": secret-value'), (error) => {
    assert.equal(error.message, 'The file is not valid JSON.')
    return true
  })
})

test('parseTenantList trims, lowercases, drops duplicates and positions bad entries', () => {
  const list = parseTenantList(` ${TENANT.toUpperCase()}, ,${TENANT},nope,${OTHER}`)
  assert.deepEqual(list.entries, [TENANT, 'nope', OTHER])
  assert.deepEqual(list.invalid, [2])
  assert.equal(list.wildcard, false)
})

test('a sole star is a wildcard only where allowed, and never beside other entries', () => {
  assert.equal(parseTenantList('*', { allowWildcard: true }).wildcard, true)
  assert.deepEqual(parseTenantList('*', { allowWildcard: true }).invalid, [])
  assert.deepEqual(parseTenantList('*').invalid, [1])
  assert.deepEqual(parseTenantList(`*,${TENANT}`, { allowWildcard: true }).invalid, [1])
})

test('every required switch on for the tenant is OK and exits ready', () => {
  const report = run()
  assert.equal(report.ok, true)
  assert.equal(report.fixes.length, 0)
  const lines = formatReport(report).join('\n')
  assert.match(lines, /OK {7}api-only/)
  assert.match(lines, /OK {7}both/)
  assert.match(lines, /RESULT: every required switch is on/)
})

test('a missing tenant lists the exact new value: existing entries plus the tenant', () => {
  const report = run({
    envs: { api: { ...readyApi, API_TENANT_IDS: OTHER }, web: readyWeb },
  })
  assert.equal(report.ok, false)
  assert.deepEqual(report.fixes, [{ host: 'api', name: 'API_TENANT_IDS', value: `${OTHER},${TENANT}` }])
  const text = formatReport(report).join('\n')
  assert.match(text, /MISSING {2}api-only/)
  assert.match(text, /api {2}API_TENANT_IDS=/)
  assert.match(text, /if left off: API closed\./)
})

test('an empty list gives just the tenant, and a closed enabled flag says to set true', () => {
  const report = run({
    envs: { api: { ...readyApi, API_ENABLED: 'false', API_TENANT_IDS: '' }, web: readyWeb },
  })
  assert.deepEqual(report.fixes, [
    { host: 'api', name: 'API_ENABLED', value: 'true' },
    { host: 'api', name: 'API_TENANT_IDS', value: TENANT },
  ])
})

test('the enabled flag must be the literal true, as the code reads it', () => {
  const report = run({ envs: { api: { ...readyApi, API_ENABLED: 'TRUE' }, web: readyWeb } })
  assert.equal(report.ok, false)
  assert.deepEqual(report.fixes, [{ host: 'api', name: 'API_ENABLED', value: 'true' }])
})

test('several tenants merge into one value per variable and API sorts before web', () => {
  const report = run({
    tenants: [TENANT, OTHER, THIRD, TENANT.toUpperCase()],
    envs: { api: { ...readyApi, API_TENANT_IDS: THIRD }, web: { ...readyWeb, BOTH_VIA_API_TENANT_IDS: '' } },
  })
  assert.equal(report.results.length, 3)
  const byName = Object.fromEntries(report.fixes.map((fix) => [fix.name, fix.value]))
  assert.equal(byName.API_TENANT_IDS, `${THIRD},${TENANT},${OTHER}`)
  assert.equal(byName.BOTH_VIA_API_TENANT_IDS, `${TENANT},${OTHER},${THIRD}`)
  const text = formatReport(report).join('\n')
  assert.ok(text.indexOf('api  API_TENANT_IDS=') < text.indexOf('web  BOTH_VIA_API_TENANT_IDS='))
})

test('a sole star satisfies a web selector that allows it, but never the API list', () => {
  const web = run({ envs: { api: readyApi, web: { ...readyWeb, BOTH_VIA_API_TENANT_IDS: '*' } } })
  assert.equal(web.ok, true)
  const api = run({ envs: { api: { ...readyApi, API_TENANT_IDS: '*' }, web: readyWeb } })
  assert.equal(api.ok, false)
  assert.match(formatReport(api).join('\n'), /not a UUID \(position 1\)/)
  assert.equal(api.fixes[0].invalid[0], 1)
})

test('an invalid entry in an existing list is flagged by position and never echoed', () => {
  const report = run({
    envs: { api: { ...readyApi, API_TENANT_IDS: `${TENANT},tok_live_abc123` }, web: readyWeb },
  })
  assert.equal(report.ok, false)
  const text = formatReport(report).join('\n')
  assert.match(text, /position 2/)
  assert.ok(!text.includes('tok_live_abc123'))
})

test('an invalid tenant argument fails the run and is named', () => {
  const report = run({ tenants: [TENANT, 'not-a-uuid'] })
  assert.equal(report.ok, false)
  assert.deepEqual(report.invalidTenants, ['not-a-uuid'])
  assert.match(formatReport(report).join('\n'), /INVALID tenant id argument "not-a-uuid"/)
})

test('an optional feature does not fail the run unless asked, and a required shared variable does', () => {
  const closed = { ...readyApi, LATER_ENABLED: 'false', LATER_TENANT_IDS: '' }
  assert.equal(run({ envs: { api: closed, web: readyWeb } }).ok, true)
  const strict = run({ envs: { api: closed, web: readyWeb }, includeOptional: true })
  assert.equal(strict.ok, false)
  assert.equal(strict.fixes.length, 2)
  const noUrl = run({ envs: { api: readyApi, web: { ...readyWeb, CORE_URL: '  ' } } })
  assert.equal(noUrl.ok, false)
  assert.match(formatReport(noUrl).join('\n'), /MISSING {2}web url.*missing: CORE_URL/)
})

test('the report names only manifest variables and never a value of anything else', () => {
  const report = run({
    envs: {
      api: { ...readyApi, API_TENANT_IDS: OTHER, DATABASE_URL: 'postgres://secret-db', MAIL_KEY: 'mail-secret' },
      web: { ...readyWeb, CORE_URL: 'https://core-secret.example', SUPABASE_SERVICE_ROLE_KEY: 'srk-secret' },
    },
  })
  const text = formatReport(report).join('\n')
  for (const leaked of ['secret-db', 'mail-secret', 'core-secret', 'srk-secret', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.ok(!text.includes(leaked), `leaked ${leaked}`)
  }
})

test('parseCheckArgs takes repeated and space-separated tenants and requires both files', () => {
  const options = parseCheckArgs([
    '--tenant', TENANT, OTHER, '--tenant', `${THIRD},${TENANT}`,
    '--web-env', 'web.env', '--api-env', 'api.env', '--include-optional',
  ])
  assert.deepEqual(options.tenants, [TENANT, OTHER, THIRD, TENANT])
  assert.equal(options.includeOptional, true)
  assert.throws(() => parseCheckArgs(['--tenant', TENANT, '--web-env', 'w']), /--api-env/)
  assert.throws(() => parseCheckArgs(['--web-env', 'w', '--api-env', 'a']), /--tenant/)
  assert.throws(() => parseCheckArgs(['--tenant', '--web-env', 'w']), /at least one UUID/)
  assert.throws(() => parseCheckArgs(['--nope']), /Unknown argument/)
})

// ---- Contract: the manifest and the code cannot drift apart. ----

const SOURCE_DIRS = ['apps/api/src', 'apps/web/src']
const TENANT_IDS_NAME = /ERP_[A-Z0-9_]+_TENANT_IDS/g

function sourceFiles(directory) {
  return readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (path) =>
        /\.(ts|tsx)$/.test(path) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(path) &&
        !path.includes('node_modules')
    )
}

function codeTenantIdVariables(directory) {
  const names = new Set()
  for (const file of sourceFiles(directory)) {
    for (const name of readFileSync(file, 'utf8').match(TENANT_IDS_NAME) ?? []) names.add(name)
  }
  return names
}

const environmentSource = readFileSync(join(ROOT, 'apps/api/src/config/environment.ts'), 'utf8')
const coreClientSource = readFileSync(join(ROOT, 'apps/web/src/lib/erp-core-client.ts'), 'utf8')
// Presence-only variables (Inngest) are read by the settings status page, not by the Core client.
const integrationStatusSource = readFileSync(
  join(ROOT, 'apps/web/src/app/(dashboard)/settings/integration-status.ts'),
  'utf8'
)
const SOURCES = {
  api: [environmentSource],
  web: [coreClientSource, integrationStatusSource],
}

function declared(host, name) {
  return SOURCES[host].some((source) => source.includes(name))
}

test('contract: every manifest variable is read by the code on the host it names', () => {
  for (const feature of manifest.features) {
    for (const host of ['api', 'web']) {
      for (const gate of feature[host]) {
        assert.ok(declared(host, gate.enabled), `${feature.id}: ${gate.enabled} not found on ${host}`)
        assert.ok(declared(host, gate.tenantIds), `${feature.id}: ${gate.tenantIds} not found on ${host}`)
      }
    }
    assert.ok(feature.symptom.length > 0, `${feature.id} needs symptom text`)
  }
  for (const entry of manifest.presence) {
    for (const name of entry.variables) {
      assert.ok(declared(entry.host, name), `${entry.id}: ${name} not found on ${entry.host}`)
    }
  }
})

test('contract: required web wildcard flags match the selector the code uses', () => {
  for (const feature of manifest.features) {
    for (const gate of feature.web) {
      const call = new RegExp(
        `tenantEnabledFor(Exact)?CoreApi\\(\\s*tenantId,\\s*process\\.env\\.${gate.enabled},\\s*process\\.env\\.${gate.tenantIds}`
      ).exec(coreClientSource)
      assert.ok(call, `${feature.id}: no selector call for ${gate.enabled}`)
      assert.equal(Boolean(gate.wildcard), call[1] === undefined, `${feature.id}: wildcard flag disagrees with the selector`)
    }
  }
})

test('contract: every *_TENANT_IDS variable in the code is classified exactly once', () => {
  const classified = { api: new Map(), web: new Map() }
  const claim = (host, name, where) => {
    assert.ok(!classified[host].has(name), `${name} is classified twice (${classified[host].get(name)} and ${where})`)
    classified[host].set(name, where)
  }
  for (const feature of manifest.features) {
    for (const host of ['api', 'web']) {
      for (const gate of feature[host]) claim(host, gate.tenantIds, `feature ${feature.id}`)
    }
  }
  for (const host of ['api', 'web']) {
    for (const name of manifest.leaveOff[host]) claim(host, name, 'leaveOff')
  }

  for (const [host, directory] of [['api', SOURCE_DIRS[0]], ['web', SOURCE_DIRS[1]]]) {
    const inCode = codeTenantIdVariables(directory)
    const unclassified = [...inCode].filter((name) => !classified[host].has(name))
    assert.deepEqual(
      unclassified,
      [],
      `${host}: classify these in docs/erp/trial-flags.json (feature or leaveOff): ${unclassified.join(', ')}`
    )
    const stale = [...classified[host].keys()].filter((name) => !inCode.has(name))
    assert.deepEqual(stale, [], `${host}: manifest names a variable the code no longer reads: ${stale.join(', ')}`)
  }
})
