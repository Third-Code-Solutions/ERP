import { expect, test } from '@playwright/test'

const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ONE_ID = '66666666-6666-4666-8666-666666666666'
const DOCUMENT_TWO_ID = '77777777-7777-4777-8777-777777777777'
const DOCUMENT_THREE_ID = '99999999-9999-4999-8999-999999999999'
const REQUEST_ID = '88888888-8888-4888-8888-888888888888'

type DocumentRow = {
  documentId: string
  tenantId: string
  accountId: string
  fileName: string
  documentType: string
  mimeType: string
  createdAt: string
  projectId: string | null
  projectName: string | null
  opportunityId: string | null
  opportunityStage: string | null
  opportunityType: string | null
}

type DocumentResult = {
  accountId: string
  tenantId: string
  rows: DocumentRow[]
  selectedDocument: DocumentRow | null
  page: number
  limit: number
  total: number
  totalPages: number
}

type ListResponse =
  | { ok: true; data: DocumentResult }
  | { ok: false; error: string }

type CreateResponse =
  | {
      ok: true
      data: {
        artifactId: string
        accountId: string
        tenantId: string
        documentId: string | null
        changed: boolean
      }
    }
  | { ok: false; error: string; outcome: 'unknown' | 'rejected' }

type BrowserBridge = {
  listRequests: Array<{ accountId: string; query: unknown }>
  listPending: Array<{ resolve: (response: ListResponse) => void }>
  createRequests: Array<{ accountId: string; command: unknown }>
  createPending: Array<{ resolve: (response: CreateResponse) => void }>
  refreshes: number
  resolveList: (response: ListResponse) => void
  resolveCreate: (response: CreateResponse) => void
  mount: (accountId: string) => void
}

type BrowserBridgeSnapshot = {
  listRequests: BrowserBridge['listRequests']
  createRequests: BrowserBridge['createRequests']
  refreshes: number
}

let harnessDirectory = ''
let harnessDirectoryIsSafe = false
let vite: import('vite').ViteDevServer | undefined
let harnessUrl = ''

test.describe.configure({ mode: 'serial' })

function documentRow(
  id: string,
  accountId: string,
  fileName: string,
  overrides: Partial<DocumentRow> = {},
): DocumentRow {
  return {
    documentId: id,
    tenantId: TENANT_ID,
    accountId,
    fileName,
    documentType: 'pdf',
    mimeType: 'application/pdf',
    createdAt: '2026-09-12T00:00:00.000Z',
    projectId: null,
    projectName: null,
    opportunityId: null,
    opportunityStage: null,
    opportunityType: null,
    ...overrides,
  }
}

function documentResult(
  accountId: string,
  rows: DocumentRow[],
  page: number,
  total: number,
  totalPages: number,
  selectedDocument: DocumentRow | null = null,
): DocumentResult {
  return {
    accountId,
    tenantId: TENANT_ID,
    rows,
    selectedDocument,
    page,
    limit: 20,
    total,
    totalPages,
  }
}

async function resolveList(
  page: import('@playwright/test').Page,
  response: ListResponse,
): Promise<void> {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    bridge.resolveList(value)
  }, response)
}

async function resolveCreate(
  page: import('@playwright/test').Page,
  response: CreateResponse,
): Promise<void> {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    bridge.resolveCreate(value)
  }, response)
}

async function bridgeSnapshot(
  page: import('@playwright/test').Page,
): Promise<BrowserBridgeSnapshot> {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return {
      listRequests: bridge.listRequests,
      createRequests: bridge.createRequests,
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
  const harnessPrefix = 'erp-kyc-artifact-'
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
    'accounts',
    'add-kyc-artifact-form.tsx',
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
type CreateResponse = { ok: true; data: unknown } | { ok: false; error: string; outcome: 'unknown' | 'rejected' }
type Pending<T> = { resolve: (response: T) => void }
type Bridge = {
  listRequests: Array<{ accountId: string; query: unknown }>
  listPending: Array<Pending<ListResponse>>
  createRequests: Array<{ accountId: string; command: unknown }>
  createPending: Array<Pending<CreateResponse>>
  refreshes: number
  resolveList: (response: ListResponse) => void
  resolveCreate: (response: CreateResponse) => void
  mount: (accountId: string) => void
}
const globalState = globalThis as unknown as { __kycArtifactTest?: Bridge }
const bridge: Bridge = globalState.__kycArtifactTest ?? {
  listRequests: [], listPending: [], createRequests: [], createPending: [], refreshes: 0,
  resolveList(response: ListResponse) { bridge.listPending.shift()?.resolve(response) },
  resolveCreate(response: CreateResponse) { bridge.createPending.shift()?.resolve(response) },
  mount: (_accountId: string) => {},
}
globalState.__kycArtifactTest = bridge
export function listAccountKycDocuments(accountId: string, query: unknown): Promise<ListResponse> {
  bridge.listRequests.push({ accountId, query })
  return new Promise((resolve) => bridge.listPending.push({ resolve }))
}
export function addKycArtifact(accountId: string, command: unknown): Promise<CreateResponse> {
  bridge.createRequests.push({ accountId, command })
  return new Promise((resolve) => bridge.createPending.push({ resolve }))
}
`,
  )
  await writeFile(
    navigationPath,
    `export function useRouter() {
  return { refresh() {
    const state = globalThis as unknown as { __kycArtifactTest: { refreshes: number } }
    state.__kycArtifactTest.refreshes += 1
  } }
}
`,
  )
  await writeFile(
    join(harnessDirectory, 'harness.tsx'),
    `import ${JSON.stringify(globalsPath)}
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AddKycArtifactForm } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
const state = (globalThis as unknown as { __kycArtifactTest: { mount: (accountId: string) => void } }).__kycArtifactTest
state.mount = (accountId: string) => root.render(<AddKycArtifactForm accountId={accountId} />)
state.mount(${JSON.stringify(ACCOUNT_ID)})
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
          find: '@/app/(dashboard)/crm/accounts/actions',
          replacement: actionsPath,
        },
        { find: 'next/navigation', replacement: navigationPath },
      ],
    },
  })
  vite = server
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Vite harness did not expose a port')
  }
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

test('loads account documents, searches, paginates, and retains the selected row', async ({
  page,
}) => {
  const selector = page.locator('#kyc-artifact-document')
  await expect(selector).toBeDisabled()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  const firstDocument = documentRow(
    DOCUMENT_ONE_ID,
    ACCOUNT_ID,
    'annual-report.pdf',
    { projectName: 'Harbor Tower' },
  )
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [firstDocument], 1, 41, 3),
  })
  await expect(selector).toBeEnabled()
  await expect(selector.locator('option').filter({ hasText: 'annual-report.pdf' })).toHaveCount(1)
  await expect(page.getByText('Page 1 of 3')).toBeVisible()
  await selector.selectOption(DOCUMENT_ONE_ID)
  await expect(page.getByText(/Selected: annual-report\.pdf/)).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(selector).toBeDisabled()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  const secondDocument = documentRow(
    DOCUMENT_TWO_ID,
    ACCOUNT_ID,
    'tax-certificate.pdf',
    { opportunityType: 'public_tender', opportunityStage: 'negotiation' },
  )
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [secondDocument], 2, 41, 3, firstDocument),
  })
  await expect(selector).toBeEnabled()
  await expect(selector).toHaveValue(DOCUMENT_ONE_ID)
  await expect(selector.locator('option').filter({ hasText: 'annual-report.pdf' })).toHaveCount(1)
  await expect(selector.locator('option').filter({ hasText: 'tax-certificate.pdf' })).toHaveCount(1)
  await expect(page.getByText('Page 2 of 3')).toBeVisible()

  await page.locator('#kyc-artifact-search').fill('tax')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [secondDocument], 1, 1, 1, firstDocument),
  })
  await expect(selector).toHaveValue(DOCUMENT_ONE_ID)
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  expect(await bridgeSnapshot(page)).toMatchObject({
    listRequests: [
      { accountId: ACCOUNT_ID, query: { q: '', page: 1, limit: 20 } },
      {
        accountId: ACCOUNT_ID,
        query: { q: '', page: 2, limit: 20, selectedDocumentId: DOCUMENT_ONE_ID },
      },
      {
        accountId: ACCOUNT_ID,
        query: { q: 'tax', page: 1, limit: 20, selectedDocumentId: DOCUMENT_ONE_ID },
      },
    ],
  })
})

test('shows loading, error/retry and an honest metadata-only empty state', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, { ok: false, error: 'Account documents are unavailable.' })
  await expect(page.getByText('Account documents are unavailable.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry loading documents' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [], 1, 0, 1),
  })
  await expect(
    page.getByText(/No account-eligible documents match this search/),
  ).toBeVisible()
  await expect(page.locator('#kyc-artifact-document')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Add artifact' })).toBeEnabled()
})

test('ignores a stale document response after the account scope changes', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(
      ACCOUNT_ID,
      [documentRow(DOCUMENT_ONE_ID, ACCOUNT_ID, 'old-account.pdf')],
      1,
      1,
      1,
    ),
  })
  await page.locator('#kyc-artifact-document').selectOption(DOCUMENT_ONE_ID)
  await page.evaluate((accountId) => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    bridge.mount(accountId)
  }, OTHER_ACCOUNT_ID)
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 2
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(
      ACCOUNT_ID,
      [documentRow(DOCUMENT_ONE_ID, ACCOUNT_ID, 'stale-old.pdf')],
      1,
      1,
      1,
    ),
  })
  await expect(page.getByText('Loading account documents…')).toBeVisible()
  await resolveList(page, {
    ok: true,
    data: documentResult(
      OTHER_ACCOUNT_ID,
      [documentRow(DOCUMENT_TWO_ID, OTHER_ACCOUNT_ID, 'current-account.pdf')],
      1,
      1,
      1,
    ),
  })
  await expect(page.locator('#kyc-artifact-document')).toContainText(
    'current-account.pdf',
  )
  await expect(page.locator('#kyc-artifact-document')).not.toContainText(
    'stale-old.pdf',
  )
})

test('keeps an unavailable selection explicit until the user chooses metadata-only', async ({
  page,
}) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  const selected = documentRow(DOCUMENT_ONE_ID, ACCOUNT_ID, 'selected-report.pdf')
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [selected], 1, 21, 2),
  })
  await page.locator('#kyc-artifact-document').selectOption(DOCUMENT_ONE_ID)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [], 2, 21, 2, null),
  })
  await expect(
    page.getByText(/selected document is no longer available/),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add artifact' })).toBeDisabled()
  await expect(
    page.locator('option', { hasText: 'Previously selected document — choose again' }),
  ).toHaveCount(1)

  await page.locator('#kyc-artifact-document').selectOption('')
  await expect(page.getByRole('button', { name: 'Add artifact' })).toBeEnabled()
})

test('ignores an old mutation result after the account scope changes', async ({ page }) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [], 1, 0, 1),
  })
  await page.locator('#kyc-artifact-notes').fill('Old account draft')
  await page.getByRole('button', { name: 'Add artifact' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.createPending.length === 1
  })

  await page.evaluate((accountId) => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    bridge.mount(accountId)
  }, OTHER_ACCOUNT_ID)
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 2
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(OTHER_ACCOUNT_ID, [], 1, 0, 1),
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(OTHER_ACCOUNT_ID, [], 1, 0, 1),
  })
  await resolveCreate(page, {
    ok: true,
    data: {
      artifactId: REQUEST_ID,
      accountId: ACCOUNT_ID,
      tenantId: TENANT_ID,
      documentId: null,
      changed: true,
    },
  })

  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('#kyc-artifact-notes')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Add artifact' })).toBeEnabled()
})

test('freezes an uncertain metadata-only command through rejection and retries it exactly', async ({
  page,
}) => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.listPending.length === 1
  })
  await resolveList(page, {
    ok: true,
    data: documentResult(ACCOUNT_ID, [], 1, 0, 1),
  })
  await page.locator('#kyc-artifact-type').selectOption('bir_2303')
  await page.locator('#kyc-artifact-notes').fill('Metadata-only evidence')
  await page.getByRole('button', { name: 'Add artifact' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.createPending.length === 1
  })
  const firstRequest = (await bridgeSnapshot(page)).createRequests[0]
  if (!firstRequest) throw new Error('Expected the first KYC artifact request')
  await resolveCreate(page, {
    ok: false,
    error: 'KYC artifact outcome is unconfirmed; retry with the same request.',
    outcome: 'unknown',
  })
  await expect(page.getByRole('alert')).toContainText('unconfirmed')
  await expect(page.locator('#kyc-artifact-type')).toBeDisabled()
  await expect(page.locator('#kyc-artifact-document')).toBeDisabled()
  await expect(page.locator('#kyc-artifact-notes')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Retry same artifact' })).toBeEnabled()

  await page.getByRole('button', { name: 'Retry same artifact' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.createPending.length === 1
  })
  await resolveCreate(page, {
    ok: false,
    error: 'Forbidden',
    outcome: 'rejected',
  })
  await expect(page.getByRole('alert')).toContainText('original KYC artifact outcome is still unconfirmed')
  await expect(page.locator('#kyc-artifact-type')).toBeDisabled()
  await expect(page.locator('#kyc-artifact-notes')).toBeDisabled()

  await page.getByRole('button', { name: 'Retry same artifact' }).click()
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
      .__kycArtifactTest
    return bridge.createPending.length === 1
  })
  const requests = (await bridgeSnapshot(page)).createRequests
  expect(requests).toHaveLength(3)
  expect(requests[1]).toEqual(firstRequest)
  expect(requests[2]).toEqual(firstRequest)
  await resolveCreate(page, {
    ok: true,
    data: {
      artifactId: REQUEST_ID,
      accountId: ACCOUNT_ID,
      tenantId: TENANT_ID,
      documentId: null,
      changed: true,
    },
  })
  await expect(page.getByRole('status')).toContainText('KYC artifact added.')
  await expect(page.locator('#kyc-artifact-type')).toHaveValue('afs_year_1')
  await expect(page.locator('#kyc-artifact-notes')).toHaveValue('')
  expect(await bridgeSnapshot(page)).toMatchObject({ refreshes: 1 })
})

test('keeps pagination focus at boundaries, avoids stealing moved focus, and fits supported widths', async ({
  page,
}) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(harnessUrl)
    await page.waitForFunction(() => {
      const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
        .__kycArtifactTest
      return bridge.listPending.length === 1
    })
    await resolveList(page, {
      ok: true,
      data: documentResult(
        ACCOUNT_ID,
        [documentRow(DOCUMENT_ONE_ID, ACCOUNT_ID, 'page-one.pdf')],
        1,
        41,
        3,
      ),
    })
    const layout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      gridColumns: getComputedStyle(document.querySelector('.form-row-2col')!).gridTemplateColumns,
    }))
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.innerWidth)
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.innerWidth)
    expect(layout.gridColumns.split(/\s+/).filter(Boolean)).toHaveLength(width <= 420 ? 1 : 2)

    const nextButton = page.getByRole('button', { name: 'Next' })
    const previousButton = page.getByRole('button', { name: 'Previous' })
    await nextButton.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => {
      const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
        .__kycArtifactTest
      return bridge.listPending.length === 1
    })
    const caption = page.locator('#kyc-artifact-notes')
    await caption.focus()
    await resolveList(page, {
      ok: true,
      data: documentResult(
        ACCOUNT_ID,
        [documentRow(DOCUMENT_TWO_ID, ACCOUNT_ID, 'page-two.pdf')],
        2,
        41,
        3,
      ),
    })
    await expect(caption).toBeFocused()
    await expect(page.getByText('Page 2 of 3')).toBeVisible()

    await nextButton.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => {
      const bridge = (window as unknown as { __kycArtifactTest: BrowserBridge })
        .__kycArtifactTest
      return bridge.listPending.length === 1
    })
    await resolveList(page, {
      ok: true,
      data: documentResult(
        ACCOUNT_ID,
        [documentRow(DOCUMENT_THREE_ID, ACCOUNT_ID, 'page-three.pdf')],
        3,
        41,
        3,
      ),
    })
    await expect(previousButton).toBeFocused()
    await expect(nextButton).toBeDisabled()

    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    await page.screenshot({
      path: join(tmpdir(), `erp-kyc-artifact-${width}.png`),
      fullPage: true,
    })
  }
})
