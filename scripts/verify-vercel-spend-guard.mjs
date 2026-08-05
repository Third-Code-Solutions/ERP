#!/usr/bin/env node

/**
 * Static billing guard for the hosted web project.
 *
 * This is intentionally read-only. It verifies that Vercel Git deployments
 * remain disabled and that repository automation does not contain a deploy
 * command that could bypass that protection.
 */
import { readFileSync } from 'node:fs'
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

export function verifyVercelSpendGuard(root = repoRoot) {
  const configPath = resolve(root, 'apps/web/vercel.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const automationFiles = [
    'package.json',
    'apps/web/package.json',
    '.github/workflows/ci.yml',
    '.github/workflows/ci-self-hosted.yml',
  ]
  const automationText = automationFiles
    .map((file) => {
      try {
        return readFileSync(resolve(root, file), 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
  return buildVercelSpendGuardReport({ config, automationText })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = verifyVercelSpendGuard()
  console.log(`Vercel spend guard: ${report.status}`)
  for (const blocker of report.blockers) console.log(`- ${blocker}`)
  if (report.status !== 'clear') process.exitCode = 2
}
