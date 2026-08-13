import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const SOURCE_ROOTS = ['apps/web/src', 'apps/api/src', 'apps/workers', 'packages']
const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'e2e',
  '__tests__',
  'test',
  'tests',
])
const ESCAPE_PATTERNS = [
  /\bas\s+any\b/g,
  /=\s*any\b/g,
  /<any>/g,
  /@ts-(?:ignore|nocheck)\b/g,
]

function collectSourceFiles(root, entry) {
  const absoluteEntry = resolve(root, entry)
  if (!existsSync(absoluteEntry)) return []
  const stat = statSync(absoluteEntry)
  if (stat.isFile()) return [absoluteEntry]

  const files = []
  for (const child of readdirSync(absoluteEntry, { withFileTypes: true })) {
    if (child.isDirectory() && EXCLUDED_SEGMENTS.has(child.name)) continue
    const childPath = join(absoluteEntry, child.name)
    if (child.isDirectory()) {
      files.push(...collectSourceFiles(root, relative(root, childPath)))
    } else if (SOURCE_EXTENSIONS.has(extname(child.name).toLowerCase())) {
      files.push(childPath)
    }
  }
  return files
}

export function findTypeSafetyViolations(filePath, content) {
  const violations = []
  for (const pattern of ESCAPE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split('\n').length
      violations.push({ filePath, line, pattern: pattern.source })
    }
  }
  return violations
}

export function scanTypeSafety(root) {
  const files = SOURCE_ROOTS.flatMap((entry) => collectSourceFiles(root, entry))
  const violations = files.flatMap((filePath) =>
    findTypeSafetyViolations(
      relative(root, filePath),
      readFileSync(filePath, 'utf8')
    )
  )
  return { filesScanned: files.length, violations }
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const report = scanTypeSafety(root)
  if (report.violations.length > 0) {
    console.error('Type-safety contract failed:')
    for (const violation of report.violations) {
      console.error(
        `- ${violation.filePath}:${violation.line}: ${violation.pattern}`
      )
    }
    process.exitCode = 1
    return
  }
  console.log(
    `PASS type-safety contract (${report.filesScanned} source files scanned)`
  )
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFile)) main()
