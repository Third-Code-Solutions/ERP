import { expect, test } from './fixtures'
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
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TASK_IDS = [
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
]

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Reviewed mobilisation plan</Name>
  <Tasks>
    <Task><UID>1</UID><ID>1</ID><Name>Mobilization</Name><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Start>2026-09-01T08:00:00</Start><Finish>2026-09-03T17:00:00</Finish><Summary>1</Summary></Task>
    <Task><UID>2</UID><ID>2</ID><Name>Site setup</Name><OutlineNumber>1.1</OutlineNumber><OutlineLevel>2</OutlineLevel><Start>2026-09-04T08:00:00+08:00</Start><Finish>2026-09-05T17:00:00+08:00</Finish><Summary>0</Summary></Task>
    <Task><UID>3</UID><ID>3</ID><Name>Temporary utilities</Name><OutlineNumber>1.2</OutlineNumber><OutlineLevel>2</OutlineLevel><Start>2026-09-06T08:00:00+08:00</Start><Finish>2026-09-07T17:00:00+08:00</Finish><Summary>0</Summary><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
  </Tasks>
</Project>`
const XML_BYTES = Buffer.from(XML, 'utf8')
const SOURCE_BASE64 = XML_BYTES.toString('base64')
const SOURCE_HASH = createHash('sha256').update(XML_BYTES).digest('hex')

type FormProps = {
  projectId: string
  tenantId: string
  actorId: string
  canManage: boolean
}

type ActionScope = { tenantId: string; actorId: string }
type PreviewCommand = { projectId: string; sourceBase64: string; fileName?: string }
type Mapping = { sourceUid: number; sourceOutlineLevel: number; level: 'l1' | 'l2' | 'l3' | 'l4'; ownerId: string | null }
type PreviewTask = {
  sourceUid: number
  sourceId: number | null
  outlineNumber: string | null
  outlineLevel: number
  outlinePath: string[]
  name: string
  isSummary: boolean
  sourceStart: { raw: string; calendarDate: string }
  sourceFinish: { raw: string; calendarDate: string }
  parentSourceUid: number | null
  predecessor: {
    predecessorUid: number
    typeCode: 1
    type: 'finish-to-start'
    crossProject: false
    crossProjectName: null
    linkLag: 0
    lagFormat: number | null
  } | null
}
type PreviewData = {
  sourceHash: string | null
  sourceBytes: number
  parserVersion: 'ms-project-xml-v1'
  fileName: string | null
  projectName: string
  tasks: PreviewTask[]
  issues: Array<{ code: string; path: string; message: string; severity: 'error' | 'notice' }>
  notices: Array<{ code: string; path: string; message: string; severity: 'error' | 'notice' }>
  disclosures: string[]
  canImport: boolean
  omittedSummaryTask: { sourceUid: 0; name: string } | null
}
type PreviewResult = { tenantId: string; actorId: string; projectId: string; preview: PreviewData }
type ImportData = {
  ok: true
  projectId: string
  requestId: string
  sourceHash: string
  parserVersion: 'ms-project-xml-v1'
  created: boolean
  changed: boolean
  receipt: {
    tenantId: string
    actorId: string
    projectId: string
    requestId: string
    sourceHash: string
    parserVersion: 'ms-project-xml-v1'
    mappings: Mapping[]
    tasks: Array<{ sourceUid: number; taskId: string; version: number; level: Mapping['level']; ownerId: string | null }>
  }
}

type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type BrowserBridge = {
  previewRequests: Array<{ command: PreviewCommand; expectedScope: ActionScope }>
  importRequests: Array<{ command: Record<string, unknown>; expectedScope: ActionScope }>
  previewPending: Pending[]
  importPending: Pending[]
  refreshes: number
  throwOnRefresh: boolean
  mount: (props: FormProps) => Promise<void>
  resolvePreview: (value: unknown) => void
  rejectPreview: (error: unknown) => void
  resolveImport: (value: unknown) => void
  rejectImport: (error: unknown) => void
}

let harnessDirectory = ''
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined

test.describe.configure({ mode: 'serial' })

const defaultProps: FormProps = {
  projectId: PROJECT_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  canManage: true,
}

function task(sourceUid: number, name: string, outlineLevel = 1, parentSourceUid: number | null = null): PreviewTask {
  return {
    sourceUid,
    sourceId: sourceUid,
    outlineNumber: outlineLevel === 1 ? String(sourceUid) : `1.${sourceUid - 1}`,
    outlineLevel,
    outlinePath: outlineLevel === 1 ? [String(sourceUid)] : ['1', String(sourceUid - 1)],
    name,
    isSummary: false,
    sourceStart: { raw: '2026-09-01T08:00:00', calendarDate: '2026-09-01' },
    sourceFinish: { raw: '2026-09-03T17:00:00', calendarDate: '2026-09-03' },
    parentSourceUid,
    predecessor: null,
  }
}

const preview: PreviewResult = {
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  projectId: PROJECT_ID,
  preview: {
    sourceHash: SOURCE_HASH,
    sourceBytes: XML_BYTES.byteLength,
    parserVersion: 'ms-project-xml-v1',
    fileName: 'reviewed.xml',
    projectName: 'Reviewed mobilisation plan',
    tasks: [
      {
        ...task(1, 'Mobilization'),
        isSummary: true,
        sourceFinish: { raw: '2026-09-03T17:00:00', calendarDate: '2026-09-03' },
      },
      {
        ...task(2, 'Site setup', 2, 1),
        sourceStart: { raw: '2026-09-04T08:00:00+08:00', calendarDate: '2026-09-04' },
        sourceFinish: { raw: '2026-09-05T17:00:00+08:00', calendarDate: '2026-09-05' },
        predecessor: null,
      },
      {
        ...task(3, 'Temporary utilities', 2, 1),
        sourceStart: { raw: '2026-09-06T08:00:00+08:00', calendarDate: '2026-09-06' },
        sourceFinish: { raw: '2026-09-07T17:00:00+08:00', calendarDate: '2026-09-07' },
        predecessor: {
          predecessorUid: 2,
          typeCode: 1,
          type: 'finish-to-start',
          crossProject: false,
          crossProjectName: null,
          linkLag: 0,
          lagFormat: 7,
        },
      },
    ],
    issues: [],
    notices: [{ code: 'PROJECT_SUMMARY_EXCLUDED', path: 'Tasks[0]', message: 'Project summary is excluded from the register.', severity: 'notice' }],
    disclosures: [
      'Planning dates and hierarchy only; actuals, progress, resources, calendars, costs, and labour are not imported.',
      'Every XML task requires explicit reviewed L1-L4 mapping before commit; XML outline depth is not an ABI schedule level.',
    ],
    canImport: true,
    omittedSummaryTask: { sourceUid: 0, name: 'Reviewed mobilisation plan' },
  },
}

function importData(request: { command: Record<string, unknown> }): ImportData {
  const command = request.command
  const mappings = command.mappings as Mapping[]
  const requestId = String(command.requestId)
  const sourceHash = String(command.sourceHash)
  const projectId = String(command.projectId)
  const receiptTasks = mappings.map((mapping, index) => ({
    sourceUid: mapping.sourceUid,
    taskId: TASK_IDS[index] ?? '88888888-8888-4888-8888-888888888888',
    version: 1,
    level: mapping.level,
    ownerId: null,
  }))
  return {
    ok: true,
    projectId,
    requestId,
    sourceHash,
    parserVersion: 'ms-project-xml-v1',
    created: true,
    changed: true,
    receipt: {
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      projectId,
      requestId,
      sourceHash,
      parserVersion: 'ms-project-xml-v1',
      mappings,
      tasks: receiptTasks,
    },
  }
}

async function snapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest
    return {
      previewRequests: bridge.previewRequests,
      importRequests: bridge.importRequests,
      refreshes: bridge.refreshes,
    }
  })
}

async function resolvePreview(page: import('@playwright/test').Page, value: unknown) {
  await page.evaluate((result) => {
    const bridge = (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest
    bridge.resolvePreview(result)
  }, value)
}

async function resolveImport(page: import('@playwright/test').Page, value: unknown) {
  await page.evaluate((result) => {
    const bridge = (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest
    bridge.resolveImport(result)
  }, value)
}

async function mount(page: import('@playwright/test').Page, props: FormProps) {
  await page.evaluate((nextProps) => {
    const bridge = (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest
    return bridge.mount(nextProps)
  }, props)
}

async function chooseXml(page: import('@playwright/test').Page, name = 'reviewed.xml', bytes = XML_BYTES) {
  await page.getByLabel('MS Project XML file').setInputFiles({ name, mimeType: 'application/xml', buffer: bytes })
}

async function previewXml(page: import('@playwright/test').Page) {
  await chooseXml(page)
  await page.getByRole('button', { name: 'Preview XML' }).click()
  await expect(page.getByRole('button', { name: 'Previewing XML…' })).toBeDisabled()
  await page.waitForFunction(() => (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest.previewPending.length === 1)
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const temporaryRoot = resolve(tmpdir())
  const prefix = 'erp-ms-project-xml-'
  harnessDirectory = resolve(await mkdtemp(join(temporaryRoot, prefix)))
  if (!harnessDirectory.startsWith(`${temporaryRoot}${sep}`) || !basename(harnessDirectory).startsWith(prefix)) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }

  const componentPath = join(process.cwd(), 'src', 'components', 'schedule', 'ms-project-xml-importer.tsx')
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'ms-project-xml-actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')

  await writeFile(join(harnessDirectory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(actionsPath, `
type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
type Bridge = {
  previewRequests: Array<{ command: unknown; expectedScope: unknown }>
  importRequests: Array<{ command: unknown; expectedScope: unknown }>
  previewPending: Pending[]
  importPending: Pending[]
  refreshes: number
  throwOnRefresh: boolean
  resolvePreview: (value: unknown) => void
  rejectPreview: (error: unknown) => void
  resolveImport: (value: unknown) => void
  rejectImport: (error: unknown) => void
}
const target = globalThis as unknown as { __msProjectXmlTest?: Bridge }
const bridge = target.__msProjectXmlTest ?? {
  previewRequests: [], importRequests: [], previewPending: [], importPending: [], refreshes: 0, throwOnRefresh: false,
  resolvePreview(value: unknown) { bridge.previewPending.shift()?.resolve(value) },
  rejectPreview(error: unknown) { bridge.previewPending.shift()?.reject(error) },
  resolveImport(value: unknown) { bridge.importPending.shift()?.resolve(value) },
  rejectImport(error: unknown) { bridge.importPending.shift()?.reject(error) },
}
target.__msProjectXmlTest = bridge
export function previewMsProjectXmlAction(input: { command: unknown; expectedScope: unknown }): Promise<unknown> {
  bridge.previewRequests.push(input)
  return new Promise((resolve, reject) => bridge.previewPending.push({ resolve, reject }))
}
export function importMsProjectXmlAction(input: { command: unknown; expectedScope: unknown }): Promise<unknown> {
  bridge.importRequests.push(input)
  return new Promise((resolve, reject) => bridge.importPending.push({ resolve, reject }))
}
`)
  await writeFile(navigationPath, `
export function useRouter() {
  return { refresh() {
    const bridge = (globalThis as unknown as { __msProjectXmlTest: { refreshes: number; throwOnRefresh: boolean } }).__msProjectXmlTest
    bridge.refreshes += 1
    if (bridge.throwOnRefresh) throw new Error('refresh transport detail')
  } }
}
`)
  await writeFile(join(harnessDirectory, 'harness.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(globalsPath)}
import { MsProjectXmlImporter } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
type HarnessProps = { projectId: string; tenantId: string; actorId: string; canManage: boolean }
function CommitBoundary({ children, committed }: { children: React.ReactNode; committed: () => void }) {
  React.useEffect(committed, [committed])
  return children
}
const bridge = (globalThis as unknown as { __msProjectXmlTest: { mount: (props: HarnessProps) => Promise<void> } }).__msProjectXmlTest
bridge.mount = (props) => new Promise<void>(committed => {
  const key = props.projectId + ':' + props.tenantId + ':' + props.actorId
  root.render(<React.StrictMode><CommitBoundary committed={committed}><MsProjectXmlImporter key={key} {...props} /></CommitBoundary></React.StrictMode>)
})
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
        { find: '@/app/(dashboard)/projects/[id]/schedule/ms-project-xml-actions', replacement: actionsPath },
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
  if (harnessDirectory && harnessDirectory.startsWith(resolve(tmpdir()) + sep) && basename(harnessDirectory).startsWith('erp-ms-project-xml-')) {
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

test('rejects native MPP files and previews XML evidence with planning disclosures', async ({ page }) => {
  await page.goto(harnessUrl)
  await chooseXml(page, 'native-plan.mpp')
  await expect(page.getByRole('alert')).toContainText('Only exported MS Project XML')
  expect((await snapshot(page)).previewRequests).toHaveLength(0)

  await chooseXml(page, 'oversized.xml', Buffer.alloc(1_048_577, 88))
  await expect(page.getByRole('alert')).toContainText('exceeds the 1 MiB limit')
  expect((await snapshot(page)).previewRequests).toHaveLength(0)

  await previewXml(page)
  const request = (await snapshot(page)).previewRequests[0]
  expect(request).toMatchObject({ expectedScope: { tenantId: TENANT_ID, actorId: ACTOR_ID } })
  expect(request?.command).toEqual({ projectId: PROJECT_ID, sourceBase64: SOURCE_BASE64, fileName: 'reviewed.xml' })
  await resolvePreview(page, { ok: true, data: preview })
  await expect(page.getByRole('heading', { name: 'Reviewed mobilisation plan' })).toBeVisible()
  await expect(page.getByText('UID 2', { exact: true })).toBeVisible()
  await expect(page.getByText(/2026-09-04T08:00:00\+08:00/)).toBeVisible()
  await expect(page.getByText(/UID 2 · finish-to-start/)).toBeVisible()
  await expect(page.getByText(/actuals, progress, resources, calendars, costs, and labour are not imported/)).toBeVisible()
  await expect(page.locator('tbody').getByText('Unassigned', { exact: true })).toHaveCount(3)
  const depthMappings = page.getByRole('combobox', { name: /Apply target ERP level to outline depth/ })
  await expect(depthMappings).toHaveCount(2)
  await depthMappings.nth(0).selectOption('l1')
  await depthMappings.nth(1).selectOption('l2')
  await expect(page.getByRole('combobox', { name: /ERP level for XML task/ }).nth(0)).toHaveValue('l1')
  await expect(page.getByRole('combobox', { name: /ERP level for XML task/ }).nth(1)).toHaveValue('l2')
  await expect(page.getByRole('combobox', { name: /ERP level for XML task/ }).nth(2)).toHaveValue('l2')
  await expect(page.getByRole('combobox', { name: /ERP level for XML task/ })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Confirm reviewed import' })).toBeDisabled()
})

test('requires explicit mappings and retries an uncertain import with the exact frozen command', async ({ page }) => {
  await page.goto(harnessUrl)
  await previewXml(page)
  await resolvePreview(page, { ok: true, data: preview })
  const mappings = page.getByRole('combobox', { name: /ERP level for XML task/ })
  const depthMappings = page.getByRole('combobox', { name: /Apply target ERP level to outline depth/ })
  await depthMappings.nth(0).selectOption('l1')
  await depthMappings.nth(1).selectOption('l2')
  await mappings.nth(0).selectOption('l2')
  await page.getByRole('checkbox', { name: /reviewed every XML task/i }).check()
  const confirm = page.getByRole('button', { name: 'Confirm reviewed import' })
  await expect(confirm).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('UID 2 must map below its parent UID 1')
  await mappings.nth(0).selectOption('l1')
  await mappings.nth(1).selectOption('l3')
  await page.getByRole('checkbox', { name: /reviewed every XML task/i }).check()
  await expect(confirm).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('UID 3 must stay at the same ERP level as predecessor UID 2')
  await mappings.nth(1).selectOption('l2')
  await page.getByRole('checkbox', { name: /reviewed every XML task/i }).check()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  const importing = page.getByRole('button', { name: 'Importing XML…' })
  await expect(importing).toBeDisabled()
  const firstSnapshot = await snapshot(page)
  expect(firstSnapshot.importRequests).toHaveLength(1)
  const firstRequest = firstSnapshot.importRequests[0]
  expect(firstRequest?.expectedScope).toEqual({ tenantId: TENANT_ID, actorId: ACTOR_ID })
  expect(firstRequest?.command).toMatchObject({
    projectId: PROJECT_ID,
    sourceBase64: SOURCE_BASE64,
    sourceHash: SOURCE_HASH,
    parserVersion: 'ms-project-xml-v1',
    mappings: [
      { sourceUid: 1, sourceOutlineLevel: 1, level: 'l1', ownerId: null },
      { sourceUid: 2, sourceOutlineLevel: 2, level: 'l2', ownerId: null },
      { sourceUid: 3, sourceOutlineLevel: 2, level: 'l2', ownerId: null },
    ],
  })
  expect(firstRequest?.command).toHaveProperty('requestId', expect.stringMatching(/^[0-9a-f-]{36}$/i))

  await resolveImport(page, { ok: false, error: 'private upstream details', outcomeUnknown: true })
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('alert')).not.toContainText('private upstream details')
  await expect(page.getByRole('combobox', { name: /ERP level for XML task/ }).nth(0)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry import' })).toBeEnabled()

  await mount(page, { ...defaultProps, canManage: false })
  await expect(page.getByRole('heading', { name: 'Import MS Project XML' })).toHaveCount(0)
  await mount(page, defaultProps)
  await page.getByRole('button', { name: 'Retry import' }).click()
  await page.waitForFunction(() => (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest.importPending.length === 1)
  const retrySnapshot = await snapshot(page)
  expect(retrySnapshot.importRequests).toHaveLength(2)
  expect(retrySnapshot.importRequests[1]).toEqual(firstRequest)

  await page.evaluate(() => {
    const bridge = (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest
    bridge.throwOnRefresh = true
  })
  await resolveImport(page, {
    ok: true,
    data: importData(firstRequest as { command: Record<string, unknown> }),
    refreshWarning: 'Reload if the register does not update.',
  })
  await expect(page.getByRole('status')).toContainText('Import committed')
  await expect(page.getByRole('status')).toContainText('Reload if the register does not update')
  await expect(page.getByRole('status')).toContainText('could not refresh')
  await expect(page.getByRole('button', { name: 'Import committed' })).toBeDisabled()
})

test('fences a late import result after replacing the project and actor scope', async ({ page }) => {
  await page.goto(harnessUrl)
  await previewXml(page)
  await resolvePreview(page, { ok: true, data: preview })
  const depthMappings = page.getByRole('combobox', { name: /Apply target ERP level to outline depth/ })
  await depthMappings.nth(0).selectOption('l1')
  await depthMappings.nth(1).selectOption('l2')
  await page.getByRole('checkbox', { name: /reviewed every XML task/i }).check()
  await page.getByRole('button', { name: 'Confirm reviewed import' }).click()
  await page.waitForFunction(() => (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest.importPending.length === 1)
  const firstRequest = (await snapshot(page)).importRequests[0]
  expect(firstRequest).toBeDefined()

  await mount(page, { projectId: OTHER_PROJECT_ID, tenantId: OTHER_TENANT_ID, actorId: OTHER_ACTOR_ID, canManage: true })
  await resolveImport(page, { ok: true, data: importData(firstRequest as { command: Record<string, unknown> }) })
  await expect(page.getByRole('heading', { name: 'Reviewed mobilisation plan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Import committed' })).toHaveCount(0)
  expect((await snapshot(page)).refreshes).toBe(0)
})

test('does not claim a foreign preview result and allows a fresh preview retry', async ({ page }) => {
  await page.goto(harnessUrl)
  await previewXml(page)
  await resolvePreview(page, { ok: true, data: { ...preview, projectId: OTHER_PROJECT_ID, tenantId: OTHER_TENANT_ID, actorId: OTHER_ACTOR_ID } })
  await expect(page.getByRole('alert')).toContainText('did not match this file and account')
  await expect(page.getByRole('button', { name: 'Retry preview' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Reviewed mobilisation plan' })).toHaveCount(0)
  expect((await snapshot(page)).previewRequests).toHaveLength(1)
  await page.getByRole('button', { name: 'Preview XML' }).click()
  await page.waitForFunction(() => (window as unknown as { __msProjectXmlTest: BrowserBridge }).__msProjectXmlTest.previewPending.length === 1)
  const requests = (await snapshot(page)).previewRequests
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
})

test('fences a late preview after replacing the project and actor scope', async ({ page }) => {
  await page.goto(harnessUrl)
  await previewXml(page)
  await mount(page, { projectId: OTHER_PROJECT_ID, tenantId: OTHER_TENANT_ID, actorId: OTHER_ACTOR_ID, canManage: true })
  await resolvePreview(page, { ok: true, data: preview })
  await expect(page.getByRole('heading', { name: 'Reviewed mobilisation plan' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect((await snapshot(page)).refreshes).toBe(0)
})

for (const width of [320, 768, 1024, 1440]) {
test(`paginates the bounded review and remains keyboard reachable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(harnessUrl)
  await previewXml(page)
  const tasks = Array.from({ length: 51 }, (_, index) => task(index + 1, `Review task ${index + 1}`))
  await resolvePreview(page, { ok: true, data: { ...preview, preview: { ...preview.preview, tasks, sourceBytes: XML_BYTES.byteLength } } })
  await expect(page.getByText(new RegExp(`source hash ${SOURCE_HASH}`))).toBeVisible()
  await expect(page.getByText('Showing 1–50 of 51 tasks')).toBeVisible()
  await page.getByRole('button', { name: 'Next review page' }).click()
  await expect(page.getByText('Showing 51–51 of 51 tasks')).toBeVisible()
  await page.getByRole('combobox', { name: 'ERP level for XML task Review task 51' }).selectOption('l1')
  await page.getByRole('button', { name: 'Previous review page' }).click()
  await expect(page.getByText('1 of 51 tasks mapped')).toBeVisible()
  const file = page.getByLabel('MS Project XML file')
  await file.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Preview XML' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: join(tmpdir(), `erp-ms-project-xml-import-${width}.png`), fullPage: true })
})
}
