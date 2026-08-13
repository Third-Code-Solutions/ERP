#!/usr/bin/env node

/**
 * Verify that every App Router page has an ancestor loading and error
 * boundary. A boundary may live at the page segment, a route group, or the
 * app root; duplicating identical files in every page directory is not
 * required for Next.js segment coverage.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_APP_DIR = resolve(dirname(SCRIPT_PATH), '..', 'apps', 'web', 'src', 'app')

function collectPageFiles(directory) {
  const pages = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      pages.push(...collectPageFiles(entryPath))
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      pages.push(entryPath)
    }
  }

  return pages.sort()
}

function hasAncestorBoundary(pageDirectory, appDirectory, filename) {
  let current = pageDirectory

  while (true) {
    if (existsSync(join(current, filename))) return true
    if (current === appDirectory) return false
    const parent = dirname(current)
    if (parent === current || !parent.startsWith(appDirectory)) return false
    current = parent
  }
}

export function auditAppRouterBoundaries(appDirectory = DEFAULT_APP_DIR) {
  const appRoot = resolve(appDirectory)
  const pages = collectPageFiles(appRoot)
  const uncovered = []

  for (const page of pages) {
    const pageDirectory = dirname(page)
    const missing = []
    if (!hasAncestorBoundary(pageDirectory, appRoot, 'loading.tsx')) {
      missing.push('loading.tsx')
    }
    if (!hasAncestorBoundary(pageDirectory, appRoot, 'error.tsx')) {
      missing.push('error.tsx')
    }
    if (missing.length > 0) {
      uncovered.push({
        page: relative(appRoot, page).split('\\').join('/'),
        missing,
      })
    }
  }

  return {
    appDirectory: appRoot,
    pageCount: pages.length,
    uncovered,
    passed: uncovered.length === 0,
  }
}

function parseAppDirectory() {
  const index = process.argv.indexOf('--app-dir')
  return resolve(index >= 0 ? process.argv[index + 1] : DEFAULT_APP_DIR)
}

function main() {
  const report = auditAppRouterBoundaries(parseAppDirectory())
  console.log(
    `App Router boundaries: ${report.passed ? 'PASS' : 'FAIL'} (${report.pageCount} pages)`
  )
  for (const route of report.uncovered) {
    console.log(`- ${route.page}: missing ${route.missing.join(', ')}`)
  }
  if (!report.passed) process.exitCode = 1
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  try {
    main()
  } catch (error) {
    console.error(
      `App Router boundary inspection failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    process.exitCode = 2
  }
}
