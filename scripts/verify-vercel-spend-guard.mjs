#!/usr/bin/env node

/**
 * Static billing guard for the hosted web project.
 *
 * This is intentionally read-only. It verifies that Vercel Git deployments
 * remain disabled and that repository automation does not contain a deploy
 * command that could bypass that protection.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

export function buildVercelSpendGuardReport({ config, automationText }) {
  const blockers = []
  if (config?.git?.deploymentEnabled !== false) {
    blockers.push(
      'apps/web/vercel.json must keep git.deploymentEnabled=false'
    )
  }

  const deployCommandPattern =
    /(?:^|[\s"'`])(?:npx\s+)?(?:vercel|vc)(?:\s+[^\r\n"'`;&|]*)?\s+(?:deploy|--prod)(?:\s|$)/im
  if (deployCommandPattern.test(automationText)) {
    blockers.push(
      'repository automation contains a Vercel deploy command; remove it'
    )
  }

  return {
    status: blockers.length === 0 ? 'clear' : 'review_required',
    blockers,
  }
}

function collectAutomationFiles(root) {
  const files = []
  const ignoredDirectories = new Set([
    '.git',
    '.next',
    'coverage',
    'node_modules',
    'tmp',
  ])

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(resolve(directory, entry.name))
        }
        continue
      }

      const absolutePath = resolve(directory, entry.name)
      const relativePath = absolutePath
        .slice(root.length + 1)
        .replaceAll('\\', '/')
      const isPackageManifest = entry.name === 'package.json'
      const isWorkflow =
        relativePath.startsWith('.github/workflows/') &&
        (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))

      if (isPackageManifest || isWorkflow) files.push(absolutePath)
    }
  }

  visit(root)
  return files
}

export function verifyVercelSpendGuard(root = repoRoot) {
  const configPath = resolve(root, 'apps/web/vercel.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const automationText = collectAutomationFiles(root)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  return buildVercelSpendGuardReport({ config, automationText })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = verifyVercelSpendGuard()
  console.log(`Vercel spend guard: ${report.status}`)
  for (const blocker of report.blockers) console.log(`- ${blocker}`)
  if (report.status !== 'clear') process.exitCode = 2
}
