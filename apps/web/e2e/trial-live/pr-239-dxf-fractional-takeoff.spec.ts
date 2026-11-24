import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '../base-test'
import { z } from 'zod'
import { RUN_ID, gateTrialLive, openRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

// One closed 1 m x 12.3456789 m polyline: 12.3456789 sqm, committed at 4 dp.
const FIXTURE = resolve(__dirname, '../fixtures/trial-live-fractional-area.dxf')
const UPLOAD_HOP = /^\/(?:api\/upload\/(?:sign|complete)$|storage\/v1\/object\/upload\/sign\/)/
const scopeRow = z.object({ id: z.string().uuid(), quantity: z.coerce.number(), quantity_decimal: z.coerce.number() })

test('a DXF with a fractional area produces a fractional takeoff quantity', { tag: '@pr-239' }, async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000)
  const target = await trialTarget(testInfo)
  const layer = `TRIAL-ROOM-${RUN_ID}`
  const description = `Area — Floor Area (${layer})`
  const fileName = `trial-live-${RUN_ID}.dxf`
  const scopeQuery = `project_id=eq.${target.projectId}&description=eq.${encodeURIComponent(description)}&select=id,quantity,quantity_decimal`

  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto(`/projects/${target.projectId}/documents`)
    // The browser signs, uploads to storage, then posts /complete. Record each hop
    // (path only: the storage query carries the upload token) so a stall says where.
    const hops: string[] = []
    const hop = (url: string) => new URL(url).pathname.split('/documents/')[0]
    const isHop = (url: string) => UPLOAD_HOP.test(new URL(url).pathname)
    page.on('response', (r) => {
      if (isHop(r.url())) hops.push(`${r.request().method()} ${hop(r.url())} ${r.status()}`)
    })
    page.on('requestfailed', (q) => {
      if (isHop(q.url())) hops.push(`${q.method()} ${hop(q.url())} failed: ${q.failure()?.errorText ?? 'unknown'}`)
    })
    const complete = page
      .waitForResponse((r) => r.url().includes('/api/upload/complete') && r.request().method() === 'POST', { timeout: 120_000 })
      .catch(() => null)
    // The user's path: the button opens the file chooser, which needs the hydrated click handler.
    const trigger = page.getByTestId('documents-upload-trigger')
    const chooser = page.waitForEvent('filechooser', { timeout: 30_000 })
    await trigger.click()
    await (
      await chooser
    ).setFiles({
      name: fileName,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(readFileSync(FIXTURE, 'utf8').replaceAll('TRIAL-ROOM', layer)),
    })
    const uploadError = trigger.locator('xpath=..').getByRole('alert')
    const failed = uploadError.waitFor({ timeout: 120_000 }).then(
      () => uploadError.innerText(),
      () => null
    )
    const response = await Promise.race([
      complete,
      failed.then((text) => {
        if (text !== null) throw new Error(`upload failed: ${text}; upload requests: ${hops.join(', ') || 'none'}`)
        return complete
      }),
    ])
    if (!response) throw new Error(`no /api/upload/complete response in 120 s; upload requests: ${hops.join(', ') || 'none'}`)
    const body = await response.text()
    expect(response.status(), body).toBe(200)
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
      try {
        if ((await tenantRows(target, 'scope_items', scopeQuery, scopeRow)).length > 0) {
          await page.goto(`/projects/${target.projectId}/scope`)
          const rows = page.getByRole('row').filter({ hasText: description })
          for (let left = await rows.count(); left > 0; left -= 1) {
            await rows.first().getByTitle('Remove item').click()
            await expect(rows).toHaveCount(left - 1)
          }
        }
      } finally {
        // The document row can exist even when /complete or the scope cleanup failed,
        // and deleting it also removes its derived scope rows, so always look for it.
        await page.goto(`/projects/${target.projectId}/documents`)
        const remove = page.getByRole('button', { name: `Delete ${fileName}` })
        if ((await remove.count()) > 0) {
          await remove.click()
          await expect(remove).toHaveCount(0)
        }
      }
      expect(await tenantRows(target, 'scope_items', scopeQuery, scopeRow)).toEqual([])
    } finally {
      await admin.close()
    }
  }
})
