import { expect, test } from '@playwright/test'
import { basename, join, resolve, sep } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const BOM_ID = '55555555-5555-4555-8555-555555555555'
const OTHER_BOM_ID = '66666666-6666-4666-8666-666666666666'
const HANDOFF_ID = '77777777-7777-4777-8777-777777777777'

type PanelProps = {
  projectId: string
  bomId: string
  projectCode: string | null
  handoff: {
    id: string
    status: 'active' | 'reversed'
    projectCode: string
    budgetId: string
    dpInvoiceId: string
    projectTrackerId: string
    taskIds: Record<string, string>
  } | null
}

type ActionResponse = { ok: true; refreshWarning?: string } | { ok: false; error: string }

type BrowserBridge = {
  awardRequests: Array<Record<string, string>>
  reverseRequests: Array<Record<string, string>>
  awardPending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>
  reversePending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>
  refreshes: number
  throwOnRefresh: boolean
  mount: (props: PanelProps) => void
  resolveAward: (value: ActionResponse) => void
  rejectAward: (error: unknown) => void
  resolveReverse: (value: ActionResponse) => void
  rejectReverse: (error: unknown) => void
}

let harnessDirectory = ''
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined

test.describe.configure({ mode: 'serial' })

const defaultProps: PanelProps = {
  projectId: PROJECT_ID,
  bomId: BOM_ID,
  projectCode: 'ABI-2026-001',
  handoff: null,
}

const activeHandoff: NonNullable<PanelProps['handoff']> = {
  id: HANDOFF_ID,
  status: 'active',
  projectCode: 'ABI-2026-001',
  budgetId: 'budget-1',
  dpInvoiceId: 'invoice-1',
  projectTrackerId: 'tracker-1',
  taskIds: {
    arProjectCode: 'task-ar',
    downPaymentInvoice: 'task-dp',
    cari: 'task-cari',
    projectTracker: 'task-tracker',
    cxOnboarding: 'task-cx',
  },
}

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    return {
      awardRequests: bridge.awardRequests,
      reverseRequests: bridge.reverseRequests,
      refreshes: bridge.refreshes,
    }
  })
}

async function resolveAward(page: import('@playwright/test').Page, response: ActionResponse) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    bridge.resolveAward(value)
  }, response)
}

async function rejectAward(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    bridge.rejectAward(new Error('sensitive network details'))
  })
}

async function resolveReverse(page: import('@playwright/test').Page, response: ActionResponse) {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    bridge.resolveReverse(value)
  }, response)
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const temporaryRoot = resolve(tmpdir())
  const prefix = 'erp-award-reversal-'
  harnessDirectory = resolve(await mkdtemp(join(temporaryRoot, prefix)))
  if (!harnessDirectory.startsWith(`${temporaryRoot}${sep}`) || !basename(harnessDirectory).startsWith(prefix)) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }

  const componentPath = join(process.cwd(), 'src', 'components', 'bom', 'award-automation-panel.tsx')
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'award-actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')
  await writeFile(join(harnessDirectory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(actionsPath, `
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  awardRequests: Array<Record<string, string>>
  reverseRequests: Array<Record<string, string>>
  awardPending: Pending[]
  reversePending: Pending[]
  refreshes: number
  throwOnRefresh: boolean
  resolveAward: (value: unknown) => void
  rejectAward: (error: unknown) => void
  resolveReverse: (value: unknown) => void
  rejectReverse: (error: unknown) => void
}
function values(formData: FormData): Record<string, string> {
  return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, typeof value === 'string' ? value : value.name]))
}
const target = globalThis as unknown as { __awardTest?: Bridge }
const bridge = target.__awardTest ?? {
  awardRequests: [], reverseRequests: [], awardPending: [], reversePending: [], refreshes: 0, throwOnRefresh: false,
  resolveAward(value: unknown) { bridge.awardPending.shift()?.resolve(value) },
  rejectAward(error: unknown) { bridge.awardPending.shift()?.reject(error) },
  resolveReverse(value: unknown) { bridge.reversePending.shift()?.resolve(value) },
  rejectReverse(error: unknown) { bridge.reversePending.shift()?.reject(error) },
}
target.__awardTest = bridge
export function awardLockedBom(formData: FormData): Promise<unknown> {
  bridge.awardRequests.push(values(formData))
  return new Promise((resolve, reject) => bridge.awardPending.push({ resolve, reject }))
}
export function reverseAwardHandoff(formData: FormData): Promise<unknown> {
  bridge.reverseRequests.push(values(formData))
  return new Promise((resolve, reject) => bridge.reversePending.push({ resolve, reject }))
}
`)
  await writeFile(navigationPath, `
export function useRouter() {
  return { refresh() {
    const bridge = (globalThis as unknown as { __awardTest: { refreshes: number; throwOnRefresh: boolean } }).__awardTest
    bridge.refreshes += 1
    if (bridge.throwOnRefresh) throw new Error('refresh transport detail')
  } }
}
`)
  await writeFile(join(harnessDirectory, 'harness.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(globalsPath)}
import { AwardAutomationPanel } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
const bridge = (globalThis as unknown as { __awardTest: { mount: (props: unknown) => void } }).__awardTest
bridge.mount = (props: unknown) => root.render(<React.StrictMode><AwardAutomationPanel {...(props as never)} /></React.StrictMode>)
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
        { find: '@/app/(dashboard)/projects/[id]/bom/award-actions', replacement: actionsPath },
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
  if (harnessDirectory && harnessDirectory.startsWith(resolve(tmpdir()) + sep) && basename(harnessDirectory).startsWith('erp-award-reversal-')) {
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

test('holds the award request pending, catches network failure, and retries the exact payload', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(harnessUrl)
  await page.getByLabel('Down payment %').fill('12.5')
  const submit = page.getByRole('button', { name: 'Create award handoff' })
  await submit.click()
  await expect(page.getByRole('button', { name: 'Creating handoff…' })).toBeDisabled()
  await page.locator('form').evaluate((element) => {
    const form = element as HTMLFormElement
    form.requestSubmit()
    form.requestSubmit()
  })
  expect((await snapshot(page)).awardRequests).toHaveLength(1)

  await rejectAward(page)
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('sensitive network details')
  await expect(page.getByLabel('Down payment %')).toHaveValue('12.5')
  const retry = page.getByRole('button', { name: 'Retry award handoff' })
  await expect(retry).toBeEnabled()
  await retry.click()
  await page.waitForFunction(() => (window as unknown as { __awardTest: BrowserBridge }).__awardTest.awardPending.length === 1)
  const requests = (await snapshot(page)).awardRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  await resolveAward(page, { ok: false, error: 'The locked BOM changed. Review it before trying again.' })
  await expect(page.getByRole('alert')).toContainText('locked BOM changed')
  await expect(page.getByRole('button', { name: 'Create award handoff' })).toBeEnabled()
  expect(pageErrors).toEqual([])
})

test('reports committed success separately from refresh warnings and refresh failures', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: 'Create award handoff' }).click()
  await resolveAward(page, { ok: true, refreshWarning: 'Refresh is delayed; reload if needed.' })
  await expect(page.getByRole('status')).toContainText('Award handoff committed')
  await expect(page.getByRole('status')).toContainText('Refresh is delayed')
  expect((await snapshot(page)).refreshes).toBe(1)

  await page.evaluate(() => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    bridge.throwOnRefresh = true
  })
  await page.evaluate((props) => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    bridge.mount(props)
  }, defaultProps)
  await page.getByRole('button', { name: 'Create award handoff' }).click()
  await resolveAward(page, { ok: true })
  await expect(page.getByRole('status')).toContainText('committed')
  await expect(page.getByRole('status')).toContainText('could not refresh')
  await expect(page.getByRole('status')).not.toContainText('page was refreshed')
})

test('does not let a prior scope response mutate a newly mounted project', async ({ page }) => {
  await page.goto(harnessUrl)
  await page.getByRole('button', { name: 'Create award handoff' }).click()
  await expect(page.getByRole('button', { name: 'Creating handoff…' })).toBeDisabled()
  await page.evaluate((props) => {
    const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
    bridge.mount(props)
  }, { ...defaultProps, projectId: OTHER_PROJECT_ID, bomId: OTHER_BOM_ID })
  await expect(page.getByRole('button', { name: 'Create award handoff' })).toBeEnabled()
  await resolveAward(page, { ok: true })
  await expect(page.getByRole('status')).toHaveCount(0)
  expect((await snapshot(page)).refreshes).toBe(0)
})

test('keeps reversal controls keyboard reachable and fits supported widths', async ({ page }) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(harnessUrl)
    await page.evaluate((props) => {
      const bridge = (window as unknown as { __awardTest: BrowserBridge }).__awardTest
      bridge.mount(props)
    }, { ...defaultProps, handoff: activeHandoff })
    const reason = page.locator('#award-reversal-reason')
    await expect(reason).toHaveValue('Commercial award requires correction')
    await reason.focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Reverse handoff' })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 320) await page.screenshot({ path: join(tmpdir(), `erp-award-reversal-${width}.png`), fullPage: true })
  }
  const customReason = 'Correct the approved commercial scope before mobilization'
  await page.getByLabel('Reversal reason').fill(customReason)
  await page.getByRole('button', { name: 'Reverse handoff' }).click()
  await expect(page.getByRole('button', { name: 'Reversing…' })).toBeDisabled()
  await page.locator('form').evaluate((element) => {
    (element as HTMLFormElement).requestSubmit()
  })
  expect((await snapshot(page)).reverseRequests).toHaveLength(1)
  await page.evaluate(() => {
    (window as unknown as { __awardTest: BrowserBridge }).__awardTest.rejectReverse(new Error('sensitive network details'))
  })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByLabel('Reversal reason')).toHaveValue(customReason)
  await page.getByRole('button', { name: 'Retry reversal' }).click()
  const requests = (await snapshot(page)).reverseRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect(requests[1]?.reason).toBe(customReason)
  await resolveReverse(page, { ok: true })
  await expect(page.getByRole('status')).toContainText('Award reversal committed')
})
