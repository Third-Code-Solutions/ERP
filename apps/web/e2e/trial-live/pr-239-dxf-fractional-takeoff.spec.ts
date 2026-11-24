import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { RUN_ID, gateTrialLive, openRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

// One closed 1 m x 12.3456789 m polyline: 12.3456789 sqm, committed at 4 dp.
const FIXTURE = resolve(__dirname, '../fixtures/trial-live-fractional-area.dxf')
const scopeRow = z.object({ id: z.string().uuid(), quantity: z.coerce.number(), quantity_decimal: z.coerce.number() })

test('a DXF with a fractional area produces a fractional takeoff quantity', { tag: '@pr-239' }, async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000)
  const target = await trialTarget(testInfo)
  const layer = `TRIAL-ROOM-${RUN_ID}`
  const description = `Area — Floor Area (${layer})`
  const fileName = `trial-live-${RUN_ID}.dxf`
  const scopeQuery = `project_id=eq.${target.projectId}&description=eq.${encodeURIComponent(description)}&select=id,quantity,quantity_decimal`

  const admin = await openRole(browser, target, 'admin')
  let uploaded = false
  try {
    const { page } = admin
    await page.goto(`/projects/${target.projectId}/documents`)
    const complete = page.waitForResponse(
      (response) => response.url().includes('/api/upload/complete') && response.request().method() === 'POST',
      { timeout: 120_000 }
    )
    await page.getByTestId('documents-file-input').setInputFiles({
      name: fileName,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(readFileSync(FIXTURE, 'utf8').replaceAll('TRIAL-ROOM', layer)),
    })
    const response = await complete
    const body = await response.text()
    expect(response.status(), body).toBe(200)
    uploaded = true
    expect(JSON.parse(body)).toMatchObject({
      cadFormat: 'dxf',
      cadResult: { status: 'extracted', detectedFormat: 'dxf', scopeItemsCreated: 1 },
    })

    const rows = await tenantRows(target, 'scope_items', scopeQuery, scopeRow)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ quantity_decimal: 12.3457, quantity: 12 })

    await page.goto(`/projects/${target.projectId}/scope`)
    await expect(page.getByRole('row').filter({ hasText: description })).toContainText('12.3457')
  } finally {
    try {
      const { page } = admin
      if ((await tenantRows(target, 'scope_items', scopeQuery, scopeRow)).length > 0) {
        await page.goto(`/projects/${target.projectId}/scope`)
        const rows = page.getByRole('row').filter({ hasText: description })
        for (let left = await rows.count(); left > 0; left -= 1) {
          await rows.first().getByTitle('Remove item').click()
          await expect(rows).toHaveCount(left - 1)
        }
      }
      if (uploaded) {
        await page.goto(`/projects/${target.projectId}/documents`)
        await page.getByRole('button', { name: `Delete ${fileName}` }).click()
        await expect(page.getByRole('button', { name: `Delete ${fileName}` })).toHaveCount(0)
      }
      expect(await tenantRows(target, 'scope_items', scopeQuery, scopeRow)).toEqual([])
    } finally {
      await admin.close()
    }
  }
})
