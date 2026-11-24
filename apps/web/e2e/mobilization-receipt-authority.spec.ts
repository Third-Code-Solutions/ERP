import { expect, test } from './base-test'
import { basename, join, resolve, sep } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'

type InputKey =
  | 'commented_fcd_received_at'
  | 'po_copies_received_at'
  | 'cari_received_at'
  | 'ntp_received_at'

type Readiness = {
  commentedFcdReceivedAt: string | null
  poCopiesReceivedAt: string | null
  cariReceivedAt: string | null
  ntpReceivedAt: string | null
  startedAt: string | null
  overrideReason: string | null
}

type PanelProps = {
  projectId: string
  canOverride: boolean
  readiness: Readiness | null
  riskByInput: Record<InputKey, number | null>
}

type RecordResponse =
  | { projectId: string; inputType: InputKey; receivedAt: string; refreshWarning?: string }
  | { error: string; unconfirmed?: boolean }
type StartResponse =
  | { projectId: string; startedAt: string; refreshWarning?: string }
  | { error: string; unconfirmed?: boolean }

type BrowserBridge = {
  recordRequests: Array<{ projectId: string; inputType: InputKey; receivedAt: string }>
  startRequests: Array<{ projectId: string; overrideReason: string }>
  recordPending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>
  startPending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>
  refreshes: number
  throwOnRefresh: boolean
  mount: (props: PanelProps) => void
  resolveRecord: (value: RecordResponse) => void
  rejectRecord: (error: unknown) => void
  resolveStart: (value: StartResponse) => void
  rejectStart: (error: unknown) => void
}

let harnessDirectory = ''
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined

test.describe.configure({ mode: 'serial' })

const emptyRisk: Record<InputKey, number | null> = {
  commented_fcd_received_at: null,
  po_copies_received_at: null,
  cari_received_at: null,
  ntp_received_at: null,
}

const defaultProps: PanelProps = {
  projectId: PROJECT_ID,
  canOverride: true,
  readiness: {
    commentedFcdReceivedAt: '2026-09-10T00:00:00.000Z',
    poCopiesReceivedAt: null,
    cariReceivedAt: null,
    ntpReceivedAt: null,
    startedAt: null,
    overrideReason: null,
  },
  riskByInput: emptyRisk,
}

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    return {
      recordRequests: bridge.recordRequests,
      startRequests: bridge.startRequests,
      refreshes: bridge.refreshes,
    }
  })
}

async function resolveRecord(page: import('@playwright/test').Page, response: RecordResponse) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.resolveRecord(value)
  }, response)
}

async function rejectRecord(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.rejectRecord(new Error('sensitive network details'))
  })
}

async function resolveStart(page: import('@playwright/test').Page, response: StartResponse) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.resolveStart(value)
  }, response)
}

async function rejectStart(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.rejectStart(new Error('sensitive start network details'))
  })
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const temporaryRoot = resolve(tmpdir())
  const prefix = 'erp-mobilization-receipt-'
  harnessDirectory = resolve(await mkdtemp(join(temporaryRoot, prefix)))
  if (!harnessDirectory.startsWith(`${temporaryRoot}${sep}`) || !basename(harnessDirectory).startsWith(prefix)) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }

  const componentPath = join(process.cwd(), 'src', 'app', '(dashboard)', 'projects', '[id]', 'permits', 'mobilization-readiness-panel.tsx')
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'mobilization-actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')
  await writeFile(join(harnessDirectory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(actionsPath, `
type InputKey = 'commented_fcd_received_at' | 'po_copies_received_at' | 'cari_received_at' | 'ntp_received_at'
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  recordRequests: Array<{ projectId: string; inputType: InputKey; receivedAt: string }>
  startRequests: Array<{ projectId: string; overrideReason: string }>
  recordPending: Pending[]
  startPending: Pending[]
  refreshes: number
  throwOnRefresh: boolean
  resolveRecord: (value: unknown) => void
  rejectRecord: (error: unknown) => void
  resolveStart: (value: unknown) => void
  rejectStart: (error: unknown) => void
}
const target = globalThis as unknown as { __mobilizationTest?: Bridge }
const bridge = target.__mobilizationTest ?? {
  recordRequests: [], startRequests: [], recordPending: [], startPending: [], refreshes: 0, throwOnRefresh: false,
  resolveRecord(value: unknown) { bridge.recordPending.shift()?.resolve(value) },
  rejectRecord(error: unknown) { bridge.recordPending.shift()?.reject(error) },
  resolveStart(value: unknown) { bridge.startPending.shift()?.resolve(value) },
  rejectStart(error: unknown) { bridge.startPending.shift()?.reject(error) },
}
target.__mobilizationTest = bridge
export function recordMobilizationInput(projectId: string, inputType: InputKey, receivedAt?: string): Promise<unknown> {
  bridge.recordRequests.push({ projectId, inputType, receivedAt: receivedAt ?? '' })
  return new Promise((resolve, reject) => bridge.recordPending.push({ resolve, reject }))
}
export function startMobilization(projectId: string, overrideReason?: string): Promise<unknown> {
  bridge.startRequests.push({ projectId, overrideReason: overrideReason ?? '' })
  return new Promise((resolve, reject) => bridge.startPending.push({ resolve, reject }))
}
`)
  await writeFile(navigationPath, `
export function useRouter() {
  return { refresh() {
    const bridge = (globalThis as unknown as { __mobilizationTest: { refreshes: number; throwOnRefresh: boolean } }).__mobilizationTest
    bridge.refreshes += 1
    if (bridge.throwOnRefresh) throw new Error('refresh transport detail')
  } }
}
`)
  await writeFile(join(harnessDirectory, 'harness.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(globalsPath)}
import { MobilizationReadinessPanel } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
const bridge = (globalThis as unknown as { __mobilizationTest: { mount: (props: unknown) => void } }).__mobilizationTest
bridge.mount = (props: unknown) => root.render(<React.StrictMode><MobilizationReadinessPanel {...(props as never)} /></React.StrictMode>)
bridge.mount(${JSON.stringify(defaultProps)})
`)

  vite = await createServer({
    root: harnessDirectory,
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), harnessDirectory] } },
    resolve: {
      alias: [
        { find: 'react', replacement: join(process.cwd(), 'node_modules', 'react') },
        { find: 'react-dom', replacement: join(process.cwd(), 'node_modules', 'react-dom') },
        { find: 'next/navigation', replacement: navigationPath },
        { find: '@/app/(dashboard)/projects/[id]/permits/actions', replacement: actionsPath },
        { find: '@', replacement: join(process.cwd(), 'src') },
      ],
    },
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Vite harness did not expose a port')
  harnessUrl = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await vite?.close()
  if (harnessDirectory && harnessDirectory.startsWith(resolve(tmpdir()) + sep) && basename(harnessDirectory).startsWith('erp-mobilization-receipt-')) {
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

test('keeps unsaved edits out of the saved count and retries the exact receipt request', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(harnessUrl)
  await expect(page.getByText('1/4 returns received')).toBeVisible()

  const input = page.getByLabel('PO copies received date')
  await input.fill('2026-09-11')
  await expect(page.getByText('1/4 returns received')).toBeVisible()
  await expect(page.getByText('Unsaved edit', { exact: true })).toBeVisible()
  await expect(page.getByText('Not recorded')).toHaveCount(3)

  const save = page.getByRole('button', { name: 'Save PO copies receipt' })
  await save.click()
  await expect(page.getByRole('button', { name: 'Saving PO copies receipt' })).toBeDisabled()
  await input.evaluate((element) => element.dispatchEvent(new Event('change', { bubbles: true })))
  expect((await snapshot(page)).recordRequests).toHaveLength(1)

  await rejectRecord(page)
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive network details')
  await expect(input).toHaveValue('2026-09-11')
  await expect(page.getByText('1/4 returns received')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry PO copies receipt' })).toBeEnabled()

  await page.getByRole('button', { name: 'Retry PO copies receipt' }).click()
  await page.waitForFunction(() => (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest.recordPending.length === 1)
  const requests = (await snapshot(page)).recordRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])

  await resolveRecord(page, {
    error: 'The database outcome could not be confirmed.',
    unconfirmed: true,
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(input).toHaveValue('2026-09-11')

  await page.getByRole('button', { name: 'Retry PO copies receipt' }).click()
  await page.waitForFunction(() => (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest.recordPending.length === 1)
  const unknownFlagRequests = (await snapshot(page)).recordRequests
  expect(unknownFlagRequests).toHaveLength(3)
  expect(unknownFlagRequests[2]).toEqual(unknownFlagRequests[0])
  await resolveRecord(page, {
    projectId: PROJECT_ID,
    inputType: 'po_copies_received_at',
    receivedAt: '2026-09-12T00:00:00.000Z',
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByText('1/4 returns received')).toBeVisible()

  await page.getByRole('button', { name: 'Retry PO copies receipt' }).click()
  await page.waitForFunction(() => (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest.recordPending.length === 1)
  const malformedResponseRequests = (await snapshot(page)).recordRequests
  expect(malformedResponseRequests).toHaveLength(4)
  expect(malformedResponseRequests[3]).toEqual(malformedResponseRequests[0])
  await resolveRecord(page, {
    projectId: PROJECT_ID,
    inputType: 'po_copies_received_at',
    receivedAt: '2026-09-11T00:00:00.000Z',
  })
  await expect(page.getByText('2/4 returns received')).toBeVisible()
  await expect(page.getByText('PO copies receipt committed')).toBeVisible()
  expect((await snapshot(page)).refreshes).toBe(1)
  expect(pageErrors).toEqual([])
})

test('syncs same-project saved updates without clobbering an unsaved edit', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByLabel('CARI received date').fill('2026-09-13')
  await expect(page.getByText('1/4 returns received')).toBeVisible()
  await expect(page.getByText('Unsaved edit', { exact: true })).toHaveCount(1)

  await page.evaluate((props) => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.mount(props)
  }, {
    ...defaultProps,
    readiness: {
      ...defaultProps.readiness!,
      poCopiesReceivedAt: '2026-09-12T00:00:00.000Z',
    },
  })

  await expect(page.getByText('2/4 returns received')).toBeVisible()
  await expect(page.getByLabel('PO copies received date')).toHaveValue('2026-09-12')
  await expect(page.getByLabel('CARI received date')).toHaveValue('2026-09-13')
  await expect(page.getByText('Unsaved edit', { exact: true })).toHaveCount(1)
})

test('hides override controls without capability but allows a complete normal start', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.evaluate((props) => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.mount(props)
  }, { ...defaultProps, canOverride: false })
  await expect(page.getByText('Awaiting all four returns before mobilization can start.')).toBeVisible()
  await expect(page.getByLabel('Mobilization override reason')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start with authorized override' })).toHaveCount(0)

  await page.evaluate((props) => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.mount(props)
  }, {
    ...defaultProps,
    canOverride: false,
    readiness: {
      ...defaultProps.readiness!,
      poCopiesReceivedAt: '2026-09-11T00:00:00.000Z',
      cariReceivedAt: '2026-09-12T00:00:00.000Z',
      ntpReceivedAt: '2026-09-13T00:00:00.000Z',
      overrideReason: 'Earlier override should not be reused.',
    },
  })
  await expect(page.getByRole('button', { name: 'Mark mobilization started' })).toBeEnabled()
  await expect(page.getByLabel('Mobilization override reason')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mark mobilization started' }).click()
  await page.waitForFunction(() => (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest.startPending.length === 1)
  expect((await snapshot(page)).startRequests[0]?.overrideReason).toBe('')
  await resolveStart(page, { projectId: PROJECT_ID, startedAt: '2026-09-13T04:00:00.000Z' })
})

test('reports committed success separately from refresh warnings and refresh failures', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByLabel('PO copies received date').fill('2026-09-11')
  await page.getByRole('button', { name: 'Save PO copies receipt' }).click()
  await resolveRecord(page, {
    projectId: PROJECT_ID,
    inputType: 'po_copies_received_at',
    receivedAt: '2026-09-11T00:00:00.000Z',
    refreshWarning: 'The server view is stale; reload if needed.',
  })
  await expect(page.getByRole('status')).toContainText('PO copies receipt committed')
  await expect(page.getByRole('status')).toContainText('server view is stale')

  await page.evaluate(() => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.throwOnRefresh = true
  })
  await page.getByLabel('CARI received date').fill('2026-09-12')
  await page.getByRole('button', { name: 'Save CARI receipt' }).click()
  await resolveRecord(page, {
    projectId: PROJECT_ID,
    inputType: 'cari_received_at',
    receivedAt: '2026-09-12T00:00:00.000Z',
  })
  await expect(page.getByRole('status')).toContainText('CARI receipt committed')
  await expect(page.getByRole('status')).toContainText('could not refresh')
  await expect(page.getByRole('status')).not.toContainText('page refresh was requested')
})

test('does not let a prior scope response mutate a newly mounted project', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByLabel('PO copies received date').fill('2026-09-11')
  await page.getByRole('button', { name: 'Save PO copies receipt' }).click()
  await expect(page.getByRole('button', { name: 'Saving PO copies receipt' })).toBeDisabled()

  await page.evaluate((props) => {
    const bridge = (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest
    bridge.mount(props)
  }, { ...defaultProps, projectId: OTHER_PROJECT_ID, readiness: null })
  await expect(page.getByText('0/4 returns received')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save PO copies receipt' })).toBeDisabled()
  await resolveRecord(page, {
    projectId: PROJECT_ID,
    inputType: 'po_copies_received_at',
    receivedAt: '2026-09-11T00:00:00.000Z',
  })
  await expect(page.getByRole('status')).toHaveCount(0)
  expect((await snapshot(page)).refreshes).toBe(0)
})

test('retries mobilization start exactly and keeps mobile controls keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(harnessUrl)
  const reason = page.getByLabel('Mobilization override reason')
  const customReason = 'PO copies remain with Procurement; PM accepted the release risk.'
  await reason.fill(customReason)
  const start = page.getByRole('button', { name: 'Start with authorized override' })
  await reason.focus()
  await page.keyboard.press('Tab')
  await expect(start).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: join(tmpdir(), 'erp-mobilization-receipt-authority-320.png'), fullPage: true })

  const buttonHeights = await page.getByRole('button').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
  expect(Math.min(...buttonHeights)).toBeGreaterThanOrEqual(44)

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await start.click()
  await expect(page.getByRole('button', { name: 'Starting…' })).toBeDisabled()
  await page.locator('section').evaluate((element) => {
    const button = Array.from(element.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('Starting'))
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect((await snapshot(page)).startRequests).toHaveLength(1)

  await rejectStart(page)
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive start network details')
  await expect(reason).toHaveValue(customReason)
  await page.getByRole('button', { name: 'Retry mobilization start' }).click()
  await page.waitForFunction(() => (window as unknown as { __mobilizationTest: BrowserBridge }).__mobilizationTest.startPending.length === 1)
  const requests = (await snapshot(page)).startRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  await resolveStart(page, { projectId: PROJECT_ID, startedAt: '2026-09-13T04:00:00.000Z' })
  await expect(page.getByRole('status')).toContainText('Mobilization start committed')
  await expect(page.getByText('Started', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})
