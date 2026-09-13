import { expect, test } from '@playwright/test'
import { basename, join, resolve, sep } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const CODE_ID = '11111111-1111-4111-8111-111111111111'
const LINE_ID = '22222222-2222-4222-8222-222222222222'
const BUDGET_ID = '55555555-5555-4555-8555-555555555555'
const OTHER_BUDGET_ID = '88888888-8888-4888-8888-888888888888'
const REVISION_ID = '66666666-6666-4666-8666-666666666666'
const APPROVER_ID = '99999999-9999-4999-8999-999999999999'

type WorkflowOperation =
  | 'submit'
  | 'commercial'
  | 'finance'
  | 'reject'
  | 'revise'

type WorkflowStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'superseded'

type WorkflowResponse =
  | {
      ok: true
      id: string
      receipt: {
        projectId: string
        sourceBudgetId: string
        operation: WorkflowOperation
        resultBudgetId: string
        status: WorkflowStatus
        requestId?: string
      }
      refreshWarning?: string
    }
  | { error: string; unconfirmed?: boolean }

type PanelProps = {
  projectId: string
  canViewBom: boolean
  canManage: boolean
  canCommercialApprove: boolean
  canFinanceApprove: boolean
  ownerOverride?: boolean
  draft: {
    id: string
    revision: number
    sourceBomId: string | null
    controlMode: 'monitor' | 'warn' | 'block'
    toleranceBps: number
    currency: string
    effectiveFrom: string
    reason: string
    lines: Array<{
      id: string
      costCodeId: string
      bomLineItemId: string | null
      description: string
      amountCents: number
    }>
  } | null
  pendingBudget: {
    id: string
    revision: number
    commercialApprovedBy: string | null
    financeApprovedBy: string | null
  } | null
  approvedBudget: { id: string; revision: number } | null
  codes: Array<{ id: string; code: string; name: string; category: string }>
  sourceBoms: Array<{ id: string; label: string }>
  bomLines: Array<{ id: string; bomId: string; label: string }>
}

type BrowserBridge = {
  submitRequests: Array<{ projectId: string; budgetId: string }>
  approveRequests: Array<{
    projectId: string
    budgetId: string
    lane: 'commercial' | 'finance'
  }>
  rejectRequests: Array<{
    projectId: string
    budgetId: string
    reason: string
  }>
  reviseRequests: Array<{
    projectId: string
    budgetId: string
    reason: string
    requestId: string
  }>
  submitPending: Array<{
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }>
  approvePending: Array<{
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }>
  rejectPending: Array<{
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }>
  revisePending: Array<{
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }>
  refreshes: number
  throwOnRefresh: boolean
  mount: (props: PanelProps) => void
  resolveSubmit: (value: unknown) => void
  rejectSubmit: (error: unknown) => void
  resolveApprove: (value: unknown) => void
  rejectApprove: (error: unknown) => void
  resolveReject: (value: unknown) => void
  rejectReject: (error: unknown) => void
  resolveRevise: (value: unknown) => void
  rejectRevise: (error: unknown) => void
}

let harnessDirectory = ''
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined

test.describe.configure({ mode: 'serial' })

const defaultDraft: NonNullable<PanelProps['draft']> = {
  id: BUDGET_ID,
  revision: 1,
  sourceBomId: null,
  controlMode: 'warn',
  toleranceBps: 0,
  currency: 'PHP',
  effectiveFrom: '2026-09-13',
  reason: 'Initial controlled baseline',
  lines: [
    {
      id: LINE_ID,
      costCodeId: CODE_ID,
      bomLineItemId: null,
      description: 'Structural materials',
      amountCents: 10_000,
    },
  ],
}

const defaultPending: NonNullable<PanelProps['pendingBudget']> = {
  id: BUDGET_ID,
  revision: 1,
  commercialApprovedBy: null,
  financeApprovedBy: null,
}

const defaultProps: PanelProps = {
  projectId: PROJECT_ID,
  canViewBom: false,
  canManage: true,
  canCommercialApprove: false,
  canFinanceApprove: false,
  ownerOverride: false,
  draft: defaultDraft,
  pendingBudget: null,
  approvedBudget: null,
  codes: [
    {
      id: CODE_ID,
      code: 'MAT-100',
      name: 'Structural materials',
      category: 'material',
    },
  ],
  sourceBoms: [],
  bomLines: [],
}

function committed(
  operation: WorkflowOperation,
  status: WorkflowStatus,
  sourceBudgetId: string,
  resultBudgetId = sourceBudgetId,
  projectId = PROJECT_ID,
  requestId?: string
): WorkflowResponse {
  return {
    ok: true,
    id: resultBudgetId,
    receipt: {
      projectId,
      sourceBudgetId,
      operation,
      resultBudgetId,
      status,
      ...(requestId ? { requestId } : {}),
    },
  }
}

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge })
      .__budgetTest
    return {
      submitRequests: bridge.submitRequests,
      approveRequests: bridge.approveRequests,
      rejectRequests: bridge.rejectRequests,
      reviseRequests: bridge.reviseRequests,
      refreshes: bridge.refreshes,
    }
  })
}

async function mount(page: import('@playwright/test').Page, props: PanelProps) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge })
      .__budgetTest
    bridge.mount(value)
  }, props)
}

async function resolveSubmit(
  page: import('@playwright/test').Page,
  value: WorkflowResponse
) {
  await page.evaluate((response) => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge })
      .__budgetTest
    bridge.resolveSubmit(response)
  }, value)
}

async function resolveApprove(
  page: import('@playwright/test').Page,
  value: WorkflowResponse
) {
  await page.evaluate((response) => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge })
      .__budgetTest
    bridge.resolveApprove(response)
  }, value)
}

async function resolveRevise(
  page: import('@playwright/test').Page,
  value: WorkflowResponse
) {
  await page.evaluate((response) => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge })
      .__budgetTest
    bridge.resolveRevise(response)
  }, value)
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const temporaryRoot = resolve(tmpdir())
  const prefix = 'erp-budget-workflow-'
  harnessDirectory = resolve(await mkdtemp(join(temporaryRoot, prefix)))
  if (
    !harnessDirectory.startsWith(`${temporaryRoot}${sep}`) ||
    !basename(harnessDirectory).startsWith(prefix)
  ) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }

  const componentPath = join(
    process.cwd(),
    'src',
    'app',
    '(dashboard)',
    'projects',
    '[id]',
    'cost',
    'budget',
    'budget-workspace.tsx'
  )
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'budget-actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')

  await writeFile(
    join(harnessDirectory, 'index.html'),
    '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>'
  )
  await writeFile(
    actionsPath,
    `
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  submitRequests: Array<{ projectId: string; budgetId: string }>
  approveRequests: Array<{ projectId: string; budgetId: string; lane: 'commercial' | 'finance' }>
  rejectRequests: Array<{ projectId: string; budgetId: string; reason: string }>
  reviseRequests: Array<{ projectId: string; budgetId: string; reason: string; requestId: string }>
  submitPending: Pending[]
  approvePending: Pending[]
  rejectPending: Pending[]
  revisePending: Pending[]
  resolveSubmit: (value: unknown) => void
  rejectSubmit: (error: unknown) => void
  resolveApprove: (value: unknown) => void
  rejectApprove: (error: unknown) => void
  resolveReject: (value: unknown) => void
  rejectReject: (error: unknown) => void
  resolveRevise: (value: unknown) => void
  rejectRevise: (error: unknown) => void
}
const target = globalThis as unknown as { __budgetTest?: Bridge }
const bridge = target.__budgetTest ?? {
  submitRequests: [], approveRequests: [], rejectRequests: [], reviseRequests: [],
  submitPending: [], approvePending: [], rejectPending: [], revisePending: [],
  refreshes: 0, throwOnRefresh: false,
  resolveSubmit(value: unknown) { target.__budgetTest?.submitPending.shift()?.resolve(value) },
  rejectSubmit(error: unknown) { target.__budgetTest?.submitPending.shift()?.reject(error) },
  resolveApprove(value: unknown) { target.__budgetTest?.approvePending.shift()?.resolve(value) },
  rejectApprove(error: unknown) { target.__budgetTest?.approvePending.shift()?.reject(error) },
  resolveReject(value: unknown) { target.__budgetTest?.rejectPending.shift()?.resolve(value) },
  rejectReject(error: unknown) { target.__budgetTest?.rejectPending.shift()?.reject(error) },
  resolveRevise(value: unknown) { target.__budgetTest?.revisePending.shift()?.resolve(value) },
  rejectRevise(error: unknown) { target.__budgetTest?.revisePending.shift()?.reject(error) },
}
target.__budgetTest = bridge
function pending(queue: Pending[]): Promise<unknown> {
  return new Promise((resolve, reject) => queue.push({ resolve, reject }))
}
export function createCostCode(): Promise<unknown> { return Promise.resolve({ ok: true, id: '11111111-1111-4111-8111-111111111111' }) }
export function createProjectBudget(): Promise<unknown> { return Promise.resolve({ ok: true, id: '55555555-5555-4555-8555-555555555555' }) }
export function saveProjectBudget(formData: FormData): Promise<unknown> {
  return Promise.resolve({ ok: true, id: String(formData.get('budget_id') ?? ''), lines: [] })
}
export function submitProjectBudget(projectId: string, budgetId: string): Promise<unknown> {
  bridge.submitRequests.push({ projectId, budgetId })
  return pending(bridge.submitPending)
}
export function approveProjectBudget(projectId: string, budgetId: string, lane: 'commercial' | 'finance'): Promise<unknown> {
  bridge.approveRequests.push({ projectId, budgetId, lane })
  return pending(bridge.approvePending)
}
export function rejectProjectBudget(projectId: string, budgetId: string, reason: string): Promise<unknown> {
  bridge.rejectRequests.push({ projectId, budgetId, reason })
  return pending(bridge.rejectPending)
}
export function reviseProjectBudget(projectId: string, budgetId: string, reason: string, requestId?: string): Promise<unknown> {
  bridge.reviseRequests.push({ projectId, budgetId, reason, requestId: requestId ?? '' })
  return pending(bridge.revisePending)
}
`
  )
  await writeFile(
    navigationPath,
    `
export function useRouter() {
  return { refresh() {
    const bridge = (globalThis as unknown as { __budgetTest: { refreshes: number; throwOnRefresh: boolean } }).__budgetTest
    bridge.refreshes += 1
    if (bridge.throwOnRefresh) throw new Error('refresh transport detail')
  } }
}
`
  )
  await writeFile(
    join(harnessDirectory, 'harness.tsx'),
    `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(globalsPath)}
import { BudgetWorkspace } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
const bridge = (globalThis as unknown as { __budgetTest: { mount: (props: unknown) => void } }).__budgetTest
bridge.mount = (props: unknown) => root.render(<React.StrictMode><BudgetWorkspace {...(props as never)} /></React.StrictMode>)
bridge.mount(${JSON.stringify(defaultProps)})
`
  )

  vite = await createServer({
    root: harnessDirectory,
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: {
      include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: { allow: [process.cwd(), harnessDirectory] },
    },
    resolve: {
      alias: [
        {
          find: 'react',
          replacement: join(process.cwd(), 'node_modules', 'react'),
        },
        {
          find: 'react-dom',
          replacement: join(process.cwd(), 'node_modules', 'react-dom'),
        },
        { find: 'next/navigation', replacement: navigationPath },
        {
          find: '@/app/(dashboard)/projects/[id]/cost/budget/actions',
          replacement: actionsPath,
        },
        { find: '@', replacement: join(process.cwd(), 'src') },
      ],
    },
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Vite harness did not expose a port')
  }
  harnessUrl = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await vite?.close()
  if (
    harnessDirectory &&
    harnessDirectory.startsWith(resolve(tmpdir()) + sep) &&
    basename(harnessDirectory).startsWith('erp-budget-workflow-')
  ) {
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

test('blocks submission of dirty draft lines instead of silently submitting stale server data', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByLabel('Baseline amount 1').fill('101.00')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('alert')).toContainText('Save the draft before submitting')
  expect((await snapshot(page)).submitRequests).toHaveLength(0)
})

test('single-flights submit, retains exact uncertain request, and accepts a durable replay state', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(harnessUrl)
  const submit = page.getByRole('button', { name: 'Submit for approval' })
  await submit.click()
  await expect(page.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
  await page.getByRole('button', { name: 'Submitting…' }).evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect((await snapshot(page)).submitRequests).toHaveLength(1)

  await page.evaluate(() => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest
    bridge.rejectSubmit(new Error('sensitive transport detail'))
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive transport detail')
  const retry = page.getByRole('button', { name: 'Retry budget workflow' })
  await retry.click()
  await page.waitForFunction(() => (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest.submitPending.length === 1)
  const firstRetry = (await snapshot(page)).submitRequests
  expect(firstRetry).toHaveLength(2)
  expect(firstRetry[1]).toEqual(firstRetry[0])

  await resolveSubmit(page, {
    ok: true,
    id: BUDGET_ID,
    receipt: {
      projectId: PROJECT_ID,
      sourceBudgetId: BUDGET_ID,
      operation: 'submit',
      resultBudgetId: OTHER_BUDGET_ID,
      status: 'pending_approval',
    },
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  expect((await snapshot(page)).refreshes).toBe(0)

  await retry.click()
  await page.waitForFunction(() => (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest.submitPending.length === 1)
  const secondRetry = (await snapshot(page)).submitRequests
  expect(secondRetry).toHaveLength(3)
  expect(secondRetry[2]).toEqual(firstRetry[0])
  await resolveSubmit(page, committed('submit', 'rejected', BUDGET_ID))
  await expect(page.getByRole('status')).toContainText('submission recorded')
  await expect(page.getByRole('status')).toContainText('now rejected')
  await expect(page.getByRole('status')).not.toContainText('remain outstanding')
  expect((await snapshot(page)).refreshes).toBe(1)
  expect(pageErrors).toEqual([])
})

test('reconciles same-project server refreshes without replacing dirty editor fields', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(harnessUrl)
  await page.getByLabel('Description 1').fill('Local unsaved scope note')
  await page.getByLabel('Revision reason').fill('Local unsaved reason')
  await mount(page, {
    ...defaultProps,
    draft: {
      ...defaultDraft,
      reason: 'Server refreshed reason',
      lines: [
        {
          ...defaultDraft.lines[0]!,
          description: 'Server refreshed description',
          amountCents: 20_000,
        },
      ],
    },
  })
  await expect(page.getByLabel('Baseline amount 1')).toHaveValue('200.00')
  await expect(page.getByLabel('Description 1')).toHaveValue('Local unsaved scope note')
  await expect(page.getByLabel('Revision reason')).toHaveValue('Local unsaved reason')
  expect(errors).toEqual([])
})

test('discards an uncertain command when the same project receives another budget', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await page.evaluate(() => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest
    bridge.rejectSubmit(new Error('connection lost'))
  })
  await expect(page.getByRole('button', { name: 'Retry budget workflow' })).toBeVisible()
  await mount(page, { ...defaultProps, draft: { ...defaultDraft, id: OTHER_BUDGET_ID } })
  await expect(page.getByRole('button', { name: 'Retry budget workflow' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  const requests = (await snapshot(page)).submitRequests
  expect(requests).toEqual([
    { projectId: PROJECT_ID, budgetId: BUDGET_ID },
    { projectId: PROJECT_ID, budgetId: OTHER_BUDGET_ID },
  ])
  await resolveSubmit(page, committed('submit', 'pending_approval', OTHER_BUDGET_ID))
  await expect(page.getByRole('status')).toContainText('submission committed')
})

for (const lateOutcome of ['error', 'unconfirmed', 'success'] as const) {
  test(`ignores a late ${lateOutcome} after same-project budget replacement`, async ({ page }) => {
    await page.goto(harnessUrl)
    await page.getByRole('button', { name: 'Submit for approval' }).click()
    await mount(page, { ...defaultProps, draft: { ...defaultDraft, id: OTHER_BUDGET_ID } })
    const submit = page.getByRole('button', { name: 'Submit for approval' })
    await expect(submit).toBeEnabled()
    await submit.click()
    await resolveSubmit(page, lateOutcome === 'success'
      ? committed('submit', 'pending_approval', BUDGET_ID)
      : { error: 'Old budget result', ...(lateOutcome === 'unconfirmed' ? { unconfirmed: true } : {}) })
    await expect(page.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)
    expect((await snapshot(page)).refreshes).toBe(0)
    await resolveSubmit(page, committed('submit', 'pending_approval', OTHER_BUDGET_ID))
    await expect(page.getByRole('status')).toContainText('submission committed')
    expect((await snapshot(page)).refreshes).toBe(1)
  })
}

test('fences a prior project response after scope replacement', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
  await mount(page, {
    ...defaultProps,
    projectId: OTHER_PROJECT_ID,
    draft: null,
    pendingBudget: {
      ...defaultPending,
      id: OTHER_BUDGET_ID,
    },
  })
  await expect(page.getByRole('button', { name: 'Approve lane' })).toHaveCount(0)
  await resolveSubmit(page, committed('submit', 'pending_approval', BUDGET_ID))
  await expect(page.getByRole('status')).toHaveCount(0)
  expect((await snapshot(page)).refreshes).toBe(0)
})

test('reports lane success separately from final baseline approval and keeps refresh warnings non-fatal', async ({ page }) => {
  await page.goto(harnessUrl)
  const pendingProps: PanelProps = {
    ...defaultProps,
    canManage: false,
    canCommercialApprove: true,
    canFinanceApprove: false,
    draft: null,
    pendingBudget: defaultPending,
  }
  await mount(page, pendingProps)
  await page.getByRole('button', { name: 'Approve lane' }).first().click()
  await expect(page.getByRole('button', { name: 'Approving commercial…' })).toBeDisabled()
  await resolveApprove(page, {
    ...committed('commercial', 'pending_approval', BUDGET_ID),
    refreshWarning: 'Server view is stale; reload if needed.',
  })
  await expect(page.getByRole('status')).toContainText('Commercial approval committed')
  await expect(page.getByRole('status')).toContainText('Finance approval remains outstanding')
  await expect(page.getByRole('status')).toContainText('Server view is stale')

  await page.evaluate(() => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest
    bridge.throwOnRefresh = true
  })
  await mount(page, {
    ...pendingProps,
    canFinanceApprove: true,
    pendingBudget: {
      ...defaultPending,
      commercialApprovedBy: APPROVER_ID,
    },
  })
  await page.getByRole('button', { name: 'Approve lane' }).last().click()
  await resolveApprove(page, committed('finance', 'approved', BUDGET_ID))
  await expect(page.getByRole('status')).toContainText('baseline is now fully approved')
  await expect(page.getByRole('status')).toContainText('could not refresh')
  await expect(page.getByRole('status')).not.toContainText('action failed')
})

test('hides denied workflow capabilities and confirms explicit owner dual-lane approval', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, {
    ...defaultProps,
    canManage: false,
    canCommercialApprove: false,
    canFinanceApprove: false,
    draft: null,
    pendingBudget: defaultPending,
  })
  await expect(page.getByRole('button', { name: /Approve/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reject revision' })).toHaveCount(0)

  await mount(page, {
    ...defaultProps,
    canManage: false,
    canCommercialApprove: true,
    canFinanceApprove: true,
    ownerOverride: true,
    draft: null,
    pendingBudget: defaultPending,
  })
  await expect(page.getByText('Owner approval fills any remaining approval lane')).toBeVisible()
  const ownerButton = page.getByRole('button', { name: 'Approve & lock baseline' }).first()
  page.once('dialog', (dialog) => dialog.accept())
  await ownerButton.click()
  expect((await snapshot(page)).approveRequests[0]?.lane).toBe('commercial')
  await resolveApprove(page, committed('commercial', 'approved', BUDGET_ID))
  await expect(page.getByRole('status')).toContainText('baseline is now fully approved')
})

test('retries revision with the exact reason and request id on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(harnessUrl)
  await mount(page, {
    ...defaultProps,
    draft: null,
    pendingBudget: null,
    approvedBudget: { id: BUDGET_ID, revision: 1 },
  })
  const reason = page.getByPlaceholder('Why is the baseline changing?')
  const exactReason = 'Correct the approved commercial scope before mobilization'
  await reason.fill(exactReason)
  const create = page.getByRole('button', { name: 'Create revision' })
  await reason.focus()
  await page.keyboard.press('Tab')
  await expect(create).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const screenshotPath = join(tmpdir(), 'erp-budget-workflow-receipts-320.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  await create.click()
  await expect(page.getByRole('button', { name: 'Creating revision…' })).toBeDisabled()
  await page.getByRole('button', { name: 'Creating revision…' }).evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  const first = (await snapshot(page)).reviseRequests
  expect(first).toHaveLength(1)
  expect(first[0]?.reason).toBe(exactReason)
  expect(first[0]?.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

  await page.evaluate(() => {
    const bridge = (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest
    bridge.rejectRevise(new Error('sensitive revision transport detail'))
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive revision transport detail')
  await expect(reason).toHaveValue(exactReason)
  await page.getByRole('button', { name: 'Retry budget workflow' }).click()
  await page.waitForFunction(() => (window as unknown as { __budgetTest: BrowserBridge }).__budgetTest.revisePending.length === 1)
  const retried = (await snapshot(page)).reviseRequests
  expect(retried).toHaveLength(2)
  expect(retried[1]).toEqual(retried[0])
  await resolveRevise(page, committed('revise', 'draft', BUDGET_ID, REVISION_ID, PROJECT_ID, first[0]!.requestId))
  await expect(page.getByRole('status')).toContainText('new draft is ready')
})
