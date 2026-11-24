import {
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test'

export * from '@playwright/test'

/**
 * The headers that let the trusted-PR job through Vercel Authentication and
 * keep Vercel's preview toolbar out of console assertions. Read on every call
 * so a spec can set the secret before it creates a context.
 */
export function vercelPreviewHeaders(
  secret = process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET,
): Record<string, string> {
  return secret
    ? { 'x-vercel-protection-bypass': secret, 'x-vercel-skip-toolbar': '1' }
    : {}
}

/**
 * Adds `headers` to requests for the app's own origin only. Sent to another
 * origin (Sentry ingest, Supabase), they fail its CORS preflight, which shows
 * up as console errors, and they would hand the bypass secret to a third party.
 */
export async function addHeadersForOrigin(
  context: BrowserContext,
  baseURL: string | undefined,
  headers: Record<string, string>,
): Promise<void> {
  if (!baseURL || Object.keys(headers).length === 0) return
  const { origin } = new URL(baseURL)
  // fallback, not continue, so routes a spec adds later still run first.
  await context.route(
    (url) => url.origin === origin,
    (route) =>
      route.fallback({ headers: { ...route.request().headers(), ...headers } }),
  )
}

/**
 * Every spec imports `test` from here. The worker's browser adds the Vercel
 * headers to each context it creates: the built-in `context` and `page`
 * fixtures and a spec's own `browser.newContext()` all go through it.
 * shortcut: PW_TEST_REUSE_CONTEXT contexts skip newContext and get no headers;
 * CI never sets it.
 */
export const test = base.extend<object, { browser: Browser }>({
  browser: [
    async ({ browser }, use, workerInfo) => {
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options?: BrowserContextOptions) => {
        const context = await newContext(options)
        await addHeadersForOrigin(
          context,
          options?.baseURL ?? workerInfo.project.use.baseURL,
          vercelPreviewHeaders(),
        )
        return context
      }
      await use(browser)
    },
    { scope: 'worker' },
  ],
  // APIRequestContext has no routes and no CORS, so it keeps the headers
  // directly. Point it only at the app's origin.
  request: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: vercelPreviewHeaders(),
    })
    await use(request)
    await request.dispose()
  },
})
