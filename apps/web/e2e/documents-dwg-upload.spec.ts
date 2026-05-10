import { existsSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

/**
 * Realistic CAD upload flow against a known project.
 *
 * Run (example):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3002 \
 *   E2E_PROJECT_ID=08ab6e94-2374-4a7f-8d62-8919ba3d1c09 \
 *   E2E_CAD_FILE=/Users/hoon/Downloads/Pond-to-CAD.dwg \
 *   E2E_USER_EMAIL=test@buildops.local \
 *   E2E_USER_PASSWORD=testpassword123 \
 *   pnpm --filter @buildops/web test:e2e -- e2e/documents-dwg-upload.spec.ts
 *
 * Binary DWG may finish as "extracted" (inline/synchronous path) or
 * "binary-dwg-pending" (queued) — both count as success if the file lands in the table.
 */
const PROJECT_ID =
  process.env.E2E_PROJECT_ID ?? '08ab6e94-2374-4a7f-8d62-8919ba3d1c09'
const CAD_FILE =
  process.env.E2E_CAD_FILE ?? '/Users/hoon/Downloads/Pond-to-CAD.dwg'

test.describe('Project documents — DWG upload (real file)', () => {
  test.describe.configure({ timeout: 240_000 })

  test.beforeEach(async ({ page }) => {
    test.skip(!existsSync(CAD_FILE), `Missing CAD file: ${CAD_FILE}`)
    await login(page)
  })

  test('uploads DWG to project documents and shows it in the list', async ({
    page,
  }) => {
    await page.goto(`/projects/${PROJECT_ID}/documents`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('documents-upload-trigger')).toBeVisible()

    const baseName = CAD_FILE.split('/').pop() ?? 'Pond-to-CAD.dwg'

    const completeResp = page.waitForResponse(
      (res) =>
        res.url().includes('/api/upload/complete') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 180_000 }
    )

    await page.getByTestId('documents-file-input').setInputFiles(CAD_FILE)

    const uploaded = await completeResp
    const body = (await uploaded.json()) as { id?: string; error?: string }
    if (!body?.id) {
      throw new Error(
        `upload/complete missing id: ${body?.error ?? JSON.stringify(body)}`
      )
    }

    await expect(page.getByText(baseName).first()).toBeVisible({ timeout: 60_000 })
    // The same DWG may have been uploaded multiple times across runs; assert
    // that *at least one* row matches.
    const rowMatcher = new RegExp(baseName.replace('.', '\\.'))
    await expect(page.getByRole('row', { name: rowMatcher }).first()).toBeVisible()
    const rowCount = await page.getByRole('row', { name: rowMatcher }).count()
    expect(rowCount).toBeGreaterThanOrEqual(1)

    // Surface server's status to the test log for visibility — both
    // "extracted" and "binary-dwg-pending" are acceptable success states.
    type CompletePayload = {
      id: string
      cadFormat: 'dxf' | 'dwg' | null
      cadResult?: {
        status: string
        detectedFormat: string
        dwgVersion: string | null
        scopeItemsCreated: number
      }
    }
    const payload = body as CompletePayload
    if (payload.cadResult) {
      const r = payload.cadResult
      console.log(
        `[upload result] status=${r.status} detected=${r.detectedFormat}` +
          ` dwg_version=${r.dwgVersion ?? 'n/a'} scope_items=${r.scopeItemsCreated}`
      )
    }
  })
})
