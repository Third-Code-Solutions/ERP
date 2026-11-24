import { expect, test } from './fixtures'
import { authenticateRole } from './helpers/supabase-magic-link'

test.skip(process.env.E2E_THEME_MODE !== '1', 'Set E2E_THEME_MODE=1 for demo-tenant theme QA.')

async function expectDarkSurface(locator: import('@playwright/test').Locator): Promise<void> {
  const background = await locator.evaluate((element) =>
    getComputedStyle(element).backgroundColor
  )
  const channels = background.match(/^rgb\((\d+), (\d+), (\d+)\)$/)
  expect(channels, `Expected an opaque RGB surface, received ${background}`).not.toBeNull()
  expect(Number(channels?.[1])).toBeLessThan(100)
  expect(Number(channels?.[2])).toBeLessThan(100)
  expect(Number(channels?.[3])).toBeLessThan(100)
}

test('dashboard theme persists across reload, navigation, and mobile layout', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000)
  const baseUrl = testInfo.project.use.baseURL
  expect(baseUrl).toBeTruthy()
  const session = await authenticateRole(page.context(), baseUrl!, 'viewer')

  try {
    await page.goto('/dashboard')
    const shell = page.locator('.app-layout')
    await expect(shell).toHaveAttribute('data-theme', 'light')
    const lightCanvas = await shell.evaluate((element) =>
      getComputedStyle(element).backgroundColor
    )

    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(shell).toHaveAttribute('data-theme', 'dark')
    const darkCanvas = await shell.evaluate((element) =>
      getComputedStyle(element).backgroundColor
    )
    expect(darkCanvas).not.toBe(lightCanvas)
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
    await expectDarkSurface(page.locator('.workspace-sidebar'))
    await expectDarkSurface(page.locator('.app-topbar'))

    await page.reload()
    await expect(shell).toHaveAttribute('data-theme', 'dark')
    await page.goto('/projects')
    await expect(shell).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('h1')).toContainText('Projects')
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible()
    await expectDarkSurface(page.getByRole('article').first())

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(shell).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(shell).toHaveAttribute('data-theme', 'light')
  } finally {
    await session.cleanup()
  }
})

test('major workspaces preserve dark surfaces', async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000)
  const baseUrl = testInfo.project.use.baseURL
  expect(baseUrl).toBeTruthy()
  const session = await authenticateRole(page.context(), baseUrl!, 'admin')
  await page.context().addCookies([{ name: 'erp_theme', value: 'dark', url: baseUrl! }])

  try {
    for (const route of ['/bom', '/purchase-orders', '/finance']) {
      await page.goto(route)
      await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark')
      await expectDarkSurface(page.locator('.workspace-sidebar'))
      await expectDarkSurface(page.locator('.app-topbar'))
      await page.locator('.app-content h1').first().waitFor()
      if (route === '/purchase-orders') {
        await expectDarkSurface(page.getByText('Committed', { exact: true }).locator('..'))
      }
    }
  } finally {
    await session.cleanup()
  }
})

test('dark selection follows department navigation', async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000)
  const baseUrl = testInfo.project.use.baseURL
  expect(baseUrl).toBeTruthy()
  const session = await authenticateRole(page.context(), baseUrl!, 'admin')
  await page.context().addCookies([{ name: 'erp_theme', value: 'dark', url: baseUrl! }])

  try {
    for (const route of [
      '/pipeline',
      '/crm/accounts',
      '/procurement',
      '/claims',
      '/invoices',
      '/reports',
      '/settings',
      '/admin/users',
      '/admin/material-items',
    ]) {
      await page.goto(route)
      await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark')
      await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
      await expectDarkSurface(page.locator('.workspace-sidebar'))
      await expectDarkSurface(page.locator('.app-topbar'))
    }
  } finally {
    await session.cleanup()
  }
})
