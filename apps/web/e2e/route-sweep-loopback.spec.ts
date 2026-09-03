import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const appRoot = resolve('src/app')
const renderFailure = /Workspace paused before anything changed\.|could not render this view|Application error:|Something went wrong|This (workspace|protected) view could not load|Finance is temporarily unavailable|Could not load users?|Your profile settings could not be loaded|password form could not be loaded|password reset form could not be loaded/i
function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return pages(path)
    if (entry.name !== 'page.tsx') return []
    return ['/' + relative(appRoot, directory).split(/[/\\]/).filter((part) => !part.startsWith('(')).join('/')]
  })
}

async function login(page: Page) {
  await page.goto('/auth/login')
  await page.getByLabel('Email', { exact: true }).fill('kurt@thirdcodesolutions.com')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

test('malformed route identifiers return not found instead of crashing', async ({ page }) => {
  test.setTimeout(900_000)
  await login(page)
  const routes = pages(appRoot).filter((path) => /\[(?:id|assetId|voId)\]/.test(path)).sort((a, b) => Number(b === '/claims/[id]') - Number(a === '/claims/[id]') || a.localeCompare(b))
  expect(routes.length).toBeGreaterThan(40)
  for (const route of routes) {
    await test.step(route, async () => {
      const response = await page.goto(route.replace(/\[[^\]]+\]/g, 'invalid-id'))
      expect(response?.status(), route).toBeLessThan(500)
      await expect(page.getByText('Workspace paused before anything changed.', { exact: true }), route).toHaveCount(0)
      await expect(page.getByText(renderFailure), route).toHaveCount(0)
      await expect(page.getByRole('heading', { name: /We could not find that workspace record|That record or view does not exist/ }), route).toBeVisible()
    })
  }
})

test('static dashboard route sweep renders without an error boundary', async ({ page }) => {
  test.setTimeout(900_000)
  await login(page)
  const routes = pages(join(appRoot, '(dashboard)')).filter((path) => !path.includes('[') && !['/pipeline/board', '/pipeline/conversion'].includes(path)).sort()
  for (const route of routes) {
    await test.step(route, async () => {
      const errors: string[] = []
      const collect = (error: Error) => errors.push(error.message)
      page.on('pageerror', collect)
      try {
        const response = await page.goto(route)
        if (route === '/crm') await page.waitForURL('**/crm/accounts', { waitUntil: 'load' })
        if (route === '/crm/opportunities') await page.waitForURL('**/pipeline', { waitUntil: 'load' })
        expect.soft(response?.status(), route).toBe(200)
        await expect.soft(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible()
        await expect.soft(page.getByText(renderFailure), route).toHaveCount(0)
        expect.soft(errors, route).toEqual([])
      } finally {
        page.off('pageerror', collect)
      }
    })
  }
})

test('project route sweep opens every workspace on a real tenant project', async ({ page }) => {
  test.setTimeout(900_000)
  await login(page)
  await page.goto('/scope')
  const link = await page.getByRole('row').filter({ hasText: 'Browser selector fixture' }).getByRole('link').getAttribute('href')
  expect(link).toMatch(/^\/projects\/[0-9a-f-]+\/scope$/)
  const projectPath = link!.replace(/\/scope$/, '')
  const routes = pages(join(appRoot, '(dashboard)', 'projects', '[id]')).filter((route) => !route.includes('[voId]')).sort()
  for (const route of routes) {
    await test.step(route, async () => {
      const errors: string[] = []
      const collect = (error: Error) => errors.push(error.message)
      page.on('pageerror', collect)
      try {
        const response = await page.goto(route.replace('/projects/[id]', projectPath))
        expect.soft(response?.status(), route).toBe(200)
        await expect.soft(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible()
        await expect.soft(page.getByText(renderFailure), route).toHaveCount(0)
        expect.soft(errors, route).toEqual([])
      } finally {
        page.off('pageerror', collect)
      }
    })
  }
  await page.goto(`${projectPath}/vos/invalid-id`)
  await expect(page.getByRole('heading', { name: 'We could not find that workspace record' })).toBeVisible()
})

test('public portal routes reject unknown bearer tokens without crashing', async ({ page }) => {
  test.setTimeout(600_000)
  const denialHeadings: Record<string, string> = {
    '/portal/bom/[token]': 'Link not found',
    '/portal/cnps/[token]': 'Link not recognised',
    '/portal/project/[token]': 'This link is no longer active',
    '/portal/project/[token]/billing': 'This link is no longer active',
    '/portal/project/[token]/documents': 'This link is no longer active',
    '/portal/project/[token]/photos': 'This link is no longer active',
    '/portal/project/[token]/progress': 'This link is no longer active',
    '/portal/purchase-order/[token]/confirmation': 'Supplier review unavailable',
    '/portal/sign/[token]': 'Link not found',
    '/portal/warranty/[token]': 'Link expired',
  }
  expect(pages(join(appRoot, 'portal')).sort()).toEqual(Object.keys(denialHeadings).sort())
  for (const route of pages(join(appRoot, 'portal')).sort()) {
    await test.step(route, async () => {
      const response = await page.goto(route.replace('[token]', 'unknown-fixture-token'))
      expect.soft(response?.status(), route).toBeLessThan(500)
      await expect.soft(page.getByRole('heading', { name: denialHeadings[route], exact: true }), route).toBeVisible()
      await expect.soft(page.getByText('Browser selector fixture', { exact: true }), route).toHaveCount(0)
      await expect.soft(page.getByText(renderFailure), route).toHaveCount(0)
    })
  }
})

test('public entry routes render and protected pages require sign-in', async ({ page }) => {
  test.setTimeout(300_000)
  for (const route of ['/', ...pages(join(appRoot, '(auth)')).sort()]) {
    const response = await page.goto(route)
    expect.soft(response?.status(), route).toBe(200)
    await expect.soft(page.getByRole('heading', { level: 1 }).first(), route).toBeVisible()
    await expect.soft(page.getByText(renderFailure), route).toHaveCount(0)
  }
  for (const route of ['/projects/invalid-id', '/claims/invalid-id', '/inspection/invalid-id', '/platform-admin']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/auth\/login$/)
  }
})

test('print route renders its report frame and hides the toolbar in print media', async ({ page }) => {
  await login(page)
  const fixture = await page.request.post('http://127.0.0.1:4418/__fixture/weekly-report')
  expect(fixture.ok()).toBe(true)
  const report: { id: string } = await fixture.json()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`/weekly-report/${report.id}`)
  await expect(page.frameLocator('iframe[title="Weekly Report"]').getByText('Local printable fixture evidence', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeHidden()
  expect(errors).toEqual([])
})
