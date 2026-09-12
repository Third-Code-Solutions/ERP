import { test, expect } from '@playwright/test'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_CLAIM_ID = '55555555-5555-4555-8555-555555555555'
const DOCUMENT_ONE_ID = '66666666-6666-4666-8666-666666666666'
const DOCUMENT_TWO_ID = '77777777-7777-4777-8777-777777777777'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const REQUESTED_ATTACHMENT_ID = '88888888-8888-4888-8888-888888888888'

type DocumentRow = {
  id: string
  projectId: string
  fileName: string
  documentType: 'image' | 'pdf'
  mimeType: string
  sizeBytes: number
  description: string | null
  createdAt: string
}

type DocumentPage = {
  projectId: string
  rows: DocumentRow[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type ListResponse =
  | { ok: true; data: DocumentPage }
  | { ok: false; error: string }

type AttachResponse =
  | { ok: true; data: { attachmentId: string; tenantId: string; projectId: string; claimId: string; documentId: string; changed: boolean } }
  | { ok: false; error: string; outcome: 'unknown' | 'rejected' }

type BrowserBridge = {
  listRequests: Array<{ claimId: string; query: unknown }>
  listPending: Array<{ resolve: (response: ListResponse) => void }>
  attachRequests: Array<{ claimId: string; command: unknown }>
  attachPending: Array<{ resolve: (response: AttachResponse) => void }>
  refreshes: number
  resolveList: (response: ListResponse) => void
  resolveAttach: (response: AttachResponse) => void
  mount: (claimId: string) => void
}

type BrowserBridgeSnapshot = {
  listRequests: BrowserBridge['listRequests']
  attachRequests: BrowserBridge['attachRequests']
  refreshes: number
}

let harnessDirectory = ''
let harnessDirectoryIsSafe = false
let vite: import('vite').ViteDevServer | undefined
let harnessUrl: string

test.describe.configure({ mode: 'serial' })

function pageResult(rows: DocumentRow[], page: number, total: number, totalPages: number): DocumentPage {
  return {
    projectId: PROJECT_ID,
    rows,
    total,
    page,
    limit: 25,
    totalPages,
  }
}

function documentRow(id: string, fileName: string, documentType: 'image' | 'pdf'): DocumentRow {
  return {
    id,
    projectId: PROJECT_ID,
    fileName,
    documentType,
    mimeType: documentType === 'image' ? 'image/jpeg' : 'application/pdf',
    sizeBytes: 42,
    description: null,
    createdAt: '2026-09-12T00:00:00.000Z',
  }
}

async function resolveList(page: import('@playwright/test').Page, response: ListResponse): Promise<void> {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    bridge.resolveList(value)
  }, response)
}

async function resolveAttach(page: import('@playwright/test').Page, response: AttachResponse): Promise<void> {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    bridge.resolveAttach(value)
  }, response)
}

async function bridgeSnapshot(
  page: import('@playwright/test').Page,
): Promise<BrowserBridgeSnapshot> {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return {
      listRequests: bridge.listRequests,
      attachRequests: bridge.attachRequests,
      refreshes: bridge.refreshes,
    }
  })
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { basename, join, resolve, sep } = await import('node:path')
  const temporaryRoot = resolve(tmpdir())
  const harnessPrefix = 'erp-claim-document-'
  harnessDirectory = await mkdtemp(join(temporaryRoot, harnessPrefix))
  const resolvedHarnessDirectory = resolve(harnessDirectory)
  if (
    !resolvedHarnessDirectory.startsWith(`${temporaryRoot}${sep}`) ||
    !basename(resolvedHarnessDirectory).startsWith(harnessPrefix)
  ) {
    throw new Error('Refusing to use an unexpected browser harness directory')
  }
  harnessDirectory = resolvedHarnessDirectory
  harnessDirectoryIsSafe = true

  const componentPath = join(
    process.cwd(),
    'src',
    'components',
    'claims',
    'claim-document-attach.tsx',
  )
  const globalsPath = join(process.cwd(), 'src', 'app', 'globals.css')
  const actionsPath = join(harnessDirectory, 'actions.ts')
  const navigationPath = join(harnessDirectory, 'navigation.ts')
  await writeFile(
    join(harnessDirectory, 'index.html'),
    '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>',
  )
  await writeFile(
    actionsPath,
    `type ListResponse = { ok: true; data: unknown } | { ok: false; error: string }
type AttachResponse = { ok: true; data: unknown } | { ok: false; error: string; outcome: 'unknown' | 'rejected' }
type Pending<T> = { resolve: (response: T) => void }
type Bridge = {
  listRequests: Array<{ claimId: string; query: unknown }>
  listPending: Array<Pending<ListResponse>>
  attachRequests: Array<{ claimId: string; command: unknown }>
  attachPending: Array<Pending<AttachResponse>>
  refreshes: number
  resolveList: (response: ListResponse) => void
  resolveAttach: (response: AttachResponse) => void
  mount: (claimId: string) => void
}
const globalState = globalThis as unknown as { __claimDocumentTest?: Bridge }
const bridge = globalState.__claimDocumentTest ?? {
  listRequests: [], listPending: [], attachRequests: [], attachPending: [], refreshes: 0,
  resolveList(response: ListResponse) { bridge.listPending.shift()?.resolve(response) },
  resolveAttach(response: AttachResponse) { bridge.attachPending.shift()?.resolve(response) },
  mount: (_claimId: string) => {},
}
globalState.__claimDocumentTest = bridge
export function listClaimDocuments(claimId: string, query: unknown): Promise<ListResponse> {
  bridge.listRequests.push({ claimId, query })
  return new Promise((resolve) => bridge.listPending.push({ resolve }))
}
export function attachClaimDocument(claimId: string, command: unknown): Promise<AttachResponse> {
  bridge.attachRequests.push({ claimId, command })
  return new Promise((resolve) => bridge.attachPending.push({ resolve }))
}
`,
  )
  await writeFile(
    navigationPath,
    `export function useRouter() {
  return { refresh() {
    const state = globalThis as unknown as { __claimDocumentTest: { refreshes: number } }
    state.__claimDocumentTest.refreshes += 1
  } }
}
`,
  )
  await writeFile(
    join(harnessDirectory, 'harness.tsx'),
    `import ${JSON.stringify(globalsPath)}
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClaimDocumentAttach } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
const state = (globalThis as unknown as { __claimDocumentTest: { mount: (claimId: string) => void } }).__claimDocumentTest
state.mount = (claimId: string) => root.render(<ClaimDocumentAttach claimId={claimId} />)
state.mount(${JSON.stringify(CLAIM_ID)})
`,
  )

  const server = await createServer({
    root: harnessDirectory,
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: { allow: [process.cwd(), harnessDirectory] },
    },
    resolve: {
      alias: [
        { find: 'react', replacement: join(process.cwd(), 'node_modules', 'react') },
        { find: 'react-dom', replacement: join(process.cwd(), 'node_modules', 'react-dom') },
        {
          find: '@/app/(dashboard)/claims/[id]/actions',
          replacement: actionsPath,
        },
        { find: 'next/navigation', replacement: navigationPath },
      ],
    },
  })
  vite = server
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Vite harness did not expose a port')
  harnessUrl = `http://127.0.0.1:${(address as { port: number }).port}`
})

test.afterAll(async () => {
  await vite?.close()
  if (harnessDirectory && harnessDirectoryIsSafe) {
    const { rm } = await import('node:fs/promises')
    await rm(harnessDirectory, { recursive: true, force: true })
  }
})

test.beforeEach(async ({ page }) => {
  await page.goto(harnessUrl)
})

test('loads pages from Core, pages honestly, and retains selection across pages', async ({ page }) => {
  const selector = page.locator('#claim-document-id')
  await expect(selector).toBeDisabled()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: pageResult([documentRow(DOCUMENT_ONE_ID, 'page-one-photo.jpg', 'image')], 1, 26, 2),
  })
  await expect(selector).toBeEnabled()
  await expect(selector.locator('option').filter({ hasText: 'page-one-photo.jpg' })).toHaveCount(1)
  await expect(page.getByText('Page 1 of 2')).toBeVisible()

  await selector.selectOption(DOCUMENT_ONE_ID)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(selector).toBeDisabled()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: pageResult([documentRow(DOCUMENT_TWO_ID, 'page-two-plan.pdf', 'pdf')], 2, 26, 2),
  })

  await expect(selector).toBeEnabled()
  await expect(selector).toHaveValue(DOCUMENT_ONE_ID)
  await expect(selector.locator('option').filter({ hasText: 'page-one-photo.jpg' })).toHaveCount(1)
  await expect(selector.locator('option').filter({ hasText: 'page-two-plan.pdf' })).toHaveCount(1)
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  expect(await bridgeSnapshot(page)).toMatchObject({
    listRequests: [
      { claimId: CLAIM_ID, query: { page: 1, limit: 25 } },
      { claimId: CLAIM_ID, query: { page: 2, limit: 25 } },
    ],
  })
})

test('shows load errors, retries, and keeps an empty project explicit', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, { ok: false, error: 'Project documents are unavailable.' })
  await expect(page.getByText('Project documents are unavailable.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry loading documents' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: pageResult([], 1, 0, 1),
  })
  await expect(page.getByText('No project documents are available.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Attach document' })).toBeDisabled()
})

test('ignores a stale list response after the claim scope changes', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await page.evaluate((claimId) => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    bridge.mount(claimId)
  }, OTHER_CLAIM_ID)
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 2
  })
  await resolveList(page, {
    ok: true,
    data: pageResult([documentRow(DOCUMENT_ONE_ID, 'stale-old.pdf', 'pdf')], 1, 1, 1),
  })
  await expect(page.locator('#claim-document-id')).toContainText('Loading project documents…')
  await resolveList(page, {
    ok: true,
    data: pageResult([documentRow(DOCUMENT_TWO_ID, 'current-claim.pdf', 'pdf')], 1, 1, 1),
  })
  await expect(page.locator('#claim-document-id')).toContainText('current-claim.pdf')
  await expect(page.locator('#claim-document-id')).not.toContainText('stale-old.pdf')
})

test('keeps an uncertain request frozen through a rejected retry, then resets on success', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: pageResult([documentRow(DOCUMENT_ONE_ID, 'site-photo.jpg', 'image')], 1, 1, 1),
  })
  await page.locator('#claim-document-id').selectOption(DOCUMENT_ONE_ID)
  await page.locator('#claim-document-kind').selectOption('certificate')
  await page.locator('#claim-document-caption').fill('Field photo')
  await page.getByRole('button', { name: 'Attach document' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.attachPending.length === 1
  })
  const firstRequest = (await bridgeSnapshot(page)).attachRequests[0]
  if (!firstRequest) throw new Error('Expected the first attachment request to be recorded')
  await resolveAttach(page, {
    ok: false,
    error: 'Attachment outcome is unconfirmed; retry with the same request.',
    outcome: 'unknown',
  })
  await expect(page.getByRole('alert')).toContainText('unconfirmed')
  await expect(page.locator('#claim-document-id')).toBeDisabled()
  await expect(page.locator('#claim-document-kind')).toBeDisabled()
  await expect(page.locator('#claim-document-caption')).toHaveValue('Field photo')
  await expect(page.getByRole('button', { name: 'Retry same attachment' })).toBeEnabled()

  await page.getByRole('button', { name: 'Retry same attachment' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.attachPending.length === 1
  })
  await resolveAttach(page, {
    ok: false,
    error: 'Forbidden',
    outcome: 'rejected',
  })
  await expect(page.getByRole('alert')).toContainText('original attachment outcome is still unconfirmed')
  await expect(page.locator('#claim-document-id')).toBeDisabled()
  await expect(page.locator('#claim-document-kind')).toBeDisabled()
  await expect(page.locator('#claim-document-caption')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry same attachment' })).toBeEnabled()

  await page.getByRole('button', { name: 'Retry same attachment' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.attachPending.length === 1
  })
  const requests = (await bridgeSnapshot(page)).attachRequests
  expect(requests).toHaveLength(3)
  expect(requests[1]).toEqual(firstRequest)
  expect(requests[2]).toEqual(firstRequest)

  await resolveAttach(page, {
    ok: true,
    data: {
      attachmentId: REQUESTED_ATTACHMENT_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      claimId: CLAIM_ID,
      documentId: DOCUMENT_ONE_ID,
      changed: true,
    },
  })
  await expect(page.getByRole('status')).toContainText('Document attached.')
  await expect(page.locator('#claim-document-id')).toHaveValue('')
  await expect(page.locator('#claim-document-kind')).toHaveValue('photo')
  await expect(page.locator('#claim-document-caption')).toHaveValue('')
  expect(await bridgeSnapshot(page)).toMatchObject({ refreshes: 1 })
})

test('allows a new intent after a confirmed rejection with a new request identity', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: pageResult([documentRow(DOCUMENT_ONE_ID, 'site-photo.jpg', 'image')], 1, 1, 1),
  })
  await page.locator('#claim-document-id').selectOption(DOCUMENT_ONE_ID)
  await page.getByRole('button', { name: 'Attach document' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.attachPending.length === 1
  })
  const firstRequest = (await bridgeSnapshot(page)).attachRequests[0]
  if (!firstRequest) throw new Error('Expected the first attachment request to be recorded')
  await resolveAttach(page, {
    ok: false,
    error: 'Claim is no longer attachable.',
    outcome: 'rejected',
  })
  await expect(page.getByRole('alert')).toContainText('no longer attachable')
  await expect(page.locator('#claim-document-id')).toBeEnabled()
  await page.locator('#claim-document-caption').fill('New deliberate intent')
  await page.getByRole('button', { name: 'Attach document' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
    return bridge.attachPending.length === 1
  })
  const requests = (await bridgeSnapshot(page)).attachRequests
  expect(requests).toHaveLength(2)
  const secondRequest = requests[1]
  if (!secondRequest) throw new Error('Expected the second attachment request to be recorded')
  expect((secondRequest.command as { clientRequestId: string }).clientRequestId).not.toBe(
    (firstRequest.command as { clientRequestId: string }).clientRequestId,
  )
})

test('fits the supported widths and keeps every control keyboard reachable', async ({ page }) => {
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(harnessUrl)
    await page.waitForFunction(() => {
      const bridge = (window as unknown as { __claimDocumentTest: BrowserBridge }).__claimDocumentTest
      return bridge.listPending.length === 1
    })
    await resolveList(page, {
      ok: true,
      data: pageResult([documentRow(DOCUMENT_ONE_ID, 'responsive-photo.jpg', 'image')], 1, 1, 1),
    })

    const selector = page.locator('#claim-document-id')
    await expect(selector).toBeEnabled()
    await selector.selectOption(DOCUMENT_ONE_ID)
    const layout = await page.evaluate(() => {
      const grid = document.querySelector('.form-row-2col')
      return {
        innerWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : '',
      }
    })
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.innerWidth)
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.innerWidth)
    expect(layout.gridColumns.split(/\s+/).filter(Boolean)).toHaveLength(width <= 420 ? 1 : 2)

    await selector.focus()
    await expect(selector).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#claim-document-kind')).toBeFocused()
    await expect(page.locator('#claim-document-kind')).toHaveCSS('box-shadow', /.+/)
    await page.keyboard.press('Tab')
    await expect(page.locator('#claim-document-caption')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Attach document' })).toBeFocused()

    await page.screenshot({
      path: join(tmpdir(), `erp-claim-document-${width}.png`),
      fullPage: true,
    })
  }
})
