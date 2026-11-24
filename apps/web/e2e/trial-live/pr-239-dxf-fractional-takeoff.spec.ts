import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page, type TestInfo } from '../base-test'
import { z } from 'zod'
import { RUN_ID, gateTrialLive, noteNeedsData, openRole, tenantRows, trialTarget, type TrialTarget } from '../helpers/trial-live'

// @pr-239: a fractional DXF area keeps its fraction through takeoff.
// @pr-287: deleting a DXF with committed CAD evidence is refused. Requires production
// web at or after 1f7056be (#287), which ships with the promotion after #287.
gateTrialLive()

// One closed 1 m x 12.3456789 m polyline: 12.3456789 sqm, committed at 4 dp.
const FIXTURE = resolve(__dirname, '../fixtures/trial-live-fractional-area.dxf')
const UPLOAD_HOP = /^\/(?:api\/upload\/(?:sign|complete)$|storage\/v1\/object\/upload\/sign\/)/
const scopeRow = z.object({ id: z.string().uuid(), quantity: z.coerce.number(), quantity_decimal: z.coerce.number() })
const trialDocument = z.object({ id: z.string().uuid(), file_name: z.string() })
const trialScopeItem = z.object({ id: z.string().uuid(), description: z.string() })

const commitRequest = z.object({ id: z.string().uuid() })

// #287: deleting a document with committed CAD evidence is refused with this message.
const CAD_EVIDENCE_REFUSAL = 'Document has committed CAD evidence and cannot be deleted'

const trialDxfDocuments = (target: TrialTarget) =>
  tenantRows(target, 'documents', `project_id=eq.${target.projectId}&file_name=like.trial-live-*.dxf&select=id,file_name`, trialDocument)
const hasCommittedCadEvidence = async (target: TrialTarget, documentId: string) =>
  (await tenantRows(target, 'cad_evidence_commit_requests', `document_id=eq.${documentId}&select=id`, commitRequest)).length > 0

/** "Delete <file>" on a trial-live DXF with committed CAD evidence shows the #287 refusal and keeps the document. */
async function expectCommittedDxfRefused(page: Page, target: TrialTarget, testInfo: TestInfo) {
  let committed: z.infer<typeof trialDocument> | undefined
  for (const doc of await trialDxfDocuments(target)) {
    if (await hasCommittedCadEvidence(target, doc.id)) {
      committed = doc
      break
    }
  }
  if (!committed) return noteNeedsData(testInfo, 'a trial-live DXF with committed CAD evidence on the E2E project')
  await page.goto(`/projects/${target.projectId}/documents`)
  const control = page.getByRole('button', { name: `Delete ${committed.file_name}`, exact: true }).first()
  const refusal = control.locator('xpath=..').getByRole('alert')
  await expect(control, `"Delete ${committed.file_name}" is missing`).toBeVisible({ timeout: 15_000 })
  // A click before hydration does nothing, so click again until the alert shows.
  await expect(async () => {
    if (!(await refusal.isVisible())) await control.click({ timeout: 5_000 })
    await expect(refusal).toHaveText(CAD_EVIDENCE_REFUSAL, { timeout: 5_000 })
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 5_000] })
  expect(
    await tenantRows(target, 'documents', `id=eq.${committed.id}&select=id,file_name`, trialDocument),
    'the refused document is kept'
  ).toHaveLength(1)
}

/**
 * Clicks a delete control until its row is gone. A click before hydration does nothing,
 * so it retries; a missing control fails with its name, a refused delete with the page's alert.
 */
async function clickUntilGone(control: Locator, what: string, gone: () => Promise<boolean>) {
  if (await gone()) return
  await expect(control, `${what} is missing`).toBeVisible({ timeout: 15_000 })
  try {
    await expect(async () => {
      if (!(await gone())) await control.click({ timeout: 5_000 })
      expect(await gone()).toBe(true)
    }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 5_000] })
  } catch (error) {
    const shown = await control.locator('xpath=..').getByRole('alert').allInnerTexts().catch(() => [])
    throw new Error(`${what} did not delete its row; the page shows: ${shown.join(' | ') || 'no alert'}`, { cause: error })
  }
}

/**
 * Removes every TRIAL-ROOM scope row on the E2E project through the UI, then every
 * trial-live DXF document that can go, and proves none of either remain.
 */
async function removeTrialUploads(page: Page, target: TrialTarget, testInfo: TestInfo) {
  const project = `project_id=eq.${target.projectId}`
  const documents = () => trialDxfDocuments(target)
  const scopeItems = () =>
    tenantRows(target, 'scope_items', `${project}&description=like.*TRIAL-ROOM-*&select=id,description`, trialScopeItem)

  for (const item of await scopeItems()) {
    await page.goto(`/projects/${target.projectId}/scope`)
    await clickUntilGone(
      page.getByRole('row').filter({ hasText: item.description }).first().getByTitle('Remove item', { exact: true }),
      `"Remove item" on the scope row "${item.description}"`,
      async () => (await tenantRows(target, 'scope_items', `id=eq.${item.id}&select=id,description`, trialScopeItem)).length === 0
    )
  }
  const retained: string[] = []
  for (const doc of await documents()) {
    // A document whose CAD evidence ERP Core committed is retained on purpose: it is the
    // provenance of its scope items and BOM (cad_evidence_commit_requests_document_tenant_fk).
    // expectCommittedDxfRefused checks that deleting one is refused.
    if (await hasCommittedCadEvidence(target, doc.id)) {
      retained.push(doc.id)
      testInfo.annotations.push({ type: 'retained', description: `${doc.file_name} (${doc.id}): its CAD evidence commit restricts the delete` })
      continue
    }
    await page.goto(`/projects/${target.projectId}/documents`)
    await clickUntilGone(
      page.getByRole('button', { name: `Delete ${doc.file_name}`, exact: true }).first(),
      `"Delete ${doc.file_name}" on the documents page`,
      async () => (await tenantRows(target, 'documents', `id=eq.${doc.id}&select=id,file_name`, trialDocument)).length === 0
    )
  }
  expect(await scopeItems(), 'TRIAL-ROOM scope rows left on the E2E project').toEqual([])
  expect(
    (await documents()).filter((doc) => !retained.includes(doc.id)),
    'deletable trial-live DXF documents left on the E2E project'
  ).toEqual([])
}

test('a DXF with a fractional area produces a fractional takeoff quantity', { tag: ['@pr-239', '@pr-287'] }, async ({ browser }, testInfo) => {
  testInfo.setTimeout(240_000)
  const target = await trialTarget(testInfo)
  const layer = `TRIAL-ROOM-${RUN_ID}`
  const description = `Area — Floor Area (${layer})`
  const fileName = `trial-live-${RUN_ID}.dxf`
  const scopeQuery = `project_id=eq.${target.projectId}&description=eq.${encodeURIComponent(description)}&select=id,quantity,quantity_decimal`

  const admin = await openRole(browser, target, 'admin')
  const { page } = admin
  try {
    await test.step('remove trial-live uploads left by earlier runs', () => removeTrialUploads(page, target, testInfo))

    // Steps keep a failure here in the report when the cleanup below fails too.
    await test.step('upload a fractional DXF and read its takeoff', async () => {
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
    })

    await test.step('deleting a DXF with committed CAD evidence is refused (#287)', () =>
      expectCommittedDxfRefused(page, target, testInfo)
    )
  } finally {
    try {
      await test.step('remove this run\'s upload', () => removeTrialUploads(page, target, testInfo))
    } finally {
      await admin.close()
    }
  }
})
