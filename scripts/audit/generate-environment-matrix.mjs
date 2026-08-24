import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const OUTPUT = 'docs/audit/ENVIRONMENT_MATRIX.md'

function trackedFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'buffer' }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'))
}

function assignments(path) {
  const names = new Set()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)
    if (match) names.add(match[1])
  }
  return names
}

function addReference(map, name, path, kind) {
  const record = map.get(name) ?? { runtime: new Set(), secrets: new Set(), vars: new Set() }
  record[kind].add(path)
  map.set(name, record)
}

const rootExample = assignments('.env.example')
const webExample = assignments('apps/web/.env.example')
const references = new Map()
const sourceExtensions = /\.(?:[cm]?[jt]sx?|py)$/
const workflowExtensions = /^\.github\/workflows\/.*\.ya?ml$/

const runtimePatterns = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  /(?:os\.getenv|Deno\.env\.get)\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /os\.environ\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  /config\.(?:get|getOrThrow)(?:<[^>]+>)?\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
]

for (const path of trackedFiles()) {
  if (!sourceExtensions.test(path) && !workflowExtensions.test(path)) continue
  const content = readFileSync(path, 'utf8')
  if (sourceExtensions.test(path) && !path.includes('.test.') && !path.includes('.spec.')) {
    for (const pattern of runtimePatterns) {
      for (const match of content.matchAll(pattern)) {
        addReference(references, match[1], path, 'runtime')
      }
    }
  }
  if (workflowExtensions.test(path)) {
    for (const match of content.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)/g)) {
      addReference(references, match[1], path, 'secrets')
    }
    for (const match of content.matchAll(/\$\{\{\s*vars\.([A-Z][A-Z0-9_]*)/g)) {
      addReference(references, match[1], path, 'vars')
    }
  }
}

const names = new Set([...rootExample, ...webExample, ...references.keys()])

function sensitivity(name) {
  if (name.startsWith('NEXT_PUBLIC_')) return 'PUBLIC CLIENT CONFIG'
  if (name === 'SUPABASE_ANON_KEY' || name.endsWith('_ANON_KEY')) return 'PUBLIC API CONFIG'
  if (/(?:SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|DATABASE_URL|API_KEY|SIGNING_KEY)/.test(name)) {
    return 'SECRET'
  }
  if (/(?:EMAIL|PHONE|USER_ID|TENANT_ID|PROJECT_ID)/.test(name)) return 'IDENTIFIER / CONFIG'
  return 'SERVER CONFIG'
}

function status(name, record) {
  const runtime = record.runtime.size > 0
  if (runtime && !rootExample.has(name) && !webExample.has(name)) return 'UNDOCUMENTED RUNTIME'
  if (runtime) return 'DOCUMENTED RUNTIME'
  if (record.secrets.size || record.vars.size) return 'WORKFLOW ONLY'
  return 'EXAMPLE ONLY'
}

function compactPaths(paths) {
  const list = [...paths].sort()
  if (list.length === 0) return '—'
  const shown = list.slice(0, 3).map((path) => `\`${path}\``).join('<br>')
  return list.length > 3 ? `${shown}<br>+${list.length - 3} more` : shown
}

const rows = []
const summary = new Map()
for (const name of [...names].sort()) {
  const record = references.get(name) ?? { runtime: new Set(), secrets: new Set(), vars: new Set() }
  const rowStatus = status(name, record)
  summary.set(rowStatus, (summary.get(rowStatus) ?? 0) + 1)
  rows.push(
    `| \`${name}\` | ${rowStatus} | ${sensitivity(name)} | ${rootExample.has(name) ? 'yes' : 'no'} | ${webExample.has(name) ? 'yes' : 'no'} | ${record.runtime.size} | ${record.secrets.size ? 'secret' : record.vars.size ? 'variable' : '—'} | ${compactPaths(record.runtime)} |`
  )
}

const summaryRows = [...summary.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, count]) => `| ${key} | ${count} |`)
  .join('\n')

const output = `# Environment Contract Matrix

- Generated: 2026-08-24 Asia/Singapore
- Generator: \`scripts/audit/generate-environment-matrix.mjs\`
- Root example names: ${rootExample.size}
- Web example names: ${webExample.size}
- Distinct names across examples/runtime/workflows: ${names.size}

This is a name-only static inventory. It never reads local or provider values.
Required/optional semantics still need an explicit owner contract; source presence
alone cannot safely infer whether a variable must exist in every environment.

## Summary

| Classification | Names |
| --- | ---: |
${summaryRows}

## Current provider-name evidence

- GitHub repository secrets: E2E authentication/bypass names only.
- GitHub environment \`production\`: database, Supabase, Railway and Vercel
  credential names required by the promotion workflow.
- Vercel production: database/Core routing, application URLs, CAD, OpenAI and
  Supabase names are present.
- Railway variable names and Supabase advisor/config state are not recorded: the
  available CLI surfaces would expose values or require an unavailable access
  token. They remain blocked rather than inferred.
- No GitHub \`SNYK_TOKEN\` name is present, so a fail-closed Snyk job cannot be
  added without establishing that credential or revising the scanner policy.

## Matrix

| Name | Static status | Sensitivity | Root example | Web example | Runtime files | Workflow binding | Representative runtime references |
| --- | --- | --- | --- | --- | ---: | --- | --- |
${rows.join('\n')}
`

writeFileSync(OUTPUT, output, 'utf8')
console.log(`Wrote ${OUTPUT}: ${names.size} names`)
