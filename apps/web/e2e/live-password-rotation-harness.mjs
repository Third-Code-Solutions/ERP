import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const CHILD_WATCHDOG_MS = 11 * 60_000
const CHILD_TERMINATION_GRACE_MS = 5_000
const PROVIDER_REQUEST_TIMEOUT_MS = 15_000
const PROVIDER_PROBE_ATTEMPTS = 2
const PROVIDER_PROBE_DELAY_MS = 500
const ADMIN_USERS_PER_PAGE = 1_000
const ADMIN_USER_PAGE_LIMIT = 10

const harnessEnvironmentSchema = z
  .object({
    E2E_LIVE_PASSWORD_ROTATION: z.literal('1'),
    E2E_LIVE_PASSWORD_ROTATION_CONFIRM_EMAIL: z.string().email(),
    E2E_USER_EMAIL: z.string().email(),
    E2E_USER_PASSWORD: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    PLAYWRIGHT_BASE_URL: z.string().url().optional(),
    E2E_CHROME_PATH: z.string().min(1).optional(),
    E2E_VERCEL_PROTECTION_BYPASS_SECRET: z.string().min(1).optional(),
  })
  .refine(
    (environment) =>
      environment.E2E_LIVE_PASSWORD_ROTATION_CONFIRM_EMAIL ===
      environment.E2E_USER_EMAIL,
    { message: 'Target confirmation mismatch.' }
  )

const SYSTEM_CHILD_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TERM',
  'SystemRoot',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'PNPM_HOME',
  'PLAYWRIGHT_BROWSERS_PATH',
]

const OPTIONAL_CHILD_ENV_ALLOWLIST = [
  'PLAYWRIGHT_BASE_URL',
  'E2E_CHROME_PATH',
  'E2E_VERCEL_PROTECTION_BYPASS_SECRET',
]

function emit(stage, status, detail) {
  const suffix = detail ? ` detail=${detail}` : ''
  console.log(
    `[live-password-rotation-harness] stage=${stage} status=${status}${suffix}`
  )
}

function boundedProviderFetch(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS)
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal
  return fetch(input, { ...init, signal })
}

function createNonPersistentClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: boundedProviderFetch },
  })
}

function buildChildEnvironment(configuration) {
  const environment = {}
  for (const key of SYSTEM_CHILD_ENV_ALLOWLIST) {
    if (typeof process.env[key] === 'string') environment[key] = process.env[key]
  }

  Object.assign(environment, {
    E2E_LIVE_PASSWORD_ROTATION: '1',
    E2E_LIVE_PASSWORD_ROTATION_CONFIRM_EMAIL:
      configuration.E2E_LIVE_PASSWORD_ROTATION_CONFIRM_EMAIL,
    E2E_USER_EMAIL: configuration.E2E_USER_EMAIL,
    E2E_USER_PASSWORD: configuration.E2E_USER_PASSWORD,
    NEXT_PUBLIC_SUPABASE_URL: configuration.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      configuration.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })

  for (const key of OPTIONAL_CHILD_ENV_ALLOWLIST) {
    if (typeof configuration[key] === 'string') {
      environment[key] = configuration[key]
    }
  }

  // The service role is confined to this parent process for emergency cleanup.
  // It must never enter the Playwright/browser process or its diagnostics.
  delete environment.SUPABASE_SERVICE_ROLE_KEY
  if (Object.hasOwn(environment, 'SUPABASE_SERVICE_ROLE_KEY')) {
    throw new Error('Child environment sanitization failed.')
  }
  return environment
}

function terminateChildTree(child, signal) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The child may already have exited between the watchdog and this call.
    }
  }
}

function runPlaywrightChild(environment) {
  const harnessDirectory = dirname(fileURLToPath(import.meta.url))
  const webDirectory = resolve(harnessDirectory, '..')
  const playwrightCli = resolve(
    webDirectory,
    'node_modules',
    '@playwright',
    'test',
    'cli.js'
  )

  return new Promise((resolveChild) => {
    let settled = false
    let timedOut = false
    let forceKillTimer
    const child = spawn(
      process.execPath,
      [
        playwrightCli,
        'test',
        'e2e/live-password-rotation.spec.ts',
        '--project=chromium',
        '--workers=1',
        '--retries=0',
        '--reporter=line',
      ],
      {
        cwd: webDirectory,
        detached: true,
        env: environment,
        shell: false,
        stdio: ['ignore', 'inherit', 'inherit'],
      }
    )

    const finish = (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(watchdogTimer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      resolveChild({ exitCode, timedOut })
    }

    const watchdogTimer = setTimeout(() => {
      timedOut = true
      emit('child', 'watchdog-timeout')
      terminateChildTree(child, 'SIGTERM')
      forceKillTimer = setTimeout(() => {
        terminateChildTree(child, 'SIGKILL')
      }, CHILD_TERMINATION_GRACE_MS)
    }, CHILD_WATCHDOG_MS)

    child.once('error', () => finish(1))
    child.once('close', (code) => finish(timedOut ? 124 : (code ?? 1)))
  })
}

async function probeOriginalPassword(configuration) {
  for (let attempt = 0; attempt < PROVIDER_PROBE_ATTEMPTS; attempt += 1) {
    const client = createNonPersistentClient(
      configuration.NEXT_PUBLIC_SUPABASE_URL,
      configuration.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    let result
    try {
      result = await client.auth.signInWithPassword({
        email: configuration.E2E_USER_EMAIL,
        password: configuration.E2E_USER_PASSWORD,
      })
    } catch {
      // A later bounded attempt may distinguish a transient provider failure.
    }

    if (result && !result.error && result.data.user && result.data.session) {
      const signOut = await client.auth.signOut({ scope: 'local' })
      if (signOut.error) throw new Error('Local sign-out failed.')
      return true
    }

    if (attempt + 1 < PROVIDER_PROBE_ATTEMPTS) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, PROVIDER_PROBE_DELAY_MS)
      )
    }
  }
  return false
}

async function findExactUserId(adminClient, targetEmail) {
  const matches = []
  let page = 1
  let fullyScanned = false

  for (let visited = 0; visited < ADMIN_USER_PAGE_LIMIT; visited += 1) {
    const result = await adminClient.auth.admin.listUsers({
      page,
      perPage: ADMIN_USERS_PER_PAGE,
    })
    if (result.error) throw new Error('Admin user lookup failed.')

    for (const user of result.data.users) {
      if (user.email === targetEmail) matches.push(user.id)
    }
    if (matches.length > 1) break

    const nextPage = result.data.nextPage
    if (Number.isInteger(nextPage) && nextPage > page) {
      page = nextPage
      continue
    }
    if (
      Number.isInteger(result.data.total) &&
      result.data.total > page * ADMIN_USERS_PER_PAGE
    ) {
      page += 1
      continue
    }
    if (result.data.users.length === ADMIN_USERS_PER_PAGE) {
      page += 1
      continue
    }
    fullyScanned = true
    break
  }

  if (!fullyScanned || matches.length !== 1) {
    throw new Error('Admin user lookup did not resolve exactly one account.')
  }
  return matches[0]
}

async function ensureOriginalPassword(configuration) {
  if (await probeOriginalPassword(configuration)) {
    emit('cleanup', 'original-verified')
    return
  }

  // This server-only client is a last-resort test cleanup mechanism after the
  // browser child is stopped. Any use is surfaced for provider-log auditing.
  const adminClient = createNonPersistentClient(
    configuration.NEXT_PUBLIC_SUPABASE_URL,
    configuration.SUPABASE_SERVICE_ROLE_KEY
  )
  const userId = await findExactUserId(
    adminClient,
    configuration.E2E_USER_EMAIL
  )
  const restore = await adminClient.auth.admin.updateUserById(userId, {
    password: configuration.E2E_USER_PASSWORD,
  })
  if (restore.error) throw new Error('Emergency admin restoration failed.')

  emit('cleanup', 'admin-restore-applied', 'audit-provider-logs')
  if (!(await probeOriginalPassword(configuration))) {
    throw new Error('Restored credential verification failed.')
  }
  emit('cleanup', 'original-verified-after-admin-restore')
}

async function main() {
  const parsedEnvironment = harnessEnvironmentSchema.safeParse(process.env)
  if (!parsedEnvironment.success) {
    emit('preflight', 'failed', 'required-opt-in-or-input-missing')
    return 2
  }

  if (process.platform === 'win32') {
    emit('preflight', 'failed', 'non-windows-required')
    return 2
  }

  let childEnvironment
  try {
    childEnvironment = buildChildEnvironment(parsedEnvironment.data)
  } catch {
    emit('preflight', 'failed', 'child-environment-rejected')
    return 2
  }

  emit('child', 'started')
  const childOutcome = await runPlaywrightChild(childEnvironment)
  let childStatus = 'failed'
  if (childOutcome.timedOut) childStatus = 'timed-out'
  else if (childOutcome.exitCode === 0) childStatus = 'passed'
  emit('child', childStatus)

  try {
    await ensureOriginalPassword(parsedEnvironment.data)
  } catch {
    console.error(
      '[live-password-rotation-harness] stage=cleanup status=EMERGENCY'
    )
    return 2
  }

  return childOutcome.exitCode
}

process.exitCode = await main()
