import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const app = join(root, 'apps/web/src/app')
const normalize = (value) => value.replaceAll('\\', '/')
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)])
}
function ancestor(file, name) {
  let directory = dirname(file)
  while (directory.startsWith(app)) {
    if (existsSync(join(directory, name))) return normalize(relative(root, join(directory, name)))
    if (directory === app) break
    directory = dirname(directory)
  }
  return null
}
const records = walk(app).filter((file) => /(?:page\.tsx|route\.ts)$/.test(file)).map((file) => {
  const source = readFileSync(file, 'utf8')
  const relativeFile = normalize(relative(app, file))
  const route = '/' + relativeFile.split('/').slice(0, -1).filter((segment) => !segment.startsWith('(')).join('/')
  const kind = relativeFile.endsWith('page.tsx') ? 'page' : 'handler'
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).filter((value) => value.startsWith('@/') || value.startsWith('.') || value.startsWith('@third-code'))
  const authorization = [...new Set([...source.matchAll(/\b(requireUserProfile|getUserProfile|requireCapability|requireUser|createSupabaseServerClient|can|isProtectedRoute|verifyOtp)\s*\(/g)].map((match) => match[1]))]
  const directTests = readdirSync(dirname(file)).filter((name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name))
  return { route: route || '/', kind, source: normalize(relative(root, file)), imports, authorization, directTests, loading: kind === 'page' ? ancestor(file, 'loading.tsx') : null, error: kind === 'page' ? ancestor(file, 'error.tsx') : null, redirect: source.match(/(?:permanentRedirect|redirect)\(['"]([^'"]+)['"]\)/)?.[1] ?? null, placeholderSignal: /\b(coming soon|placeholder|mock data|not implemented)\b/i.test(source) }
}).sort((a,b) => a.route.localeCompare(b.route) || a.kind.localeCompare(b.kind))

if (process.argv.includes('--markdown')) {
  console.log('## Exact source inventory — 2026-09-04\n')
  console.log(`Discovered ${records.filter((row) => row.kind === 'page').length} pages and ${records.filter((row) => row.kind === 'handler').length} Next handlers. This is a **static evidence ledger**, not a claim of route-by-route runtime completion. Dashboard policy tests cover every dashboard page against all 13 tenant roles; platform pages use the separate owner boundary. Direct imports/test siblings below are navigation aids, not complete transitive dependency or workflow proofs.\n`)
  console.log('| Route | Kind / boundary | Source | Direct data/action references | Tests / states | Runtime status |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (const row of records) {
    const boundary = row.source.includes('(platform)') ? 'platform owner' : row.source.includes('(dashboard)') ? 'tenant + exact role policy' : row.source.includes('(auth)') ? 'auth flow' : row.route.includes('portal') || row.route.includes('[token]') ? 'token boundary; verify individually' : 'page-local; inspect individually'
    const refs = row.imports.slice(0, 4).map((value) => `\`${value}\``).join('<br>') || 'Local implementation'
    const states = row.kind === 'page' ? `${row.loading ? 'loading inherited/own' : 'NO loading'}; ${row.error ? 'error inherited/own' : 'NO error'}` : 'Handler-local'
    const status = row.redirect ? `Redirect → \`${row.redirect}\`; local test required` : row.placeholderSignal ? 'Placeholder wording detected; inspect' : 'Implemented source; runtime audit incomplete'
    console.log(`| \`${row.route}\` | ${row.kind}; ${boundary} | [source](${row.source}) | ${refs} | ${row.directTests.length} sibling tests; ${states} | ${status} |`)
  }
} else console.log(JSON.stringify(records, null, 2))
