import { expect, test, type Page } from '@playwright/test'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

for (const viewport of viewports) {
  test(`${viewport.name}: keeps closed rollout non-spending`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors = captureBrowserErrors(page)
    let apiRequests = 0
    await page.route('**/api/cortex/semantic-index-jobs**', async (route) => {
      apiRequests += 1
      await route.abort('blockedbyclient')
    })

    await page.goto('/?enabled=false')
    const button = page.getByRole('button', {
      name: 'Semantic indexing paused',
    })
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveAttribute(
      'title',
      'Semantic indexing rollout is paused'
    )
    expect(apiRequests).toBe(0)
    expect(errors).toEqual([])
  })

  test(`${viewport.name}: confirms one bounded job and reports completion`, async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(30_000)
    await page.setViewportSize(viewport)
    const errors = captureBrowserErrors(page)
    const foreignRequests: string[] = []
    let postRequests = 0
    let statusRequests = 0

    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.hostname !== '127.0.0.1' || url.port !== '4317') {
        foreignRequests.push(request.url())
      }
    })

    await page.route('**/api/cortex/semantic-index-jobs', async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') {
        await route.fallback()
        return
      }
      postRequests += 1
      expect(request.postDataJSON()).toEqual({
        maxNodes: 64,
        costConsent: true,
      })
      expect(request.headers()['idempotency-key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: JOB_ID,
          status: 'queued',
          backlogAtRequest: 64,
          maxNodes: 64,
          createdAt: '2026-08-07T00:00:00.000Z',
        }),
      })
    })

    await page.route(
      `**/api/cortex/semantic-index-jobs/${JOB_ID}`,
      async (route) => {
        statusRequests += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jobId: JOB_ID,
            status: statusRequests === 1 ? 'processing' : 'succeeded',
            backlogAtRequest: 64,
            maxNodes: 64,
            processedNodes: statusRequests === 1 ? 0 : 64,
            attempts: 1,
            providerCalls: statusRequests === 1 ? 0 : 1,
            failureCode: null,
            createdAt: '2026-08-07T00:00:00.000Z',
            updatedAt: '2026-08-07T00:00:01.000Z',
          }),
        })
      }
    )

    await page.goto('/?enabled=true')
    const button = page.getByRole('button', {
      name: 'Index up to 64 records',
    })
    await expect(button).toBeEnabled()
    await button.click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Build one semantic index batch?')
    await expect(dialog).toContainText('up to 64 records')
    await expect(dialog).toContainText(
      'at most one external embedding-provider call'
    )
    await expect(dialog).toContainText(
      'Another batch always needs another approval'
    )

    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width)
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height)

    if (viewport.name === 'mobile') {
      for (const action of ['Cancel', 'Approve 1 provider call']) {
        const box = await page.getByRole('button', { name: action }).boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(44)
      }
    }

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
    expect(postRequests).toBe(0)
    expect(statusRequests).toBe(0)

    await button.click()
    await page.getByRole('button', { name: 'Approve 1 provider call' }).click()
    await expect(page.getByRole('button', { name: 'Index queued' })).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Indexing up to 64 records…' })
    ).toBeDisabled({ timeout: 5_000 })
    await expect(
      page.getByRole('button', { name: 'Indexed 64 records' })
    ).toBeEnabled({ timeout: 5_000 })

    expect(postRequests).toBe(1)
    expect(statusRequests).toBe(2)
    expect(foreignRequests).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])

    await page.screenshot({
      path: testInfo.outputPath(`cortex-index-${viewport.name}-complete.png`),
      fullPage: true,
    })
  })
}

test('desktop: reports terminal failure without automatic resubmission', async ({
  page,
}) => {
  await page.setViewportSize(viewports[0])
  const errors = captureBrowserErrors(page)
  let postRequests = 0
  let statusRequests = 0

  await page.route('**/api/cortex/semantic-index-jobs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    postRequests += 1
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId: JOB_ID,
        status: 'queued',
        backlogAtRequest: 1,
        maxNodes: 64,
        createdAt: '2026-08-07T00:00:00.000Z',
      }),
    })
  })
  await page.route(
    `**/api/cortex/semantic-index-jobs/${JOB_ID}`,
    async (route) => {
      statusRequests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: JOB_ID,
          status: 'failed',
          backlogAtRequest: 1,
          maxNodes: 64,
          processedNodes: 0,
          attempts: 1,
          providerCalls: 1,
          failureCode: 'provider_call_outcome_unknown',
          createdAt: '2026-08-07T00:00:00.000Z',
          updatedAt: '2026-08-07T00:00:01.000Z',
        }),
      })
    }
  )

  await page.goto('/?enabled=true')
  await page.getByRole('button', { name: 'Index up to 64 records' }).click()
  await page.getByRole('button', { name: 'Approve 1 provider call' }).click()
  await expect(page.getByText('Semantic indexing did not complete.')).toBeVisible({
    timeout: 5_000,
  })
  await expect(
    page.getByRole('button', { name: 'Index up to 64 records' })
  ).toBeEnabled()
  expect(postRequests).toBe(1)
  expect(statusRequests).toBe(1)
  expect(errors).toEqual([])
})
