import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('projects list page loads', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.locator('h1')).toContainText('Projects')
  })

  test('new project page renders form fields', async ({ page }) => {
    await page.goto('/projects/new')
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('select[name="status"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('create project form requires name', async ({ page }) => {
    await page.goto('/projects/new')
    // Try submitting without filling required fields
    await page.click('button[type="submit"]')
    // HTML5 validation or server error should prevent navigation
    await expect(page).toHaveURL(/projects\/new/)
  })

  test('create and view a project', async ({ page }) => {
    await page.goto('/projects/new')
    const projectName = `E2E Test Project ${Date.now()}`
    await page.fill('input[name="name"]', projectName)
    await page.selectOption('select[name="status"]', 'active')
    await page.fill('input[name="client"]', 'E2E Client')
    await page.click('button[type="submit"]')

    // Should redirect to the new project
    await expect(page).toHaveURL(/projects\/[a-f0-9-]+$/)
    await expect(page.locator('h1, [data-testid="project-name"]').first()).toContainText(projectName)
  })
})
