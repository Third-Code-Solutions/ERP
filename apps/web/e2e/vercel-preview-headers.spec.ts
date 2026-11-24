import { readdirSync, readFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from 'node:http'
import { resolve } from 'node:path'
import { test, expect, mintVercelBypassCookie } from './base-test'

const SECRET = 'e2e-header-scope-check'
const BYPASS = 'x-vercel-protection-bypass'
const COOKIE = '_vercel_jwt=ok'

type Seen = { path: string; headers: IncomingHttpHeaders }

async function listen(host: string, handler: RequestListener): Promise<{ server: Server; port: number }> {
  const server = createServer(handler)
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(0, host, done)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind')
  return { server, port: address.port }
}

const close = (server: Server) =>
  new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())))

// The app stands in for a protected Vercel preview; the foreign origin for
// Sentry ingest and Supabase Storage. Cookies ignore ports, so the foreign
// origin needs another host name: localhost against the app's 127.0.0.1.
test.describe('Vercel preview bypass', () => {
  let app: { server: Server; origin: string }
  let foreign: { server: Server; origin: string }
  const appSeen: Seen[] = []
  const foreignSeen: Seen[] = []

  test.beforeAll(async () => {
    const foreignServer = await listen('::', (request, response) => {
      foreignSeen.push({ path: request.url ?? '', headers: request.headers })
      // Answers CORS the way Sentry ingest does: only content-type is allowed.
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
      }).end('{}')
    })
    foreign = { server: foreignServer.server, origin: `http://localhost:${foreignServer.port}` }
    const appServer = await listen('127.0.0.1', (request, response) => {
      const path = request.url ?? '/'
      appSeen.push({ path, headers: request.headers })
      if (request.headers[BYPASS] === SECRET && request.headers['x-vercel-set-bypass-cookie'] === 'true') {
        response.writeHead(307, { location: path, 'set-cookie': `${COOKIE}; Path=/; HttpOnly; SameSite=Lax` }).end()
        return
      }
      if (!request.headers.cookie?.includes(COOKIE)) {
        response.writeHead(401).end('Vercel Authentication')
        return
      }
      if (path === '/r') {
        // Like /api/documents/[id]: a 302 to a signed URL on another origin.
        response.writeHead(302, { location: `${foreign.origin}/storage/v1/object/sign/x` }).end()
        return
      }
      if (path === '/plain') {
        response.writeHead(200, { 'content-type': 'text/plain' }).end('ok')
        return
      }
      response.writeHead(200, { 'content-type': 'text/html' }).end(
        `<img src="/r"><script>fetch('${foreign.origin}/api/1/envelope/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })` +
        `.then((r) => console.log('foreign ' + r.status), (e) => console.log('foreign failed ' + e))</script>`,
      )
    })
    app = { server: appServer.server, origin: `http://127.0.0.1:${appServer.port}` }
  })

  test.beforeEach(() => {
    appSeen.length = 0
    foreignSeen.length = 0
  })

  test.afterAll(async () => {
    await Promise.all([close(app.server), close(foreign.server)])
  })

  function expectNothingForeign(): void {
    expect(foreignSeen.length).toBeGreaterThan(0)
    for (const { path, headers } of foreignSeen) {
      expect(headers[BYPASS], `secret sent to ${path}`).toBeUndefined()
      // A navigation keeps it across a redirect; it is not secret and has no preflight.
      if (headers['sec-fetch-dest'] !== 'document') {
        expect(headers['x-vercel-skip-toolbar'], `toolbar header sent to ${path}`).toBeUndefined()
      }
      expect(headers.cookie ?? '', `bypass cookie sent to ${path}`).not.toContain(COOKIE)
      expect(headers['access-control-request-headers'] ?? '', `preflight for ${path}`).not.toMatch(/x-vercel/)
    }
  }

  test('browser contexts get the bypass on the app host only, redirects included', async ({ browser }) => {
    const previous = process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET
    process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET = SECRET
    // The built-in context fixture creates its context through this same call.
    const context = await browser.newContext({ baseURL: app.origin })
    if (previous === undefined) delete process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET
    else process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET = previous
    try {
      const page = await context.newPage()
      const consoleErrors: string[] = []
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
      const foreignResult = page.waitForEvent('console', (message) => message.text().startsWith('foreign'))
      const image = page.waitForResponse((response) => response.url().includes('/storage/v1/object/sign/x'))
      expect((await page.goto('/'))?.status()).toBe(200)
      expect((await foreignResult).text()).toBe('foreign 200')
      await image
      expect(consoleErrors).toEqual([])

      // A navigation that redirects off the app origin.
      await page.goto('/r')
      expect(page.url()).toContain(foreign.origin)

      // App requests a context route never sees still carry the cookie.
      await page.route('**/plain', (route) => route.continue())
      expect((await page.goto('/plain'))?.status()).toBe(200)
      expect((await page.request.get('/plain')).status()).toBe(200)

      expectNothingForeign()
      expect(appSeen.filter(({ headers }) => headers[BYPASS] !== undefined)).toHaveLength(1)
      const documents = appSeen.filter(({ path }) => path === '/')
      expect(documents.at(-1)?.headers['x-vercel-skip-toolbar']).toBe('1')
      expect(appSeen.find(({ path }) => path === '/r')?.headers.cookie).toContain(COOKIE)
    } finally {
      await context.close()
    }
  })

  test('API request contexts send the secret once and never off the app host', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: app.origin })
    try {
      await mintVercelBypassCookie(request, app.origin, SECRET)
      expect((await request.get('/plain')).status()).toBe(200)
      expect((await request.get('/r')).url()).toContain(foreign.origin)
      expect((await request.get(`${foreign.origin}/direct`)).status()).toBe(200)

      expectNothingForeign()
      expect(foreignSeen.map(({ path }) => path)).toEqual(['/storage/v1/object/sign/x', '/direct'])
      expect(appSeen.filter(({ headers }) => headers[BYPASS] !== undefined)).toHaveLength(1)
    } finally {
      await request.dispose()
    }
  })

  test('a refused secret fails the context instead of running unprotected', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: app.origin })
    try {
      await expect(mintVercelBypassCookie(request, app.origin, 'wrong')).rejects.toThrow('refused the protection bypass')
    } finally {
      await request.dispose()
    }
  })
})

const PLAYWRIGHT_MODULE = String.raw`['"](?:@playwright/test|playwright/test|playwright|playwright-core)['"]`
const BYPASSES_BASE_TEST = [
  new RegExp(String.raw`(?:^|[\n;])\s*(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s*` + PLAYWRIGHT_MODULE),
  new RegExp(String.raw`\brequire\(\s*` + PLAYWRIGHT_MODULE + String.raw`\s*\)`),
  new RegExp(String.raw`\bimport\(\s*` + PLAYWRIGHT_MODULE + String.raw`\s*\)(?!\s*\.\s*[A-Z])`),
]

/** True when source takes a Playwright runtime value without base-test.ts. */
function bypassesBaseTest(source: string): boolean {
  return BYPASSES_BASE_TEST.some((pattern) => pattern.test(source))
}

test('the guard catches every way around base-test.ts', () => {
  for (const source of [
    `import { test, expect } from '@playwright/test'`,
    `import { expect, test } from "@playwright/test"`,
    `import {\n  expect,\n  test,\n} from '@playwright/test'`,
    `import { test } from 'playwright/test'`,
    `import { chromium } from 'playwright'`,
    `import test from '@playwright/test'`,
    `import * as pw from '@playwright/test'`,
    `export * from '@playwright/test'`,
    `export { test } from '@playwright/test'`,
    `const { test } = require('@playwright/test')`,
    `const pw = await import('@playwright/test')`,
  ]) expect(bypassesBaseTest(source), source).toBe(true)
  for (const source of [
    `import { test, expect } from './base-test'`,
    `import type { Page } from '@playwright/test'`,
    `async function f(page: import('@playwright/test').Page) {}`,
  ]) expect(bypassesBaseTest(source), source).toBe(false)
})

test('every e2e file takes Playwright from base-test.ts', () => {
  const direct = (readdirSync(__dirname, { recursive: true }) as string[])
    .map((file) => file.replaceAll('\\', '/'))
    // This spec holds its bypass samples as strings.
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !['base-test.ts', 'vercel-preview-headers.spec.ts'].includes(file))
    .filter((file) => bypassesBaseTest(readFileSync(`${__dirname}/${file}`, 'utf8')))
  expect(direct, 'these files bypass e2e/base-test.ts and its Vercel bypass').toEqual([])
})

test('no Playwright config sends headers to every origin', () => {
  const root = resolve(__dirname, '..')
  const configs = readdirSync(root).filter((file) => /^playwright.*\.config\.[cm]?[jt]s$/.test(file))
  expect(configs).toContain('playwright.config.ts')
  for (const config of configs) {
    expect(readFileSync(`${root}/${config}`, 'utf8'), config).not.toContain('extraHTTPHeaders')
  }
})
