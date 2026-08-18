import { expect, test } from '@playwright/test'
import { requireE2EBaseUrl } from './helpers/env'
import { authenticateRole } from './helpers/supabase-magic-link'

const RUN_CAD_WORKER_TEST = process.env.E2E_MAGIC_LINK_AUTH === '1'
const SEEDED_PROJECT = '11111111-1111-4111-8111-111111111111'

test.describe('production CAD worker wiring', () => {
  test.skip(
    !RUN_CAD_WORKER_TEST,
    'Set E2E_MAGIC_LINK_AUTH=1 to enable authenticated CAD worker QA.'
  )

  test('exposes the live DWG conversion capability in the BOM surface', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000)
    const baseUrl = requireE2EBaseUrl(testInfo.project.use.baseURL)
    const auth = await authenticateRole(page.context(), baseUrl, 'admin')
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    try {
      const response = await page.goto(`/projects/${SEEDED_PROJECT}/bom`, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status() ?? 0).toBe(200)
      await expect(page.getByText('DWG conversion')).toBeVisible()
      await expect(page.getByText('Worker online')).toBeVisible()
      expect((await page.textContent('body')) ?? '').not.toContain('Third Code')
      expect(errors).toEqual([])
    } finally {
      await auth.cleanup()
      await page.context().clearCookies()
    }
  })
})
