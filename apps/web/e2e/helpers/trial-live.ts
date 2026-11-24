import { test, type Browser, type Page, type Route, type TestInfo } from '@playwright/test'
import { z } from 'zod'
import { readE2EEnv } from './env'
import {
  DEMO_ROLE_EMAILS,
  assertDemoProject,
  resolveDemoTenantId,
} from './production-demo-boundary'
import { authenticateRole, type MagicLinkRole } from './supabase-magic-link'

// Live trial-readiness checks run only from .github/workflows/verify-trial-live.yml.
// Every spec in e2e/trial-live calls gateTrialLive() so a plain `playwright test`
// skips them instead of writing to production.
export const TRIAL_LIVE = process.env.E2E_TRIAL_LIVE === '1'

// Digits only: CAD layer names built from it must not match the extractor's
// layer-system patterns (HVAC, IT, FP, ...).
export const RUN_ID = String(Date.now())

export const ALL_ROLES = Object.keys(DEMO_ROLE_EMAILS) as MagicLinkRole[]

export function gateTrialLive(): void {
  test.skip(
    !TRIAL_LIVE,
    'Set E2E_TRIAL_LIVE=1 (verify-trial-live workflow) to run live trial-readiness checks.'
  )
}

export type TrialTarget = {
  baseUrl: string
  apiBaseUrl: string
  tenantId: string
  projectId: string
}

/** Resolves the E2E tenant and proves the E2E project belongs to it before any step runs. */
export async function trialTarget(testInfo: TestInfo): Promise<TrialTarget> {
  const baseUrl = z.string().url().parse(testInfo.project.use.baseURL)
  const apiBaseUrl = z.string().url().parse(process.env.E2E_API_BASE_URL)
  const slug = z.string().min(1).parse(process.env.E2E_DEMO_TENANT_SLUG)
  const projectId = z.string().uuid().parse(process.env.E2E_PROJECT_ID)
  const tenantId = await resolveDemoTenantId(slug.trim())
  await assertDemoProject(projectId, tenantId)
  return { baseUrl, apiBaseUrl: apiBaseUrl.replace(/\/$/, ''), tenantId, projectId }
}

export type RoleSession = {
  page: Page
  accessToken: string
  close: () => Promise<void>
}

/** A fresh browser context signed in as one seeded E2E role. Always close it in `finally`. */
export async function openRole(
  browser: Browser,
  target: TrialTarget,
  role: MagicLinkRole
): Promise<RoleSession> {
  const context = await browser.newContext({ baseURL: target.baseUrl })
  try {
    const session = await authenticateRole(context, target.baseUrl, role)
    if (session.tenantId !== target.tenantId) {
      throw new Error(`${role} is not a member of the E2E tenant`)
    }
    const page = await context.newPage()
    page.on('dialog', (dialog) => void dialog.accept())
    return {
      page,
      accessToken: session.accessToken,
      close: async () => {
        await session.cleanup()
        await context.close()
      },
    }
  } catch (error) {
    await context.close()
    throw error
  }
}

export function pickRole(
  label: string,
  predicate: (role: MagicLinkRole) => boolean
): MagicLinkRole {
  const role = ALL_ROLES.find(predicate)
  if (!role) throw new Error(`No seeded E2E role ${label}`)
  return role
}

/**
 * Read-only service-role lookup, always filtered to the E2E tenant.
 * `query` is the rest of the PostgREST query string (select, filters, order).
 */
export async function tenantRows<T extends z.ZodTypeAny>(
  target: TrialTarget,
  table: string,
  query: string,
  row: T
): Promise<z.infer<T>[]> {
  const env = readE2EEnv()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase E2E environment is incomplete')
  }
  const tenantId = z.string().uuid().parse(target.tenantId)
  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?tenant_id=eq.${tenantId}&${query}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  )
  if (!response.ok) throw new Error(`${table} lookup failed (${response.status})`)
  return z.array(row).parse(await response.json())
}

export type ServerActionTap = {
  /** Raw bodies of every intercepted Next.js server action POST. */
  bodies: string[]
  stop: () => Promise<void>
}

/**
 * Intercepts Next.js server action POSTs (they carry a `next-action` header).
 * Without `rewrite` every action is aborted, so a client-side probe never reaches
 * the server. With `rewrite` the edited body is sent on; a `null` rewrite aborts.
 */
export async function tapServerActions(
  page: Page,
  rewrite?: (body: string) => string | null
): Promise<ServerActionTap> {
  const bodies: string[] = []
  const handler = async (route: Route) => {
    const request = route.request()
    if (request.method() !== 'POST' || !request.headers()['next-action']) {
      await route.fallback()
      return
    }
    const body = request.postData() ?? ''
    bodies.push(body)
    const edited = rewrite ? rewrite(body) : null
    if (edited === null) await route.abort('failed')
    else await route.continue({ postData: edited })
  }
  await page.route('**/*', handler)
  return { bodies, stop: () => page.unroute('**/*', handler) }
}

/** Parses ₱1,234.56 / ₱ 1,234.56 / −₱1,234.56 / -₱1,234.56 into integer centavos. */
export function pesoTextToCents(text: string): number {
  const match = /^([-−])?₱([-−])?([\d,]+)\.(\d{2})$/.exec(text.replace(/\s/g, ''))
  if (!match) throw new Error(`Not a peso amount: ${JSON.stringify(text)}`)
  const cents = Number(match[3]!.replaceAll(',', '')) * 100 + Number(match[4])
  return match[1] || match[2] ? -cents : cents
}

/** The test still passes on what it proved; the report lists the branch it could not reach. */
export function noteNeedsData(testInfo: TestInfo, what: string): void {
  testInfo.annotations.push({ type: 'needs-data', description: what })
}

/** Nothing core could be exercised: fail loudly instead of passing vacuously. */
export function needsData(what: string): never {
  throw new Error(`NEEDS DATA: ${what}`)
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
