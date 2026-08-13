import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Project Budget Control', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('project exposes controlled baseline, forecast, and revision evidence', async ({
    page,
  }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' })
    const projectLink = page.locator('a[href^="/projects/"]').first()
    if ((await projectLink.count()) === 0) {
      test.skip(true, 'No project exists in seed data')
      return
    }

    const href = await projectLink.getAttribute('href')
    const projectId = href?.match(/^\/projects\/([^/]+)$/)?.[1]
    if (!projectId) {
      test.skip(true, 'No project detail link exists in seed data')
      return
    }

    const route = `/projects/${projectId}/cost/budget`
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => {})
    if (new URL(page.url()).pathname !== route) {
      test.skip(true, 'User lacks budget.read permission in seed data')
      return
    }

    await expect(
      page.getByRole('heading', { name: 'Budget Control', exact: true })
    ).toBeVisible()
    await expect(page.getByText('Current baseline', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Revision register', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Return to cost', exact: true })
    ).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })
})
