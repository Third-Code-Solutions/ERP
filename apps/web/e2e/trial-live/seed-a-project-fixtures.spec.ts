import { expect, test, type Locator, type Page, type TestInfo } from '../base-test'
import { z } from 'zod'
import { gateTrialLive, openRole, tenantRows, trialTarget, type TrialTarget } from '../helpers/trial-live'

gateTrialLive()

// Seeds run only with grep=@seed (see verify-trial-live.yml). Each one creates its
// fixture through the UI as an E2E role, inside the E2E tenant and project, and only
// when the check that needs it would still find nothing.
const SEED = { tag: '@seed' }
const idRow = z.object({ id: z.string().uuid() })

function present(testInfo: TestInfo, what: string): void {
  testInfo.annotations.push({ type: 'seed', description: `already present: ${what}` })
}

test('seed: an editable budget draft with a whole-centavo line (pr-227)', SEED, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const project = `project_id=eq.${target.projectId}`
  // pr-227 needs a saved amount that renders with a trailing zero decimal, e.g. "1500.00".
  const hasWholeLine = async () => {
    const drafts = await tenantRows(target, 'project_budgets', `${project}&status=eq.draft&select=id`, idRow)
    for (const draft of drafts) {
      const lines = await tenantRows(
        target,
        'project_budget_lines',
        `project_budget_id=eq.${draft.id}&select=amount_cents`,
        z.object({ amount_cents: z.coerce.number() })
      )
      if (lines.some((line) => line.amount_cents > 0 && line.amount_cents % 10 === 0)) return true
    }
    return false
  }
  if (await hasWholeLine()) return present(testInfo, 'a budget draft with a whole-centavo line')

  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto(`/projects/${target.projectId}/cost/budget`)
    const saveDraft = page.getByRole('button', { name: 'Save draft' })
    const createDraft = page.getByRole('button', { name: 'Create draft' })
    const createRevision = page.getByRole('button', { name: 'Create revision' })
    // count() does not wait and the page streams in, so first wait for one of its controls.
    await expect(
      saveDraft.or(createDraft).or(createRevision).first(),
      'the budget page offers Save draft, Create draft or Create revision; a budget pending approval must be decided first'
    ).toBeVisible({ timeout: 15_000 })
    if ((await saveDraft.count()) === 0) {
      if ((await createDraft.count()) > 0) {
        // "Create draft" stays disabled until the tenant has an active Cost Code.
        if (await createDraft.isDisabled()) {
          await page.getByText('Cost Code library').click()
          const codeForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add code' }) })
          await codeForm.getByLabel('Code', { exact: true }).fill('TRIAL-FIX')
          await codeForm.getByLabel('Name', { exact: true }).fill('trial-fixture cost code')
          await codeForm.getByRole('button', { name: 'Add code' }).click()
          await expect(page.getByText('Cost Code created. It is ready for budget and cost allocation.')).toBeVisible()
        }
        await page.getByLabel('Revision reason').fill('trial-fixture budget draft')
        await createDraft.click()
      } else {
        await page.getByPlaceholder('Why is the baseline changing?').fill('trial-fixture budget draft')
        await createRevision.click()
      }
      await expect(saveDraft).toBeVisible({ timeout: 30_000 })
    }
    await page.getByLabel('Baseline amount 1', { exact: true }).fill('1500')
    await saveDraft.click()
    await expect(page.getByText('Draft baseline saved.')).toBeVisible()
    expect(await hasWholeLine(), 'the saved draft has a whole-centavo line').toBe(true)
  } finally {
    await admin.close()
  }
})

const PUNCHLIST_FIXTURE = 'trial-fixture punchlist item'
const punchlistRow = z.object({ id: z.string().uuid(), status: z.string() })
const slaRow = z.object({ id: z.string().uuid(), completed_at: z.string().nullable() })

/** Clicks a control until `done` holds. A click before hydration does nothing, so it retries. */
async function clickUntil(control: Locator, what: string, done: () => Promise<boolean>) {
  if (await done()) return
  await expect(control, `${what} is missing`).toBeVisible({ timeout: 15_000 })
  await expect(async () => {
    if (!(await done())) await control.click({ timeout: 5_000 })
    expect(await done(), `${what} did not take effect`).toBe(true)
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 5_000] })
}

/** Closes the item through its status panel (inspection, then PE sign-off) and proves its SLA clock stopped. */
async function closePunchlistItem(page: Page, target: TrialTarget, id: string) {
  const status = async () =>
    (await tenantRows(target, 'punchlist_items', `id=eq.${id}&select=id,status`, punchlistRow))[0]?.status
  await page.goto(`/punchlist/${id}`)
  if (!['for_inspection', 'closed'].includes((await status()) ?? '')) {
    await clickUntil(
      page.getByRole('button', { name: 'Mark for inspection', exact: true }),
      `"Mark for inspection" on punchlist item ${id}`,
      async () => (await status()) === 'for_inspection'
    )
  }
  await clickUntil(
    page.getByRole('button', { name: /^(PE sign-off & close|Close item)$/ }),
    `"PE sign-off & close" on punchlist item ${id}`,
    async () => (await status()) === 'closed'
  )
  await page.goto(`/punchlist/${id}`)
  await expect(page.getByText('This item is closed. No further transitions available.')).toBeVisible({ timeout: 15_000 })
  const clocks = await tenantRows(
    target,
    'sla_logs',
    `entity_type=eq.punchlist_item&entity_id=eq.${id}&select=id,completed_at`,
    slaRow
  )
  expect(clocks.length, `punchlist item ${id} has an SLA clock`).toBeGreaterThan(0)
  expect(clocks.filter((clock) => clock.completed_at === null), `open SLA clocks on closed punchlist item ${id}`).toEqual([])
}

test('seed: a closed punchlist item on the E2E project (pr-233)', SEED, async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000)
  const target = await trialTarget(testInfo)
  const project = `project_id=eq.${target.projectId}`
  const anyItem = () => tenantRows(target, 'punchlist_items', `${project}&select=id,status&limit=1`, punchlistRow)
  const fixtures = () =>
    tenantRows(target, 'punchlist_items', `${project}&description=eq.${encodeURIComponent(PUNCHLIST_FIXTURE)}&select=id,status`, punchlistRow)
  const create = (await anyItem()).length === 0
  if (!create && (await fixtures()).every((item) => item.status === 'closed')) {
    return present(testInfo, 'a punchlist item on the E2E project, and no open fixture item')
  }

  const admin = await openRole(browser, target, 'admin')
  const { page } = admin
  try {
    if (create) {
      await test.step('create the item', async () => {
        await page.goto(`/punchlist/new?project=${target.projectId}`)
        await expect(page.locator('#punchlist-project_id')).toHaveValue(target.projectId)
        await page.locator('#punchlist-description').fill(PUNCHLIST_FIXTURE)
        await page.getByRole('button', { name: 'Create punchlist item' }).click()
        await expect(page).toHaveURL(/\/punchlist\/[0-9a-f-]{36}$/, { timeout: 30_000 })
      })
    }
  } finally {
    try {
      // An open item runs a due-date SLA clock whose warning emails the tenant's
      // admins and owners, so every fixture item is closed before the seed ends.
      await test.step('close the fixture items', async () => {
        const items = await fixtures()
        expect(items.length, 'the fixture punchlist item exists').toBeGreaterThan(0)
        for (const item of items) await closePunchlistItem(page, target, item.id)
      })
    } finally {
      await admin.close()
    }
  }
})

test('seed: a unit of measure in the E2E tenant (pr-244)', SEED, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const uoms = () => tenantRows(target, 'units_of_measure', 'select=id&limit=1', idRow)
  if ((await uoms()).length > 0) return present(testInfo, 'a unit of measure')

  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto('/inventory')
    await page.locator('#uom-code').fill('TRIAL-FIX')
    await page.locator('#uom-name').fill('trial-fixture unit')
    await page.getByRole('button', { name: 'Add UOM' }).click()
    // The form only resets on success, so read the row back.
    await expect.poll(async () => (await uoms()).length, { timeout: 30_000 }).toBe(1)
  } finally {
    await admin.close()
  }
})

test('seed: a document on the E2E project for the turnover pickers (pr-234)', SEED, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const fileName = 'trial-fixture-document.txt'
  const documents = () =>
    tenantRows(target, 'documents', `project_id=eq.${target.projectId}&select=id&limit=1`, idRow)
  if ((await documents()).length > 0) return present(testInfo, 'a document on the E2E project')

  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto(`/projects/${target.projectId}/documents`)
    // A .txt matches no CAD or extractor format, so /complete only records the document:
    // no scope items, BOM or provider call.
    const complete = page.waitForResponse(
      (r) => r.url().includes('/api/upload/complete') && r.request().method() === 'POST',
      { timeout: 60_000 }
    )
    const chooser = page.waitForEvent('filechooser', { timeout: 30_000 })
    await page.getByTestId('documents-upload-trigger').click()
    await (await chooser).setFiles({
      name: fileName,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('trial-fixture document for the turnover pickers\n'),
    })
    const response = await complete
    expect(response.status(), await response.text()).toBe(200)
    expect(await documents()).toHaveLength(1)
  } finally {
    await admin.close()
  }
})
