import {
  test as base,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test'

export * from '@playwright/test'

const bypassSecret = () => process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET

/**
 * Lets `requests` (a context's request, or an APIRequestContext) through
 * Vercel Authentication. The secret goes out once, on a request to baseURL
 * that is never redirected, and asks Vercel for its bypass cookie. That
 * cookie is host-only, so it reaches the app host and nothing else, redirects
 * included. It also rides on every app request a route cannot reach:
 * page.request, a spec's route.continue() or route.fetch(), and fetch().
 */
export async function mintVercelBypassCookie(
  requests: APIRequestContext,
  baseURL: string | undefined,
  secret = bypassSecret(),
): Promise<void> {
  if (!baseURL || !secret) return
  const response = await requests.get(baseURL, {
    headers: {
      'x-vercel-protection-bypass': secret,
      'x-vercel-set-bypass-cookie': 'true',
    },
    maxRedirects: 0,
  })
  const status = response.status()
  await response.dispose()
  if (status === 401 || status === 403) {
    throw new Error(`Vercel refused the protection bypass for ${baseURL} (${status})`)
  }
}

/**
 * Keeps Vercel's preview toolbar out of console assertions. The toolbar is
 * injected into app pages, so only app-origin documents ask to skip it. The
 * header is not secret: a document that redirects off the app origin keeps it
 * on the next hop, and navigations send no CORS preflight. A spec route that
 * calls route.continue() for a page skips this, and that page may then show
 * the toolbar.
 */
export async function skipVercelToolbar(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  if (!baseURL) return
  const { origin } = new URL(baseURL)
  await context.route(
    (url) => url.origin === origin,
    (route) =>
      route.request().resourceType() === 'document'
        ? route.fallback({
            headers: { ...route.request().headers(), 'x-vercel-skip-toolbar': '1' },
          })
        : route.fallback(),
  )
}

/**
 * Every e2e file takes `test` from here. The worker's browser sets up each
 * context it creates: the built-in `context` and `page` fixtures and a spec's
 * own `browser.newContext()` all go through it. Without the secret (local,
 * loopback and production runs) nothing changes.
 * shortcut: PW_TEST_REUSE_CONTEXT contexts skip newContext and get no bypass;
 * CI never sets it.
 */
export const test = base.extend<object, { browser: Browser }>({
  browser: [
    async ({ browser }, use, workerInfo) => {
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options?: BrowserContextOptions) => {
        const context = await newContext(options)
        const baseURL = options?.baseURL ?? workerInfo.project.use.baseURL
        if (bypassSecret()) {
          await mintVercelBypassCookie(context.request, baseURL)
          await skipVercelToolbar(context, baseURL)
        }
        return context
      }
      await use(browser)
    },
    { scope: 'worker' },
  ],
  request: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext()
    await mintVercelBypassCookie(request, baseURL)
    await use(request)
    await request.dispose()
  },
})
