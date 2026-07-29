import { expect, test } from '@playwright/test'

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

test.describe.configure({ timeout: 90_000 })

test('validates the consolidated public frontend candidate', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.setViewportSize({ width: 1440, height: 1000 })
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' })

  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(
    'Construction ERP with a permission-aware AI brain'
  )
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Run every project with an AI brain that remembers.',
    })
  ).toBeVisible()

  const canonical = page.locator('link[rel="canonical"]')
  await expect(canonical).toHaveAttribute(
    'href',
    'https://thirdcode-erp.vercel.app'
  )
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'index, follow'
  )

  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluate((element) => JSON.parse(element.textContent ?? '{}'))
  expect(structuredData['@context']).toBe('https://schema.org')
  expect(
    structuredData['@graph'].map(
      (entry: { '@type': string }) => entry['@type']
    )
  ).toEqual(['Organization', 'SoftwareApplication', 'FAQPage'])

  const understandButton = page
    .locator('button[aria-expanded]')
    .filter({ hasText: 'Understand context' })
  expect(await understandButton.count()).toBe(1)
  await expect(understandButton).toHaveAttribute('aria-expanded', 'false')
  await understandButton.click()
  await expect(understandButton).toHaveAttribute('aria-expanded', 'true')

  const priorityQuote = page.locator('blockquote')
  const firstQuote = await priorityQuote.innerText()
  const nextPriority = page.getByRole('button', {
    name: 'Next team priority',
  })
  await nextPriority.click()
  await expect(priorityQuote).not.toHaveText(firstQuote)

  const firstQuestion = page
    .locator('summary')
    .filter({ hasText: 'What does Third Code ERP connect?' })
  expect(await firstQuestion.count()).toBe(1)
  await firstQuestion.click()
  await expect(
    page.getByText(
      'Pipeline, proposals, drawings, scope, BOMs, procurement, site execution, cost, claims, billing, turnover, warranty, documents, decisions, and audit history share one connected project record.'
    )
  ).toBeVisible()

  const heroSetup = page.locator('[data-analytics="hero-guided-setup"]')
  await expect(heroSetup).toHaveAttribute('href', '/auth/signup')
  const workspaceLink = page.getByRole('link', { name: 'Open workspace' })

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 768, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      heroLines: [...document.querySelectorAll('h1 > span')].map(
        (line) => ({
          height: line.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(line).lineHeight),
        })
      ),
    }))

    expect(layout.overflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1)
    expect(layout.heroLines).toHaveLength(3)
    for (const line of layout.heroLines) {
      expect(
        line.height / line.lineHeight,
        `${viewport.name} wrapped hero line`
      ).toBeLessThanOrEqual(1.2)
    }

    if (viewport.name === 'mobile') {
      const targetHeights = await Promise.all(
        [heroSetup, workspaceLink, nextPriority].map((target) =>
          target.evaluate((element) =>
            Math.round(element.getBoundingClientRect().height)
          )
        )
      )
      for (const height of targetHeights) {
        expect(height, 'mobile interactive target height').toBeGreaterThanOrEqual(
          44
        )
      }
    }

    if (viewport.name !== 'tablet') {
      await page.screenshot({
        path: testInfo.outputPath(`frontend-release-${viewport.name}.png`),
        fullPage: true,
      })
    }
  }

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
