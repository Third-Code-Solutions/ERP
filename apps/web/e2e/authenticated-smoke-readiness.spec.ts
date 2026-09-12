import { createServer, type Server } from 'node:http'
import { test, expect } from '@playwright/test'
import { assertAuthenticatedSmokeReady } from './helpers/authenticated-smoke-readiness'

let server: Server
let baseUrl: string
const content = 'Substantive content that would satisfy the old smoke body-length check. '.repeat(3)

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (path === '/login-redirect') {
      response.writeHead(302, { location: '/auth/login' }).end()
      return
    }
    if (path === '/pipeline/list') {
      response.writeHead(302, { location: '/pipeline?other=ok&view=list' }).end()
      return
    }
    const shell = path === '/delayed-login' || path === '/delayed-canonical'
    const landmark = path !== '/auth/login' && path !== '/missing' && !shell
    const target = path === '/delayed-login' ? '/auth/login' : '/pipeline?view=list'
    response.writeHead(200, { 'content-type': 'text/html' }).end(
      `<main${landmark ? ' id="main-content"' : ''}><h1>Fixture</h1><p>${content}</p>` +
      (shell ? `<button onclick="location.assign('${target}')">Resolve route</button>` : '') + '</main>',
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind')
  baseUrl = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})

test('rejects a healthy login redirect that passes the old response and body checks', async ({ page }) => {
  const response = await page.goto(`${baseUrl}/login-redirect`)
  expect(response?.status()).toBe(200)
  expect((await page.locator('body').innerText()).length).toBeGreaterThan(100)
  await expect(assertAuthenticatedSmokeReady(page, baseUrl, '/login-redirect', 500)).rejects.toThrow()
})

test('rejects a delayed login redirect after observing a substantive intermediate shell', async ({ page }) => {
  await page.goto(`${baseUrl}/delayed-login`)
  expect((await page.locator('body').innerText()).length).toBeGreaterThan(100)
  const result = assertAuthenticatedSmokeReady(page, baseUrl, '/delayed-login', 1_000).then(() => 'accepted', () => 'rejected')
  await page.getByRole('button', { name: 'Resolve route' }).click()
  await expect(page).toHaveURL(`${baseUrl}/auth/login`)
  expect(await result).toBe('rejected')
})

test('accepts a normal authenticated destination with query parameters and trailing slash', async ({ page }) => {
  await page.goto(`${baseUrl}/projects/?q=sample`)
  await assertAuthenticatedSmokeReady(page, baseUrl, '/projects?q=sample')
})

test('accepts the explicit canonical pipeline redirect', async ({ page }) => {
  await page.goto(`${baseUrl}/pipeline/list`)
  await assertAuthenticatedSmokeReady(page, baseUrl, '/pipeline/list')
})

test('waits for canonical destination and landmark instead of accepting the intermediate shell', async ({ page }) => {
  await page.goto(`${baseUrl}/delayed-canonical`)
  const result = assertAuthenticatedSmokeReady(page, baseUrl, '/pipeline/list', 2_000)
  await page.getByRole('button', { name: 'Resolve route' }).click()
  await result
  expect(new URL(page.url()).pathname).toBe('/pipeline')
})

for (const scenario of [
  { name: 'wrong destination', actual: '/wrong', requested: '/projects' },
  { name: 'missing authenticated landmark', actual: '/missing', requested: '/missing' },
  { name: 'wrong canonical query', actual: '/pipeline?view=board', requested: '/pipeline/list' },
  { name: 'changed requested query', actual: '/projects?q=other', requested: '/projects?q=sample' },
]) {
  test(`rejects ${scenario.name}`, async ({ page }) => {
    await page.goto(baseUrl + scenario.actual)
    await expect(assertAuthenticatedSmokeReady(page, baseUrl, scenario.requested, 500)).rejects.toThrow()
  })
}

test('rejects a different origin even with the correct path and landmark', async ({ page }) => {
  await page.goto(`${baseUrl}/projects`)
  await expect(assertAuthenticatedSmokeReady(page, 'http://localhost:1', '/projects', 500)).rejects.toThrow()
})
