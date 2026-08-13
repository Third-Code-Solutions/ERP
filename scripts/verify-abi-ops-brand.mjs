import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
])

const LEGACY_PATTERNS = [
  /Third Code Solutions(?: Inc\.)?/i,
  /Third-Code-Solutions/i,
  /Third Code ERP/i,
  /ABI OS/i,
  /abi-os/i,
  /AbiOs/i,
  /third-code-erp-local/i,
  /local-admin@thirdcode\.invalid/i,
  />TC<\/div>/i,
]

const ACTIVE_ENTRIES = [
  'apps/web/src',
  'apps/web/public',
  'apps/api/src',
  'apps/workers',
  'packages',
  'supabase/functions',
  'supabase/seed.sql',
  '.env.example',
  'apps/web/.env.example',
  'README.md',
  'CONTEXT.md',
  'CONVENTIONS.md',
  'NEXT_STEPS.md',
  'THIRD_CODE_ERP_IMPLEMENTATION_PROMPT.md',
]

function collectTextFiles(root, entry) {
  const absoluteEntry = resolve(root, entry)
  if (!existsSync(absoluteEntry)) return []

  const stat = statSync(absoluteEntry)
  if (stat.isFile()) return [absoluteEntry]

  const files = []
  for (const child of readdirSync(absoluteEntry, { withFileTypes: true })) {
    if (child.name === 'node_modules' || child.name === '.git') continue
    const childEntry = join(absoluteEntry, child.name)
    if (child.isDirectory()) {
      files.push(...collectTextFiles(root, relative(root, childEntry)))
    } else if (TEXT_EXTENSIONS.has(extname(child.name).toLowerCase())) {
      files.push(childEntry)
    }
  }
  return files
}

export function findLegacyBrandViolations(filePath, content) {
  return LEGACY_PATTERNS.filter((pattern) => pattern.test(content)).map(
    (pattern) => ({
      filePath,
      pattern: pattern.source,
    })
  )
}

export function scanAbiOpsBrand(root, { includeBuild = true } = {}) {
  const entries = [...ACTIVE_ENTRIES]
  if (includeBuild) entries.push('apps/web/.next')

  const files = entries.flatMap((entry) => collectTextFiles(root, entry))
  const violations = []
  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    violations.push(
      ...findLegacyBrandViolations(relative(root, filePath), content)
    )
  }
  return { filesScanned: files.length, violations }
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const report = scanAbiOpsBrand(root)
  if (report.violations.length > 0) {
    console.error('ABI OPS brand contract failed:')
    for (const violation of report.violations) {
      console.error(`- ${violation.filePath}: ${violation.pattern}`)
    }
    process.exitCode = 1
    return
  }
  console.log(
    `PASS ABI OPS brand contract (${report.filesScanned} text files scanned)`
  )
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFile)) {
  main()
}
