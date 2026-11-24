import { readdirSync, readFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from 'node:http'
import { test, expect } from './base-test'

const SECRET = 'e2e-header-scope-check'
const VERCEL_HEADERS = ['x-vercel-protection-bypass', 'x-vercel-skip-toolbar']

async function listen(handler: RequestListener): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

const close = (server: Server) =>
  new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))

test('Vercel preview headers reach the app origin and never another origin', async ({ browser }) => {
  const appHeaders: IncomingHttpHeaders[] = []
  const foreignHeaders: IncomingHttpHeaders[] = []
  // Answers CORS the way Sentry ingest does: only content-type is allowed.
  const foreign = await listen((request, response) => {
    foreignHeaders.push(request.headers)
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': 'content-type',
    }).end('{}')
  })
  const app = await listen((request, response) => {
    appHeaders.push(request.headers)
    response.writeHead(200, { 'content-type': 'text/html' }).end(
      `<script>fetch('${foreign.origin}/api/1/envelope/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })` +
      `.then((r) => console.log('foreign ' + r.status), (e) => console.log('foreign failed ' + e))</script>`,
    )
  })
  const previous = process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET
  process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET = SECRET
  try {
    // The built-in context fixture creates its context through this same call.
    const context = await browser.newContext({ baseURL: app.origin })
    const page = await context.newPage()
    const consoleErrors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    const foreignResult = page.waitForEvent('console', (message) => message.text().startsWith('foreign'))
    await page.goto('/')

    expect((await foreignResult).text()).toBe('foreign 200')
    expect(consoleErrors).toEqual([])
    expect(appHeaders[0]?.['x-vercel-protection-bypass']).toBe(SECRET)
    expect(appHeaders[0]?.['x-vercel-skip-toolbar']).toBe('1')
    expect(foreignHeaders.length).toBeGreaterThan(0)
    for (const headers of foreignHeaders) {
      for (const name of VERCEL_HEADERS) {
        expect(headers[name], `${name} sent cross-origin`).toBeUndefined()
        expect(headers['access-control-request-headers'] ?? '', `${name} in a preflight`).not.toContain(name)
      }
    }
    await context.close()
  } finally {
    if (previous === undefined) delete process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET
    else process.env.E2E_VERCEL_PROTECTION_BYPASS_SECRET = previous
    await Promise.all([close(app.server), close(foreign.server)])
  }
})

// Any file that takes test from @playwright/test skips the per-origin headers.
test('every e2e file takes test from base-test.ts', () => {
  const direct = (readdirSync(__dirname, { recursive: true }) as string[])
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.ts') && file !== 'base-test.ts')
    .filter((file) => /import\s*\{[^}]*\btest\b[^}]*\}\s*from '@playwright\/test'/.test(readFileSync(`${__dirname}/${file}`, 'utf8')))
  expect(direct, 'these files bypass e2e/base-test.ts and its per-origin Vercel headers').toEqual([])
})
