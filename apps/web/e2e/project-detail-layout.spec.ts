import { expect, test } from '@playwright/test'
import { requireE2EBaseUrl } from './helpers/env'
import { authenticateRole } from './helpers/supabase-magic-link'

const RUN_PROJECT_LAYOUT_SMOKE = process.env.E2E_MAGIC_LINK_AUTH === '1'

function requireE2EProjectId(): string {
  const projectId = process.env.E2E_PROJECT_ID?.trim()
  if (!projectId) {
    throw new Error(
      'Project layout smoke requires E2E_PROJECT_ID from the isolated test tenant.',
    )
  }
  return projectId
}

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

test.describe('project detail layout', () => {
  test.skip(
    !RUN_PROJECT_LAYOUT_SMOKE,
    'Set E2E_MAGIC_LINK_AUTH=1 to enable the isolated, authenticated layout smoke.'
  )

  test('keeps the project workspace primary and Cortex readable at every viewport', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(180_000)
    const baseUrl = requireE2EBaseUrl(testInfo.project.use.baseURL)
    const projectId = requireE2EProjectId()
    const baseOrigin = new URL(baseUrl).origin
    const isLocalRun = new URL(baseUrl).hostname === 'localhost'
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedResponses: string[] = []
    let expectedLocalNotification503s = 0

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('response', (response) => {
      const responseUrl = new URL(response.url())
      if (
        isLocalRun &&
        responseUrl.origin === baseOrigin &&
        responseUrl.pathname === '/api/notifications' &&
        response.status() === 503
      ) {
        // Local .env.local deliberately excludes ERP_CORE_API_URL. The hosted
        // browser suite covers this endpoint with the deployed Core origin.
        expectedLocalNotification503s += 1
        return
      }
      if (responseUrl.origin === baseOrigin && response.status() >= 400) {
        failedResponses.push(`HTTP ${response.status()} ${responseUrl.pathname}`)
      }
    })

    const auth = await authenticateRole(page.context(), baseUrl, 'admin')

    try {
      for (const viewport of [
        { name: 'desktop', width: 1440, height: 1000 },
        { name: 'mobile', width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        const response = await page.goto(`${baseUrl}/projects/${projectId}`, {
          waitUntil: 'domcontentloaded',
        })
        expect(response?.status(), `${viewport.name} project response`).toBe(200)

        const commandCenter = page.locator(
          'section[aria-labelledby="project-command-center-heading"]'
        )
        const cortexPanel = page.locator('section.cortex-panel')
        await expect(page.locator('h1')).toBeVisible()
        await expect(commandCenter).toBeVisible()
        await expect(cortexPanel).toHaveCount(1)
        await expect(cortexPanel).toBeVisible()
        await expect(cortexPanel).toHaveClass(/cortex-panel--compact/)
        await expect(cortexPanel.locator('.cortex-panel__skeleton')).toHaveCount(0, {
          timeout: 15_000,
        })

        const geometry = await page.evaluate(() => {
          const commandCenter = document.querySelector<HTMLElement>(
            'section[aria-labelledby="project-command-center-heading"]'
          )
          const cortexPanel = document.querySelector<HTMLElement>('section.cortex-panel')
          const relationshipList = document.querySelector<HTMLElement>('.cortex-relationships')
          const projectHeading = document.querySelector<HTMLElement>('h1')
          if (!commandCenter || !cortexPanel || !relationshipList || !projectHeading) {
            return null
          }

          const container = relationshipList.getBoundingClientRect()
          const relationshipOverflow = Array.from(
            relationshipList.querySelectorAll<HTMLElement>('.cortex-relationship')
          ).some((relationship) => {
            const rect = relationship.getBoundingClientRect()
            return rect.left < container.left - 1 || rect.right > container.right + 1
          })
          const relationshipLabels = Array.from(
            relationshipList.querySelectorAll<HTMLElement>('.cortex-relationship')
          ).flatMap((relationship, relationshipIndex) =>
            Array.from(
              relationship.querySelectorAll<HTMLElement>(
                '.cortex-relationship__kind, .cortex-relationship__type, .cortex-relationship__name, .cortex-relationship__origin'
              )
            ).map((element) => ({
              relationshipIndex,
              className: element.className,
              rect: element.getBoundingClientRect(),
            }))
          )
          const relationshipCollisions = relationshipLabels.flatMap((label, index) =>
            relationshipLabels.slice(index + 1).flatMap((other) => {
                if (label.relationshipIndex === other.relationshipIndex) return []
                const horizontalOverlap =
                  Math.max(label.rect.left, other.rect.left) <
                  Math.min(label.rect.right, other.rect.right) - 1
                const verticalOverlap =
                  Math.max(label.rect.top, other.rect.top) <
                  Math.min(label.rect.bottom, other.rect.bottom) - 1
                return horizontalOverlap && verticalOverlap
                  ? [
                      {
                        first: {
                          relationshipIndex: label.relationshipIndex,
                          className: label.className,
                          top: Math.round(label.rect.top),
                          bottom: Math.round(label.rect.bottom),
                        },
                        second: {
                          relationshipIndex: other.relationshipIndex,
                          className: other.className,
                          top: Math.round(other.rect.top),
                          bottom: Math.round(other.rect.bottom),
                        },
                      },
                    ]
                  : []
              })
          )

          return {
            commandCenter: commandCenter.getBoundingClientRect().toJSON(),
            cortexPanel: cortexPanel.getBoundingClientRect().toJSON(),
            relationshipGridTemplateColumns: getComputedStyle(relationshipList).gridTemplateColumns,
            relationshipItemBounds: Array.from(
              relationshipList.querySelectorAll<HTMLElement>(':scope > li')
            ).map((item) => {
              const rect = item.getBoundingClientRect()
              return {
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
              }
            }),
            relationshipOverflow,
            relationshipMetadataCollision: relationshipCollisions.length > 0,
            relationshipCollisions,
            pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
            projectHeadingOverflow: projectHeading.scrollWidth - projectHeading.clientWidth,
          }
        })

        expect(geometry, `${viewport.name} expected project and Cortex regions`).not.toBeNull()
        expect(geometry?.pageOverflow, `${viewport.name} page overflow`).toBeLessThanOrEqual(1)
        expect(
          geometry?.projectHeadingOverflow,
          `${viewport.name} project title must not be clipped`
        ).toBeLessThanOrEqual(1)
        expect(geometry?.relationshipOverflow, `${viewport.name} Cortex card overflow`).toBe(false)
        expect(
          geometry?.relationshipMetadataCollision,
          `${viewport.name} Cortex relationship labels collide: ${JSON.stringify(
            {
              collisions: geometry?.relationshipCollisions,
              columns: geometry?.relationshipGridTemplateColumns,
              items: geometry?.relationshipItemBounds,
            }
          )}`
        ).toBe(false)

        if (viewport.name === 'desktop') {
          expect(
            geometry?.commandCenter.width,
            'desktop primary workspace should remain wider than its supporting context panel'
          ).toBeGreaterThan(geometry?.cortexPanel.width ?? Number.POSITIVE_INFINITY)
        }

        await page.screenshot({
          path: testInfo.outputPath(`project-detail-${viewport.name}.png`),
          fullPage: true,
        })
      }

      const unexpectedConsoleErrors = [...consoleErrors]
      for (let index = 0; index < expectedLocalNotification503s; index += 1) {
        const expectedError =
          'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
        const errorIndex = unexpectedConsoleErrors.indexOf(expectedError)
        if (errorIndex >= 0) unexpectedConsoleErrors.splice(errorIndex, 1)
      }

      expect(failedResponses, `Failed same-origin responses:\n${failedResponses.join('\n')}`).toEqual([])
      expect(
        unexpectedConsoleErrors,
        `Console errors:\n${unexpectedConsoleErrors.join('\n')}`
      ).toEqual([])
      expect(pageErrors, `Page errors:\n${pageErrors.join('\n')}`).toEqual([])
    } finally {
      try {
        await auth.cleanup()
      } finally {
        await page.context().clearCookies()
      }
    }
  })
})
