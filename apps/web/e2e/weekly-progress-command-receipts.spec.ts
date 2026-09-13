import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { basename, join, resolve, sep } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT_ID = '88888888-8888-4888-8888-888888888888'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ACTOR_ID = '99999999-9999-4999-8999-999999999999'
const PERIOD_ID = '55555555-5555-4555-8555-555555555555'
const FRESH_PERIOD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROGRESS_UPDATE_ID = '66666666-6666-4666-8666-666666666666'
const CAPTURE_REQUEST_ID = '77777777-7777-4777-8777-777777777777'

type Scope = { tenantId: string; actorId: string; projectId: string }
type PercentByCategory = {
  civil_pct: number
  electrical_pct: number
  mep_pct: number
  finishes_pct: number
  overall_pct: number
}
type WeeklyRow = {
  id: string
  projectId: string
  progressUpdateId: string
  clientRequestId: string
  weekEnding: string
  cutoffAt: string
  status: 'open' | 'locked'
  percentByCategory: PercentByCategory
  notes: string
  warSnapshot: {
    weekEnding: string
    overallPct: number
    percentByCategory: PercentByCategory
    notes: string
    capturedAt: string
  } | null
  lockedAt: string | null
  lockedBy: string | null
  lockReason: string
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}
type FormProps = Scope & {
  canSubmit: boolean
  coreWritesEnabled: boolean
  defaultWeekEnding?: string
}
type LedgerProps = Scope & {
  rows: WeeklyRow[]
  canLock: boolean
  enabled: boolean
  loadError?: string | null
}
type MountKind = 'form' | 'ledger' | 'both'
type MountProps = { form?: FormProps; ledger?: LedgerProps }
type RecordedRequest = { scope: Scope; command: Record<string, unknown> }
type RecordedLockRequest = RecordedRequest & { periodId: string }
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type BrowserBridge = {
  captureRequests: RecordedRequest[]
  lockRequests: RecordedLockRequest[]
  legacyCaptureRequests: Array<{
    projectId: string
    weekEnding: string
    values: Record<string, unknown>
  }>
  legacyLockRequests: Array<{
    projectId: string
    periodId: string
    expectedVersion: number
    lockReason: string
  }>
  capturePending: Pending[]
  lockPending: Pending[]
  legacyCapturePending: Pending[]
  legacyLockPending: Pending[]
  refreshes: number
  throwOnRefresh: boolean
  mount: (kind: MountKind, props: MountProps) => Promise<void>
  resolveCapture: (value: unknown) => void
  rejectCapture: (error: unknown) => void
  resolveLock: (value: unknown) => void
  rejectLock: (error: unknown) => void
  resolveLegacyCapture: (value: unknown) => void
  resolveLegacyLock: (value: unknown) => void
}

let harnessDirectory = ''
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined
test.describe.configure({ mode: 'serial' })

const scope: Scope = {
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  projectId: PROJECT_ID,
}
const percentages: PercentByCategory = {
  civil_pct: 40,
  electrical_pct: 50,
  mep_pct: 30,
  finishes_pct: 20,
  overall_pct: 35,
}
const defaultFormProps: FormProps = {
  ...scope,
  canSubmit: true,
  coreWritesEnabled: true,
  defaultWeekEnding: '2026-10-04',
}
const openRow: WeeklyRow = {
  id: PERIOD_ID,
  projectId: PROJECT_ID,
  progressUpdateId: PROGRESS_UPDATE_ID,
  clientRequestId: CAPTURE_REQUEST_ID,
  weekEnding: '2026-10-04',
  cutoffAt: '2026-10-08T09:00:00.000Z',
  status: 'open',
  percentByCategory: percentages,
  notes: '',
  warSnapshot: null,
  lockedAt: null,
  lockedBy: null,
  lockReason: '',
  version: 1,
  createdBy: ACTOR_ID,
  createdAt: '2026-10-05T08:00:00.000Z',
  updatedAt: '2026-10-05T08:00:00.000Z',
}
const freshLockedRow: WeeklyRow = {
  ...openRow,
  id: FRESH_PERIOD_ID,
  progressUpdateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  clientRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  status: 'locked',
  percentByCategory: {
    civil_pct: 90,
    electrical_pct: 86,
    mep_pct: 88,
    finishes_pct: 84,
    overall_pct: 88,
  },
  notes: 'Fresh ledger evidence',
  warSnapshot: {
    weekEnding: openRow.weekEnding,
    overallPct: 88,
    percentByCategory: {
      civil_pct: 90,
      electrical_pct: 86,
      mep_pct: 88,
      finishes_pct: 84,
      overall_pct: 88,
    },
    notes: 'Fresh ledger evidence',
    capturedAt: '2026-10-08T10:00:00.000Z',
  },
  lockedAt: '2026-10-08T10:00:00.000Z',
  lockedBy: ACTOR_ID,
  lockReason: 'Thursday WAR cutoff',
  version: 2,
  updatedAt: '2026-10-08T10:00:00.000Z',
}
const defaultLedgerProps: LedgerProps = {
  ...scope,
  rows: [openRow],
  canLock: true,
  enabled: true,
}

async function bridge(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const value = (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
    return {
      captureRequests: value.captureRequests,
      lockRequests: value.lockRequests,
      legacyCaptureRequests: value.legacyCaptureRequests,
      legacyLockRequests: value.legacyLockRequests,
      refreshes: value.refreshes,
    }
  })
}

async function mount(
  page: import('@playwright/test').Page,
  kind: MountKind,
  props: FormProps | LedgerProps | { form: FormProps; ledger: LedgerProps },
) {
  const next: MountProps =
    kind === 'form'
      ? { form: props as FormProps }
      : kind === 'ledger'
        ? { ledger: props as LedgerProps }
        : props as { form: FormProps; ledger: LedgerProps }
  await page.evaluate(
    ({ nextKind, nextProps }) => {
      const value = (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
      return value.mount(nextKind, nextProps)
    },
    { nextKind: kind, nextProps: next },
  )
}

async function resolveCapture(page: import('@playwright/test').Page, value: unknown) {
  await page.evaluate((result) => {
    const target = (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
    target.resolveCapture(result)
  }, value)
}
async function resolveLock(page: import('@playwright/test').Page, value: unknown) {
  await page.evaluate((result) => {
    const target = (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
    target.resolveLock(result)
  }, value)
}
async function resolveLegacyCapture(page: import('@playwright/test').Page, value: unknown) {
  await page.evaluate((result) => {
    const target = (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
    target.resolveLegacyCapture(result)
  }, value)
}

async function waitForCapture(page: import('@playwright/test').Page, count = 1) {
  await page.waitForFunction(
    (expected) =>
      (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
        .capturePending.length === expected,
    count,
  )
}
async function waitForLock(page: import('@playwright/test').Page, count = 1) {
  await page.waitForFunction(
    (expected) =>
      (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
        .lockPending.length === expected,
    count,
  )
}
async function waitForLegacyCapture(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () =>
      (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest
        .legacyCapturePending.length === 1,
  )
}

function capturePayload(request: RecordedRequest): string {
  const command = request.command
  return JSON.stringify({
    operation: 'capture',
    projectId: String(command.projectId ?? request.scope.projectId).toLowerCase(),
    weekEnding: String(command.weekEnding),
    percentByCategory: command.percentByCategory,
    notes: String(command.notes ?? ''),
  })
}
function lockPayload(request: RecordedLockRequest): string {
  const command = request.command
  return JSON.stringify({
    operation: 'lock',
    projectId: request.scope.projectId.toLowerCase(),
    periodId: request.periodId.toLowerCase(),
    expectedVersion: Number(command.expectedVersion),
    lockReason: String(command.lockReason ?? ''),
  })
}
function isoCutoff(weekEnding: string): string {
  const [year, month, day] = weekEnding.split('-').map(Number)
  const ending = new Date(Date.UTC(year!, month! - 1, day!))
  const daysUntilThursday = ((4 - ending.getUTCDay() + 7) % 7) || 7
  return new Date(
    Date.UTC(year!, month! - 1, day! + daysUntilThursday, 9, 0, 0, 0),
  ).toISOString()
}
function captureSuccess(request: RecordedRequest, warning?: string) {
  const command = request.command
  const projectId = String(command.projectId ?? request.scope.projectId)
  const clientRequestId = String(command.clientRequestId)
  const weekEnding = String(command.weekEnding)
  const notes = String(command.notes ?? '')
  const row: WeeklyRow = {
    ...openRow,
    projectId,
    clientRequestId,
    weekEnding,
    cutoffAt: isoCutoff(weekEnding),
    percentByCategory: command.percentByCategory as PercentByCategory,
    notes,
    createdBy: request.scope.actorId,
  }
  const receipt = {
    schemaVersion: 1,
    tenantId: request.scope.tenantId,
    actorId: request.scope.actorId,
    projectId,
    clientRequestId,
    payloadHash: createHash('sha256').update(capturePayload(request)).digest('hex'),
    row,
    operation: 'capture' as const,
    created: true,
  }
  return { ok: true, changed: true, receipt, ...(warning ? { warning } : {}) }
}
function lockSuccess(request: RecordedLockRequest, warning?: string) {
  const command = request.command
  const expectedVersion = Number(command.expectedVersion)
  const lockReason = String(command.lockReason ?? '')
  const lockedAt = '2026-10-08T10:00:00.000Z'
  const row: WeeklyRow = {
    ...openRow,
    projectId: request.scope.projectId,
    id: request.periodId,
    version: expectedVersion + 1,
    status: 'locked',
    lockedAt,
    lockedBy: request.scope.actorId,
    lockReason,
    updatedAt: lockedAt,
    warSnapshot: {
      weekEnding: openRow.weekEnding,
      overallPct: openRow.percentByCategory.overall_pct,
      percentByCategory: openRow.percentByCategory,
      notes: openRow.notes,
      capturedAt: lockedAt,
    },
  }
  const receipt = {
    schemaVersion: 1,
    tenantId: request.scope.tenantId,
    actorId: request.scope.actorId,
    projectId: request.scope.projectId,
    clientRequestId: String(command.clientRequestId),
    payloadHash: createHash('sha256').update(lockPayload(request)).digest('hex'),
    row,
    operation: 'lock' as const,
    expectedVersion,
  }
  return { ok: true, changed: true, receipt, ...(warning ? { warning } : {}) }
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const temporaryRoot = resolve(tmpdir())
  const prefix = 'erp-weekly-progress-command-receipts-'
  harnessDirectory = resolve(await mkdtemp(join(temporaryRoot, prefix)))
  if (
    !harnessDirectory.startsWith(temporaryRoot + sep) ||
    !basename(harnessDirectory).startsWith(prefix)
  ) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }
  const formPath = join(process.cwd(), 'src', 'components', 'progress', 'weekly-update-form.tsx')
  const ledgerPath = join(process.cwd(), 'src', 'components', 'progress', 'weekly-war-ledger.tsx')
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'weekly-command-actions.ts')
  const legacyActionsPath = join(harnessDirectory, 'legacy-actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')

  await writeFile(
    join(harnessDirectory, 'index.html'),
    '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>',
  )
  await writeFile(
    actionsPath,
    String.raw`
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  captureRequests: Array<{ scope: Record<string, string>; command: Record<string, unknown> }>
  lockRequests: Array<{ scope: Record<string, string>; periodId: string; command: Record<string, unknown> }>
  capturePending: Pending[]
  lockPending: Pending[]
  resolveCapture: (value: unknown) => void
  rejectCapture: (error: unknown) => void
  resolveLock: (value: unknown) => void
  rejectLock: (error: unknown) => void
}
const target = globalThis as unknown as { __weeklyProgressTest?: Bridge }
const bridge = target.__weeklyProgressTest ?? {
  captureRequests: [],
  lockRequests: [],
  capturePending: [],
  lockPending: [],
  legacyCaptureRequests: [],
  legacyLockRequests: [],
  legacyCapturePending: [],
  legacyLockPending: [],
  refreshes: 0,
  throwOnRefresh: false,
  resolveCapture(value: unknown) { bridge.capturePending.shift()?.resolve(value) },
  rejectCapture(error: unknown) { bridge.capturePending.shift()?.reject(error) },
  resolveLock(value: unknown) { bridge.lockPending.shift()?.resolve(value) },
  rejectLock(error: unknown) { bridge.lockPending.shift()?.reject(error) },
}
const state = bridge as Bridge & {
  captureRequests?: Array<{ scope: Record<string, string>; command: Record<string, unknown> }>
  lockRequests?: Array<{ scope: Record<string, string>; periodId: string; command: Record<string, unknown> }>
  capturePending?: Pending[]
  lockPending?: Pending[]
  resolveCapture?: (value: unknown) => void
  resolveLock?: (value: unknown) => void
}
state.captureRequests ??= []
state.lockRequests ??= []
state.capturePending ??= []
state.lockPending ??= []
state.resolveCapture ??= (value: unknown) => state.capturePending?.shift()?.resolve(value)
state.resolveLock ??= (value: unknown) => state.lockPending?.shift()?.resolve(value)
target.__weeklyProgressTest = bridge
export function captureWeeklyProgressCommand(scope: Record<string, string>, command: Record<string, unknown>) {
  bridge.captureRequests.push({ scope: { ...scope }, command: { ...command } })
  return new Promise((resolve, reject) => bridge.capturePending.push({ resolve, reject }))
}
export function lockWeeklyProgressCommand(scope: Record<string, string>, periodId: string, command: Record<string, unknown>) {
  bridge.lockRequests.push({ scope: { ...scope }, periodId, command: { ...command } })
  return new Promise((resolve, reject) => bridge.lockPending.push({ resolve, reject }))
}
`,
  )
  const legacySource = String.raw`
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  legacyCaptureRequests: Array<{ projectId: string; weekEnding: string; values: Record<string, unknown> }>
  legacyLockRequests: Array<{ projectId: string; periodId: string; expectedVersion: number; lockReason: string }>
  legacyCapturePending: Pending[]
  legacyLockPending: Pending[]
  resolveLegacyCapture: (value: unknown) => void
  resolveLegacyLock: (value: unknown) => void
}
const target = globalThis as unknown as { __weeklyProgressTest?: Bridge }
const bridge = target.__weeklyProgressTest ?? {
  captureRequests: [],
  lockRequests: [],
  capturePending: [],
  lockPending: [],
  legacyCaptureRequests: [],
  legacyLockRequests: [],
  legacyCapturePending: [],
  legacyLockPending: [],
  refreshes: 0,
  throwOnRefresh: false,
  resolveLegacyCapture(value: unknown) { bridge.legacyCapturePending.shift()?.resolve(value) },
  resolveLegacyLock(value: unknown) { bridge.legacyLockPending.shift()?.resolve(value) },
}
const state = bridge as Bridge & {
  captureRequests?: Array<{ scope: Record<string, string>; command: Record<string, unknown> }>
  lockRequests?: Array<{ scope: Record<string, string>; periodId: string; command: Record<string, unknown> }>
  capturePending?: Pending[]
  lockPending?: Pending[]
  resolveCapture?: (value: unknown) => void
  resolveLock?: (value: unknown) => void
}
state.captureRequests ??= []
state.lockRequests ??= []
state.capturePending ??= []
state.lockPending ??= []
state.resolveCapture ??= (value: unknown) => state.capturePending?.shift()?.resolve(value)
state.resolveLock ??= (value: unknown) => state.lockPending?.shift()?.resolve(value)
target.__weeklyProgressTest = bridge
export function submitWeeklyProgress(projectId: string, weekEnding: string, values: Record<string, unknown>) {
  bridge.legacyCaptureRequests.push({ projectId, weekEnding, values: { ...values } })
  return new Promise((resolve, reject) => bridge.legacyCapturePending.push({ resolve, reject }))
}
export function lockWeeklyProgress(projectId: string, periodId: string, expectedVersion: number, lockReason: string) {
  bridge.legacyLockRequests.push({ projectId, periodId, expectedVersion, lockReason })
  return new Promise((resolve, reject) => bridge.legacyLockPending.push({ resolve, reject }))
}
`
  await writeFile(legacyActionsPath, legacySource)
  await writeFile(
    navigationPath,
    String.raw`
export function useRouter() {
  return { refresh() {
    const bridge = (globalThis as unknown as { __weeklyProgressTest: { refreshes: number; throwOnRefresh: boolean } }).__weeklyProgressTest
    bridge.refreshes += 1
    if (bridge.throwOnRefresh) throw new Error('refresh transport detail')
  } }
}
`,
  )
  const harnessSource = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import __GLOBALS_PATH__
import { WeeklyUpdateForm } from __FORM_PATH__
import { WeeklyWarLedger } from __LEDGER_PATH__
const root = createRoot(document.getElementById('root')!)
type FormProps = React.ComponentProps<typeof WeeklyUpdateForm>
type LedgerProps = React.ComponentProps<typeof WeeklyWarLedger>
function CommitBoundary({ children, committed }: { children: React.ReactNode; committed: () => void }) {
  React.useEffect(committed, [committed])
  return children
}
const bridge = (globalThis as unknown as {
  __weeklyProgressTest: {
    mount: (kind: 'form' | 'ledger' | 'both', props: { form?: FormProps; ledger?: LedgerProps }) => Promise<void>
  }
}).__weeklyProgressTest
bridge.mount = (kind, props) => new Promise<void>(committed => {
  const form = props.form
  const ledger = props.ledger
  const scoped = form ?? ledger
  if (!scoped) throw new Error('A scoped component is required')
  const key = scoped.projectId + ':' + scoped.tenantId + ':' + scoped.actorId
  root.render(
    <React.StrictMode>
      <CommitBoundary committed={committed}>
      {form && (kind === 'form' || kind === 'both') ? <WeeklyUpdateForm key={'form:' + key} {...form} /> : null}
      {ledger && (kind === 'ledger' || kind === 'both') ? <WeeklyWarLedger key={'ledger:' + key} {...ledger} /> : null}
      </CommitBoundary>
    </React.StrictMode>,
  )
})
`
    .replaceAll('__GLOBALS_PATH__', JSON.stringify(globalsPath))
    .replaceAll('__FORM_PATH__', JSON.stringify(formPath))
    .replaceAll('__LEDGER_PATH__', JSON.stringify(ledgerPath))
  await writeFile(join(harnessDirectory, 'harness.tsx'), harnessSource)
  vite = await createServer({
    root: harnessDirectory,
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'] },
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: { allow: [process.cwd(), harnessDirectory] },
    },
    resolve: {
      alias: [
        { find: 'react', replacement: join(process.cwd(), 'node_modules', 'react') },
        { find: 'react-dom', replacement: join(process.cwd(), 'node_modules', 'react-dom') },
        { find: 'next/navigation', replacement: navigationPath },
        {
          find: '@/app/(dashboard)/projects/[id]/progress/weekly-command-actions',
          replacement: actionsPath,
        },
        {
          find: '@/app/(dashboard)/projects/[id]/progress/actions',
          replacement: legacyActionsPath,
        },
        { find: '@', replacement: join(process.cwd(), 'src') },
      ],
    },
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Vite harness did not expose a port')
  harnessUrl = 'http://127.0.0.1:' + address.port
})

test.afterAll(async () => {
  await vite?.close()
  if (
    harnessDirectory &&
    harnessDirectory.startsWith(resolve(tmpdir()) + sep) &&
    basename(harnessDirectory).startsWith('erp-weekly-progress-command-receipts-')
  ) {
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

async function fillWeeklyForm(page: import('@playwright/test').Page) {
  await page.getByLabel('Week ending').fill('2026-10-04')
  await page.getByLabel('Civil %').fill('40')
  await page.getByLabel('Electrical %').fill('50')
  await page.getByLabel('MEP %').fill('30')
  await page.getByLabel('Finishes %').fill('20')
  await page.getByLabel('Overall %').fill('35')
}

test('captures one exact command, retains it through unknown, and confirms the same receipt on retry', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'form', defaultFormProps)
  await fillWeeklyForm(page)
  const form = page.locator('form').first()
  const submit = form.locator('button[type="submit"]')
  await submit.click()
  await expect(submit).toBeDisabled()
  await form.evaluate((element) => {
    const target = element as HTMLFormElement
    target.requestSubmit()
    target.requestSubmit()
  })
  await waitForCapture(page)
  const firstSnapshot = await bridge(page)
  expect(firstSnapshot.captureRequests).toHaveLength(1)
  const first = firstSnapshot.captureRequests[0]!
  expect(first.scope).toEqual(scope)
  expect(first.command).toMatchObject({
    projectId: PROJECT_ID,
    weekEnding: '2026-10-04',
    percentByCategory: percentages,
  })
  expect(first.command.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i)
  await resolveCapture(page, {
    ok: false,
    outcome: 'unknown',
    error: 'private provider transport detail',
  })
  await expect(page.getByRole('alert')).toContainText(/unconfirmed/i)
  await expect(page.getByRole('alert')).not.toContainText('private provider')
  await expect(submit).toBeDisabled()
  const retry = page.getByRole('button', { name: /Retry/i })
  await expect(retry).toBeVisible()
  await retry.click()
  await waitForCapture(page)
  const retrySnapshot = await bridge(page)
  expect(retrySnapshot.captureRequests).toHaveLength(2)
  expect(retrySnapshot.captureRequests[1]).toEqual(first)
  await page.evaluate(() => {
    (window as unknown as { __weeklyProgressTest: BrowserBridge }).__weeklyProgressTest.throwOnRefresh = true
  })
  await resolveCapture(page, captureSuccess(first, 'Ledger refresh is temporarily unavailable.'))
  await expect(page.getByRole('status')).toContainText(/committed|captured|submitted/i)
  await expect(page.getByRole('status')).toContainText(/refresh|warning/i)
  expect((await bridge(page)).refreshes).toBe(1)
})

test('keeps an unknown capture frozen when a later exact retry is rejected', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'form', defaultFormProps)
  await fillWeeklyForm(page)
  const form = page.locator('form').first()
  await form.locator('button[type="submit"]').click()
  await waitForCapture(page)
  await resolveCapture(page, { ok: false, outcome: 'unknown', error: 'Unconfirmed' })
  await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible()
  const first = (await bridge(page)).captureRequests[0]!
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitForCapture(page)
  await resolveCapture(page, {
    ok: false,
    outcome: 'rejected',
    error: 'The retry conflicts with current evidence.',
  })
  await expect(page.getByRole('alert')).toContainText(/unconfirmed/i)
  await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible()
  await expect(form.locator('input').first()).toBeDisabled()
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit())
  expect((await bridge(page)).captureRequests).toHaveLength(2)
  expect((await bridge(page)).captureRequests[1]).toEqual(first)
})

test('locks with one stable command, single-flights, retries unknown, and renders immutable evidence', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'ledger', defaultLedgerProps)
  const lock = page.getByRole('button', { name: /Lock WAR|Locking/ })
  await lock.focus()
  await page.keyboard.press('Enter')
  await expect(lock).toBeDisabled()
  await lock.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await waitForLock(page)
  const firstSnapshot = await bridge(page)
  expect(firstSnapshot.lockRequests).toHaveLength(1)
  const first = firstSnapshot.lockRequests[0]!
  expect(first).toMatchObject({
    scope,
    periodId: PERIOD_ID,
    command: { expectedVersion: 1, lockReason: 'Thursday WAR cut-off' },
  })
  expect(first.command.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i)
  await resolveLock(page, { ok: false, outcome: 'unknown', error: 'private lock detail' })
  await expect(page.getByRole('alert')).toContainText(/unconfirmed/i)
  await expect(page.getByRole('alert')).not.toContainText('private lock detail')
  const retry = page.getByRole('button', { name: /Retry/i })
  await expect(retry).toBeVisible()
  await retry.focus()
  await page.keyboard.press('Enter')
  await waitForLock(page)
  const retrySnapshot = await bridge(page)
  expect(retrySnapshot.lockRequests).toHaveLength(2)
  expect(retrySnapshot.lockRequests[1]).toEqual(first)
  await resolveLock(page, lockSuccess(first))
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
  await expect(page.getByText('Immutable evidence', { exact: true })).toBeVisible()
  expect((await bridge(page)).refreshes).toBe(1)
})

test('keeps an unknown lock frozen after rejection and allows only the same-key reconciliation retry', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'ledger', defaultLedgerProps)
  await page.getByRole('button', { name: 'Lock WAR' }).click()
  await waitForLock(page)
  const first = (await bridge(page)).lockRequests[0]!
  await resolveLock(page, { ok: false, outcome: 'unknown', error: 'Unconfirmed' })
  await expect(page.getByRole('button', { name: 'Retry same lock' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same lock' }).click()
  await waitForLock(page)
  await resolveLock(page, { ok: false, outcome: 'rejected', error: 'Retry was rejected by current authority.' })
  await expect(page.getByRole('alert')).toContainText(/unconfirmed/i)
  await expect(page.getByRole('button', { name: 'Retry same lock' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same lock' }).click()
  await waitForLock(page)
  const requests = (await bridge(page)).lockRequests
  expect(requests).toHaveLength(3)
  expect(requests[1]).toEqual(first)
  expect(requests[2]).toEqual(first)
  await resolveLock(page, lockSuccess(first))
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
})

test('retains the lock retry when a refresh temporarily has no rows and does not claim a first period', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'ledger', defaultLedgerProps)
  await page.getByRole('button', { name: 'Lock WAR' }).click()
  await waitForLock(page)
  const first = (await bridge(page)).lockRequests[0]!
  await resolveLock(page, { ok: false, outcome: 'unknown', error: 'Unconfirmed' })
  await expect(page.getByRole('button', { name: 'Retry same lock' })).toBeVisible()
  await mount(page, 'ledger', { ...defaultLedgerProps, rows: [], enabled: true, loadError: null })
  await expect(page.getByText(/No Core weekly periods yet/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry same lock' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same lock' }).click()
  await waitForLock(page)
  await resolveLock(page, lockSuccess(first))
  await expect(page.getByRole('status')).toContainText(/WAR period locked/i)
  await expect(page.getByText(/No Core weekly periods yet/i)).toHaveCount(0)
})

test('keeps reconciliation available when a refresh already shows the period as locked', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'ledger', defaultLedgerProps)
  await page.getByRole('button', { name: 'Lock WAR' }).click()
  await waitForLock(page)
  const first = (await bridge(page)).lockRequests[0]!
  await resolveLock(page, { ok: false, outcome: 'unknown', error: 'Unconfirmed' })
  await expect(page.getByRole('button', { name: 'Retry same lock' })).toBeVisible()
  await mount(page, 'ledger', { ...defaultLedgerProps, rows: [freshLockedRow] })
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry same lock' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry same lock' }).click()
  await waitForLock(page)
  expect((await bridge(page)).lockRequests[1]).toEqual(first)
  await resolveLock(page, lockSuccess(first))
  await expect(page.getByRole('status')).toContainText(/WAR period locked|already recorded/i)
})

test('ignores late capture receipts after actor, tenant, or project scope replacement', async ({ page }) => {
  const replacements: Scope[] = [
    { ...scope, actorId: OTHER_ACTOR_ID },
    { ...scope, tenantId: OTHER_TENANT_ID },
    { ...scope, projectId: OTHER_PROJECT_ID },
  ]
  for (const replacement of replacements) {
    await page.goto(harnessUrl)
    await mount(page, 'form', defaultFormProps)
    await fillWeeklyForm(page)
    await page.locator('form').first().locator('button[type="submit"]').click()
    await waitForCapture(page)
    const first = (await bridge(page)).captureRequests[0]!
    await mount(page, 'form', {
      ...defaultFormProps,
      ...replacement,
      defaultWeekEnding: '2026-10-11',
    })
    await expect(page.getByLabel('Week ending')).toHaveValue('2026-10-11')
    await resolveCapture(page, captureSuccess(first))
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect((await bridge(page)).refreshes).toBe(0)
  }
})

test('retains the capture command through temporary permission loss and reuses its key', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'form', defaultFormProps)
  await fillWeeklyForm(page)
  await page.locator('form').first().locator('button[type="submit"]').click()
  await waitForCapture(page)
  const first = (await bridge(page)).captureRequests[0]!
  await mount(page, 'form', { ...defaultFormProps, canSubmit: false })
  await resolveCapture(page, { ok: false, outcome: 'unknown', error: 'Unconfirmed' })
  await expect(page.getByRole('button', { name: /Retry/i })).toHaveCount(0)
  await mount(page, 'form', defaultFormProps)
  await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible()
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitForCapture(page)
  expect((await bridge(page)).captureRequests[1]).toEqual(first)
  await resolveCapture(page, captureSuccess(first))
})

test('retains a lock command through enabled and load-error changes', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'ledger', defaultLedgerProps)
  await page.getByRole('button', { name: 'Lock WAR' }).click()
  await waitForLock(page)
  const first = (await bridge(page)).lockRequests[0]!
  await resolveLock(page, { ok: false, outcome: 'unknown', error: 'Unconfirmed' })
  await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible()
  await mount(page, 'ledger', {
    ...defaultLedgerProps,
    canLock: false,
    enabled: false,
    loadError: 'The ledger read is temporarily unavailable.',
  })
  await expect(page.getByRole('button', { name: /Retry/i })).toHaveCount(0)
  await mount(page, 'ledger', defaultLedgerProps)
  await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible()
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitForLock(page)
  expect((await bridge(page)).lockRequests[1]).toEqual(first)
  await resolveLock(page, lockSuccess(first))
})

test('does not let an old lock receipt replace fresh ledger rows or dirty form input', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'both', { form: defaultFormProps, ledger: defaultLedgerProps })
  const civil = page.getByLabel('Civil %')
  await civil.fill('44')
  await page.getByRole('button', { name: 'Lock WAR' }).click()
  await waitForLock(page)
  const oldRequest = (await bridge(page)).lockRequests[0]!
  await mount(page, 'both', {
    form: defaultFormProps,
    ledger: { ...defaultLedgerProps, rows: [freshLockedRow] },
  })
  await expect(page.getByText('88%', { exact: true })).toBeVisible()
  await resolveLock(page, lockSuccess(oldRequest))
  await expect(civil).toHaveValue('44')
  await expect(page.getByText('88%', { exact: true })).toBeVisible()
  await expect(page.getByText('Immutable evidence', { exact: true })).toBeVisible()
  await expect(page.getByText('35%', { exact: true })).toHaveCount(0)
})

test('preserves the legacy form path when Core writes are disabled', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'form', { ...defaultFormProps, coreWritesEnabled: false })
  await fillWeeklyForm(page)
  await page.locator('form').first().locator('button[type="submit"]').click()
  await waitForLegacyCapture(page)
  const snapshot = await bridge(page)
  expect(snapshot.captureRequests).toHaveLength(0)
  expect(snapshot.legacyCaptureRequests).toHaveLength(1)
  expect(snapshot.legacyCaptureRequests[0]).toMatchObject({
    projectId: PROJECT_ID,
    weekEnding: '2026-10-04',
  })
  await resolveLegacyCapture(page, { id: PROGRESS_UPDATE_ID })
  await expect(page.getByRole('status')).toContainText(/submitted|saved|committed/i)
})

test('uses step-any percentage input and preserves the decimal auto-overall in the Core command', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'form', defaultFormProps)
  await page.getByLabel('Week ending').fill('2026-10-04')
  const overall = page.getByLabel('Overall %')
  await expect(overall).toHaveAttribute('step', 'any')
  await page.getByLabel('Civil %').fill('1')
  await expect(overall).toHaveValue('0.3')
  await page.locator('form').first().locator('button[type="submit"]').click()
  await waitForCapture(page)
  const request = (await bridge(page)).captureRequests[0]!
  expect(request.command).toMatchObject({
    percentByCategory: { civil_pct: 1, overall_pct: 0.3 },
  })
  await resolveCapture(page, captureSuccess(request))
  await expect(page.getByRole('status')).toContainText(/Receipt verified/i)
})

test('keeps weekly controls keyboard reachable without horizontal overflow at review widths', async ({ page }) => {
  await page.goto(harnessUrl)
  await mount(page, 'both', { form: defaultFormProps, ledger: defaultLedgerProps })
  await page.getByLabel('Week ending').focus()
  const civil = page.getByLabel('Civil %')
  for (let index = 0; index < 6; index += 1) {
    if (await civil.evaluate(element => document.activeElement === element)) break
    await page.keyboard.press('Tab')
  }
  await expect(civil).toBeFocused()
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: join(tmpdir(), 'erp-weekly-progress-command-receipts-' + width + '.png'),
      fullPage: true,
    })
  }
})
