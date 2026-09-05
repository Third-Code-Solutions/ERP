import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'

export const targets = {
  api: {
    service: 'c45b3d01-036a-4663-a524-0713d782fce3',
    paths: ['apps/api', 'packages/ai', 'packages/config', 'packages/database', 'packages/shared-types', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'railway.toml', '.npmrc', '.dockerignore'],
    health: 'https://third-code-erp-api-production.up.railway.app/ready',
  },
  cad: {
    service: '328c6650-306e-4a3c-80dc-7566e80ba86a',
    paths: ['apps/workers/dxf-parser'],
    health: 'https://abi-ops-cad-worker-production.up.railway.app/health',
  },
}
const project = 'a21fd382-80b2-4218-8025-11f420a062e3'
const environment = 'ce3a09da-9334-4256-a0a6-85d69676cb89'
const pending = new Set(['INITIALIZING', 'QUEUED', 'BUILDING', 'DEPLOYING', 'WAITING'])

export function sourceSha(deployment) {
  const candidate = deployment?.meta?.commitHash ?? deployment?.meta?.cliMessage?.match(/^release-sha:([a-f0-9]{40});/)?.[1]
  return /^[a-f0-9]{40}$/.test(candidate ?? '') ? candidate : null
}

export function assessDeployment(deployment, active, unchanged) {
  if (deployment.status === 'SUCCESS') return 'deployed'
  if (pending.has(deployment.status)) return 'pending'
  if (deployment.status !== 'SKIPPED') throw new Error(`Railway deployment ended in ${deployment.status}`)
  if (active?.status !== 'SUCCESS' || !sourceSha(active)) throw new Error('Skipped deployment has no source-bound successful predecessor')
  for (const key of ['serviceManifest', 'fileServiceManifest', 'configFile', 'rootDirectory']) {
    if (!isDeepStrictEqual(deployment.meta?.[key] ?? null, active.meta?.[key] ?? null)) {
      throw new Error(`Skipped deployment configuration differs: ${key}`)
    }
  }
  if (!unchanged) throw new Error('Skipped deployment contains changed container inputs')
  // SKIPPED is not a new release. Retain only a proven identical, healthy
  // predecessor; the caller must still run the production smoke/role gates.
  return 'retained-identical'
}

export async function deploy(component) {
  const target = targets[component]
  if (!target) throw new Error('Expected api or cad target')
  const sha = process.env.GITHUB_SHA
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('GITHUB_SHA must identify the reviewed release')
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (git(['rev-parse', 'HEAD']) !== sha) throw new Error('Checkout differs from the reviewed release')
  if (git(['status', '--porcelain']) !== '') throw new Error('Refusing to upload an uncommitted source tree')
  const cli = (args) => execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['dlx', '@railway/cli@5.28.0', ...args], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const scope = ['--project', project, '--environment', environment, '--service', target.service]
  const list = () => {
    const records = JSON.parse(cli(['deployment', 'list', ...scope, '--limit', '50', '--json']))
    if (!Array.isArray(records)) throw new Error('Unexpected Railway deployment list')
    return records
  }
  const before = list()
  const previous = before.find((record) => record.status === 'SUCCESS')
  const seen = new Set(before.map((record) => record.id))
  const label = `release-sha:${sha};run:${process.env.GITHUB_RUN_ID ?? 'manual'};attempt:${process.env.GITHUB_RUN_ATTEMPT ?? '1'};component:${component}`
  const pathArgs = component === 'cad' ? ['apps/workers/dxf-parser', '--path-as-root'] : []
  // railway up --ci hangs forever on SKIPPED (railwayapp/cli#787).
  // Detached submission plus explicit bounded terminal-state checks does not.
  cli(['up', ...pathArgs, ...scope, '--detach', '--yes', '--message', label])
  const deadline = Date.now() + 20 * 60_000
  let lastState = ''
  while (Date.now() < deadline) {
    const current = list()
    const deployment = current.find((record) => !seen.has(record.id) && record.meta?.cliMessage === label)
    if (deployment) {
      let unchanged = false
      if (deployment.status === 'SKIPPED' && sourceSha(previous)) {
        unchanged = git(['diff', '--name-only', sourceSha(previous), sha, '--', ...target.paths]) === ''
      }
      const outcome = assessDeployment(deployment, previous, unchanged)
      if (deployment.status !== lastState) {
        console.log(JSON.stringify({ component, deploymentId: deployment.id, status: deployment.status, outcome }))
        lastState = deployment.status
      }
      if (outcome !== 'pending') {
        const expectedActive = outcome === 'deployed' ? deployment.id : previous.id
        if (current.find((record) => record.status === 'SUCCESS')?.id !== expectedActive) {
          throw new Error('Active Railway deployment changed during promotion')
        }
        const response = await fetch(target.health, { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`${component} live health returned ${response.status}`)
        console.log(JSON.stringify({ component, outcome, candidateSha: sha, activeDeploymentId: outcome === 'deployed' ? deployment.id : previous.id, predecessorSha: sourceSha(previous) }))
        return
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error('Railway did not reach a verified terminal state within 20 minutes')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy(process.argv[2]).catch((error) => {
    // Do not print CLI child-process objects: they can retain environment data.
    console.error(error.message)
    process.exitCode = 1
  })
}
