import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

const ENABLED = process.env.E2E_CONTROLLED_UPLOAD === '1'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const PROJECT_ID =
  process.env.E2E_PROJECT_ID ?? '08ab6e94-2374-4a7f-8d62-8919ba3d1c09'
const FIXTURE = resolve(
  __dirname,
  '..',
  'public',
  'samples',
  'mep-sample.dxf'
)
const SIGNED_STORAGE_PATH = `${PROJECT_ID}/controlled-plan.dxf`

const LOCAL_BASE_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/

test.describe('controlled project document upload', () => {
  test.describe.configure({ timeout: 90_000 })
  test.skip(!ENABLED, 'Set E2E_CONTROLLED_UPLOAD=1 to enable this local fixture.')
  test.skip(
    !LOCAL_BASE_URL.test(BASE_URL),
    'Controlled upload fixture only runs against localhost/127.0.0.1.'
  )

  test('shows progress and terminal Core warning without provider traffic', async ({
    page,
  }) => {
    const observed = {
      sign: 0,
      storageUpload: 0,
      complete: 0,
      unexpectedStorage: [] as string[],
    }
    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))

    // Reject every unrecognised Storage request. This prevents a missing route
    // stub from quietly reaching a real Supabase/object-storage endpoint.
    await page.route('**/storage/v1/**', async (route) => {
      const url = route.request().url()
      if (
        route.request().method() !== 'PUT' ||
        !url.includes('/storage/v1/object/upload/sign/')
      ) {
        observed.unexpectedStorage.push(url)
        await route.abort()
        return
      }

      observed.storageUpload += 1
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Key: SIGNED_STORAGE_PATH }),
      })
    })

    await page.route('**/api/upload/sign', async (route) => {
      observed.sign += 1
      const requestBody = JSON.parse(route.request().postData() ?? '{}') as {
        projectId?: string
        fileName?: string
        sizeBytes?: number
      }
      expect(requestBody).toMatchObject({
        projectId: PROJECT_ID,
        fileName: 'mep-sample.dxf',
      })
      expect(requestBody.sizeBytes).toBeGreaterThan(0)
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signedUrl: `${BASE_URL}/storage/v1/object/upload/sign/documents/${SIGNED_STORAGE_PATH}`,
          token: 'controlled-storage-token',
          storagePath: SIGNED_STORAGE_PATH,
        }),
      })
    })

    await page.route('**/api/upload/complete', async (route) => {
      observed.complete += 1
      const requestBody = JSON.parse(route.request().postData() ?? '{}') as {
        projectId?: string
        storagePath?: string
        fileName?: string
      }
      expect(requestBody).toMatchObject({
        projectId: PROJECT_ID,
        storagePath: SIGNED_STORAGE_PATH,
        fileName: 'mep-sample.dxf',
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '44444444-4444-4444-8444-444444444444',
          storagePath: SIGNED_STORAGE_PATH,
          documentType: 'dxf',
          cadFormat: 'dxf',
          cadParseQueued: false,
          cadParseWarning: 'ERP Core API is unavailable',
          cadResult: {
            status: 'processing-unavailable',
            scopeItemsCreated: 0,
            warnings: ['ERP Core API is unavailable'],
            layerCount: 1,
            entityCount: 2,
            detectedFormat: 'dxf',
            dwgVersion: null,
            extensionMismatch: false,
            message:
              'CAD parsed. No scope items were committed because ERP Core rejected the evidence.',
            bomId: null,
            bomTcvCents: 0,
            bomCostCents: 0,
            bomGpMarginBps: 0,
            ragMatches: 0,
            aiEstimateMatches: 0,
          },
        }),
      })
    })

    await login(page)
    const response = await page.goto(`/projects/${PROJECT_ID}/documents`, {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('documents-upload-trigger')).toBeVisible()

    await page.getByTestId('documents-file-input').setInputFiles(FIXTURE)
    await expect(page.getByText('Preparing upload…')).toBeVisible()
    await expect(page.getByText(/Uploading .* to storage…/)).toBeVisible()
    await expect(page.getByText('Finalizing…')).toBeVisible()
    await expect(
      page.getByText(
        'CAD parsed. No scope items were committed because ERP Core rejected the evidence.'
      )
    ).toBeVisible()
    await expect(page.getByText('ERP Core API is unavailable')).toBeVisible()

    expect(observed.sign).toBe(1)
    expect(observed.storageUpload).toBe(1)
    expect(observed.complete).toBe(1)
    expect(observed.unexpectedStorage).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
