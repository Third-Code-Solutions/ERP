import { expect, test } from './fixtures'
import { basename, join, resolve, sep } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT_ID = '88888888-8888-4888-8888-888888888888'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ACTOR_ID = '99999999-9999-4999-8999-999999999999'
const COST_CODE_ID = '55555555-5555-4555-8555-555555555555'
const ENTRY_ID = '66666666-6666-4666-8666-666666666666'
const IMPORT_ID = '77777777-7777-4777-8777-777777777777'
const PO_ENTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

type FormProps = {
  projectId: string
  tenantId: string
  actorId: string
  costCodes: Array<{
    id: string
    code: string
    name: string
    category: 'material' | 'labour' | 'subcontractor' | 'equipment' | 'overhead' | 'other'
  }>
}

type TableProps = {
  entries: Array<{
    id: string
    description: string
    cost_category: string
    cost_source: string
    reference_number: string | null
    amount_cents: number
    incurred_at: string
  }>
  projectId: string
  tenantId: string
  actorId: string
  canRecord: boolean
}

type BrowserBridge = {
  createRequests: Array<Record<string, string>>
  deleteRequests: Array<Record<string, string>>
  createPending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>
  deletePending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>
  refreshes: number
  throwOnRefresh: boolean
  mount: (kind: 'form' | 'table', props: FormProps | TableProps) => void
  resolveCreate: (value: unknown) => void
  rejectCreate: (error: unknown) => void
  resolveDelete: (value: unknown) => void
  rejectDelete: (error: unknown) => void
}

type CreateSuccess = {
  id: string
  receipt: {
    tenantId: string
    projectId: string
    actorId: string
    requestId: string
    costEntryId: string
  }
  refreshWarning?: string
}

type DeleteSuccess = {
  ok: true
  receipt: CreateSuccess['receipt']
  refreshWarning?: string
}

let harnessDirectory = ''
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined

test.describe.configure({ mode: 'serial' })

const defaultFormProps: FormProps = {
  projectId: PROJECT_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  costCodes: [
    {
      id: COST_CODE_ID,
      code: 'MAT-100',
      name: 'Structural materials',
      category: 'material',
    },
  ],
}

const defaultEntries: TableProps['entries'] = [
  {
    id: ENTRY_ID,
    description: 'Concrete delivery',
    cost_category: 'material',
    cost_source: 'manual',
    reference_number: 'INV-100',
    amount_cents: 12345,
    incurred_at: '2026-09-10T00:00:00.000Z',
  },
  {
    id: IMPORT_ID,
    description: 'Imported legacy adjustment',
    cost_category: 'other',
    cost_source: 'import',
    reference_number: null,
    amount_cents: 5000,
    incurred_at: '2026-09-09T00:00:00.000Z',
  },
  {
    id: PO_ENTRY_ID,
    description: 'Purchase order actual',
    cost_category: 'material',
    cost_source: 'po_derived',
    reference_number: 'PO-100',
    amount_cents: 9000,
    incurred_at: '2026-09-08T00:00:00.000Z',
  },
]

const defaultTableProps: TableProps = {
  entries: defaultEntries,
  projectId: PROJECT_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  canRecord: true,
}

function committedCreate(request: Record<string, string>): CreateSuccess {
  return {
    id: ENTRY_ID,
    receipt: {
      tenantId: request.expected_tenant_id ?? TENANT_ID,
      projectId: request.project_id ?? PROJECT_ID,
      actorId: request.expected_actor_id ?? ACTOR_ID,
      requestId: request.idempotency_key ?? '',
      costEntryId: ENTRY_ID,
    },
  }
}

function committedDelete(request: Record<string, string>): DeleteSuccess {
  return {
    ok: true,
    receipt: {
      tenantId: request.tenantId ?? TENANT_ID,
      projectId: request.projectId ?? PROJECT_ID,
      actorId: request.actorId ?? ACTOR_ID,
      requestId: request.idempotencyKey ?? '',
      costEntryId: request.costEntryId ?? ENTRY_ID,
    },
  }
}

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    return {
      createRequests: bridge.createRequests,
      deleteRequests: bridge.deleteRequests,
      refreshes: bridge.refreshes,
    }
  })
}

async function resolveCreate(page: import('@playwright/test').Page, result: unknown) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    bridge.resolveCreate(value)
  }, result)
}

async function resolveDelete(page: import('@playwright/test').Page, result: unknown) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    bridge.resolveDelete(value)
  }, result)
}

async function mount(
  page: import('@playwright/test').Page,
  kind: 'form' | 'table',
  props: FormProps | TableProps,
) {
  await page.evaluate(
    ({ kind: nextKind, props: nextProps }) => {
      const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
      bridge.mount(nextKind, nextProps)
    },
    { kind, props },
  )
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const temporaryRoot = resolve(tmpdir())
  const prefix = 'erp-manual-cost-'
  harnessDirectory = resolve(await mkdtemp(join(temporaryRoot, prefix)))
  if (
    !harnessDirectory.startsWith(`${temporaryRoot}${sep}`) ||
    !basename(harnessDirectory).startsWith(prefix)
  ) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }

  const formPath = join(process.cwd(), 'src', 'components', 'cost', 'cost-entry-form.tsx')
  const tablePath = join(process.cwd(), 'src', 'components', 'cost', 'cost-table.tsx')
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'cost-actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')

  await writeFile(
    join(harnessDirectory, 'index.html'),
    '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>',
  )
  await writeFile(
    actionsPath,
    `
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  createRequests: Array<Record<string, string>>
  deleteRequests: Array<Record<string, string>>
  createPending: Pending[]
  deletePending: Pending[]
  refreshes: number
  throwOnRefresh: boolean
  resolveCreate: (value: unknown) => void
  rejectCreate: (error: unknown) => void
  resolveDelete: (value: unknown) => void
  rejectDelete: (error: unknown) => void
}
function values(formData: FormData): Record<string, string> {
  return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, typeof value === 'string' ? value : value.name]))
}
const target = globalThis as unknown as { __manualCostTest?: Bridge }
const bridge = target.__manualCostTest ?? {
  createRequests: [], deleteRequests: [], createPending: [], deletePending: [], refreshes: 0, throwOnRefresh: false,
  resolveCreate(value: unknown) { bridge.createPending.shift()?.resolve(value) },
  rejectCreate(error: unknown) { bridge.createPending.shift()?.reject(error) },
  resolveDelete(value: unknown) { bridge.deletePending.shift()?.resolve(value) },
  rejectDelete(error: unknown) { bridge.deletePending.shift()?.reject(error) },
}
target.__manualCostTest = bridge
export function createCostEntry(formData: FormData): Promise<unknown> {
  bridge.createRequests.push(values(formData))
  return new Promise((resolve, reject) => bridge.createPending.push({ resolve, reject }))
}
export function deleteCostEntry(
  costEntryId: string,
  projectId: string,
  reason: string,
  idempotencyKey: string,
  scope?: { tenantId: string; actorId: string },
): Promise<unknown> {
  bridge.deleteRequests.push({ costEntryId, projectId, reason, idempotencyKey, tenantId: scope?.tenantId ?? '', actorId: scope?.actorId ?? '' })
  return new Promise((resolve, reject) => bridge.deletePending.push({ resolve, reject }))
}
`,
  )
  await writeFile(
    navigationPath,
    `
export function useRouter() {
  return { refresh() {
    const bridge = (globalThis as unknown as { __manualCostTest: { refreshes: number; throwOnRefresh: boolean } }).__manualCostTest
    bridge.refreshes += 1
    if (bridge.throwOnRefresh) throw new Error('refresh transport detail')
  } }
}
`,
  )
  await writeFile(
    join(harnessDirectory, 'harness.tsx'),
    `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(globalsPath)}
import { CostEntryForm } from ${JSON.stringify(formPath)}
import { CostTable } from ${JSON.stringify(tablePath)}
const root = createRoot(document.getElementById('root')!)
const bridge = (globalThis as unknown as { __manualCostTest: { mount: (kind: 'form' | 'table', props: unknown) => void } }).__manualCostTest
bridge.mount = (kind, props) => {
  const scoped = props as { projectId: string; tenantId: string; actorId: string }
  const key = scoped.projectId + ':' + scoped.tenantId + ':' + scoped.actorId
  return root.render(<React.StrictMode>{kind === 'form' ? <CostEntryForm key={key} {...(props as never)} /> : <CostTable key={key} {...(props as never)} />}</React.StrictMode>)
}
bridge.mount('form', ${JSON.stringify(defaultFormProps)})
`,
  )

  vite = await createServer({
    root: harnessDirectory,
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: {
      include: ['react', 'react-dom/client', 'react/jsx-runtime'],
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
          find: '@/app/(dashboard)/projects/[id]/cost/actions',
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
    harnessDirectory.startsWith(`${resolve(tmpdir())}${sep}`) &&
    basename(harnessDirectory).startsWith('erp-manual-cost-')
  ) {
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

test('captures create scope and payload, single-flights, and retries an uncertain commit exactly', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: /Record cost/ }).click()
  await page.getByLabel('Description').fill('Concrete delivery')
  await page.getByLabel('Amount (₱)').fill('123.45')
  await page.getByRole('button', { name: 'Save cost' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await expect(page.getByLabel('Description')).toBeDisabled()
  await page.locator('form').evaluate((element) => {
    const form = element as HTMLFormElement
    form.requestSubmit()
    form.requestSubmit()
  })

  const firstSnapshot = await snapshot(page)
  expect(firstSnapshot.createRequests).toHaveLength(1)
  const firstRequest = firstSnapshot.createRequests[0]
  expect(firstRequest?.project_id).toBe(PROJECT_ID)
  expect(firstRequest?.expected_tenant_id).toBe(TENANT_ID)
  expect(firstRequest?.expected_actor_id).toBe(ACTOR_ID)
  expect(firstRequest?.idempotency_key).toMatch(/^[0-9a-f-]{36}$/i)

  await resolveCreate(page, {
    error: 'sensitive transport detail',
    outcomeUnknown: true,
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive transport detail')
  await expect(page.getByLabel('Description')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled()

  await page.getByRole('button', { name: 'Retry save' }).click()
  await page.waitForFunction(
    () =>
      (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
        .createPending.length === 1,
  )
  const retrySnapshot = await snapshot(page)
  expect(retrySnapshot.createRequests).toHaveLength(2)
  expect(retrySnapshot.createRequests[1]).toEqual(firstRequest)

  await page.evaluate(() => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    bridge.throwOnRefresh = true
  })
  await resolveCreate(page, committedCreate(firstRequest ?? {}))
  await expect(page.getByRole('status')).toContainText('Cost entry committed')
  await expect(page.getByRole('status')).toContainText('could not refresh')
  await expect(page.getByRole('button', { name: /Record cost/ })).toBeVisible()
})

test('releases a definitively rejected create for editing with a fresh key', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: /Record cost/ }).click()
  await page.getByLabel('Description').fill('Temporary entry')
  await page.getByLabel('Amount (₱)').fill('10.00')
  await page.getByRole('button', { name: 'Save cost' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  const first = (await snapshot(page)).createRequests[0]
  await resolveCreate(page, { error: 'Cost Code is unavailable.' })
  await expect(page.getByRole('alert')).toContainText('Cost Code is unavailable')
  await expect(page.getByRole('button', { name: 'Save cost' })).toBeEnabled()
  await page.getByLabel('Description').fill('Corrected entry')
  await page.getByRole('button', { name: 'Save cost' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  const requests = (await snapshot(page)).createRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]?.idempotency_key).not.toBe(first?.idempotency_key)
  await resolveCreate(page, committedCreate(requests[1] ?? {}))
  await expect(page.getByRole('status')).toContainText('Cost entry committed')
})

test('keeps malformed or foreign create receipts uncertain instead of claiming success', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: /Record cost/ }).click()
  await page.getByLabel('Description').fill('Receipt validation case')
  await page.getByLabel('Amount (₱)').fill('11.00')
  await page.getByRole('button', { name: 'Save cost' }).click()
  const request = (await snapshot(page)).createRequests[0] ?? {}
  await resolveCreate(page, {
    id: ENTRY_ID,
    receipt: {
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      projectId: PROJECT_ID,
      actorId: ACTOR_ID,
      requestId: request.idempotency_key,
      costEntryId: ENTRY_ID,
    },
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible()
  expect((await snapshot(page)).refreshes).toBe(0)
})

test('fences a late create result after project or actor scope replacement', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: /Record cost/ }).click()
  await page.getByLabel('Description').fill('Old project entry')
  await page.getByLabel('Amount (₱)').fill('12.00')
  await page.getByRole('button', { name: 'Save cost' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await mount(page, 'form', {
    ...defaultFormProps,
    projectId: OTHER_PROJECT_ID,
    tenantId: OTHER_TENANT_ID,
    actorId: OTHER_ACTOR_ID,
  })
  await resolveCreate(page, {
    id: ENTRY_ID,
    receipt: {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      actorId: ACTOR_ID,
      requestId: 'old-request',
      costEntryId: ENTRY_ID,
    },
  })
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect((await snapshot(page)).refreshes).toBe(0)
  await expect(page.getByRole('button', { name: /Record cost/ })).toBeVisible()
})

test('voids only manual rows with a stable command and keeps a committed row read-only', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'table', defaultTableProps)
  await expect(page.getByText('Import', { exact: true })).toBeVisible()
  await expect(page.getByText('PO', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Void Imported legacy adjustment/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Void Purchase order actual/ })).toHaveCount(0)

  const voidButton = page.getByRole('button', { name: /Void Concrete delivery/ })
  await voidButton.click()
  const pendingVoid = page.getByRole('button', { name: /Voiding Concrete delivery/ })
  await expect(pendingVoid).toBeDisabled()
  await pendingVoid.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect((await snapshot(page)).deleteRequests).toHaveLength(1)
  const firstRequest = (await snapshot(page)).deleteRequests[0]
  expect(firstRequest).toMatchObject({
    costEntryId: ENTRY_ID,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    reason: 'Manual cost correction',
  })

  await page.evaluate(() => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    bridge.rejectDelete(new Error('sensitive void transport detail'))
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive void transport detail')
  await page.getByRole('button', { name: 'Retry void' }).click()
  await page.waitForFunction(
    () =>
      (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
        .deletePending.length === 1,
  )
  const retryRequests = (await snapshot(page)).deleteRequests
  expect(retryRequests).toHaveLength(2)
  expect(retryRequests[1]).toEqual(firstRequest)

  await page.evaluate(() => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    bridge.throwOnRefresh = true
  })
  await resolveDelete(page, {
    ...committedDelete(firstRequest ?? {}),
    refreshWarning: 'The cost log view is stale; reload if needed.',
  })
  await expect(page.getByRole('status')).toContainText('Cost entry void committed')
  await expect(page.getByRole('status')).toContainText('could not refresh')
  await expect(page.getByRole('status')).toContainText('cost log view is stale')
  await expect(page.getByRole('button', { name: /Void Concrete delivery/ })).toHaveCount(0)
  await expect(page.getByText('Voided', { exact: true })).toBeVisible()
})

test('clears an uncertain void when the same page replaces its project scope before retry', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'table', defaultTableProps)
  await page.getByRole('button', { name: /Void Concrete delivery/ }).click()
  await page.evaluate(() => {
    const bridge = (window as unknown as { __manualCostTest: BrowserBridge }).__manualCostTest
    bridge.resolveDelete({ error: 'outcome is uncertain', outcomeUnknown: true })
  })
  await expect(page.getByRole('button', { name: 'Retry void' })).toBeVisible()
  await mount(page, 'table', {
    ...defaultTableProps,
    projectId: OTHER_PROJECT_ID,
    tenantId: OTHER_TENANT_ID,
    actorId: OTHER_ACTOR_ID,
    entries: [
      {
        ...defaultEntries[0]!,
        id: IMPORT_ID,
        description: 'Other project manual entry',
        cost_source: 'manual',
      },
    ],
  })
  await expect(page.getByRole('button', { name: 'Retry void' })).toHaveCount(0)
  await page.getByRole('button', { name: /Void Other project manual entry/ }).click()
  const requests = (await snapshot(page)).deleteRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]?.projectId).toBe(OTHER_PROJECT_ID)
  expect(requests[1]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey)
  await resolveDelete(page, { error: 'Definitive test rejection.' })
})

test('retains an unconfirmed void through temporary permission loss without rekeying it', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'table', defaultTableProps)
  await page.getByRole('button', { name: /Void Concrete delivery/ }).click()
  const first = (await snapshot(page)).deleteRequests[0]
  await resolveDelete(page, { error: 'Unconfirmed', outcomeUnknown: true })
  await expect(page.getByRole('button', { name: 'Retry void' })).toBeVisible()
  await mount(page, 'table', { ...defaultTableProps, canRecord: false })
  await expect(page.getByRole('button', { name: 'Retry void' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Void Concrete delivery/ })).toHaveCount(0)
  await mount(page, 'table', defaultTableProps)
  await expect(page.getByRole('button', { name: 'Retry void' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry void' }).click()
  expect((await snapshot(page)).deleteRequests[1]).toEqual(first)
  await resolveDelete(page, committedDelete(first ?? {}))
  await expect(page.getByText('Voided', { exact: true })).toBeVisible()
})

test('keeps the manual form keyboard reachable at 320px and captures a review screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: /Record cost/ }).click()
  const description = page.getByLabel('Description')
  await description.fill('Mobile keyboard cost')
  await page.getByLabel('Amount (₱)').fill('13.50')
  await description.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Cost Code')).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Qty')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: join(tmpdir(), 'erp-manual-cost-command-receipts-320.png'),
    fullPage: true,
  })
})
