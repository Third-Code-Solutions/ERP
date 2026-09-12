import { expect, test, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import type { ServerResponse } from 'node:http'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const TENANT = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY = '33333333-3333-4333-8333-333333333333'
const INSPECTION = '44444444-4444-4444-8444-444444444444'
const OTHER_ACTOR = '66666666-6666-4666-8666-666666666666'
type Request = { opportunityId: string; inspectionId: string; fields: Record<string, string>; owner: { actorId: string; tenantId: string } }
type Bridge = { online: (online: boolean) => void; mount: (actorId: string, tenantId: string, inspectionId?: string) => void; unmount: () => void }
type Scope = { actorId: string; tenantId: string; opportunityId: string; inspectionId: string }
type Envelope = { scope: Scope; scopeKey: string; submissionId: string; description: string; priority: 'minor'; createdAt: number; updatedAt: number }
type StoreBridge = {
  loadRfiSnapshot(scope: Scope): Promise<{ draft: unknown; pending: unknown; revision: number }>
  saveRfiDraft(scope: Scope, input: { description: string; priority: 'minor' }, revision: number): Promise<number>
  putRfiPending(envelope: Envelope, revision: number): Promise<number>
  deleteRfiPending(envelope: Envelope): Promise<number>
  createRfiPendingEnvelope(scope: Scope, input: { description: string; priority: 'minor' }, submissionId: string): Envelope
}
let directory = ''
let url = ''
let vite: import('vite').ViteDevServer | undefined
// This controlled action log lives in Node, so page reloads cannot erase it.
// It is not proof of real Core transactions or server idempotency.
const requests: Request[] = []
const pending: ServerResponse[] = []
const pageErrors: string[] = []

test.describe.configure({ mode: 'default' })

async function connectivity(page: Page, online: boolean) {
  await page.evaluate(value => (window as unknown as { __rfiOffline: Bridge }).__rfiOffline.online(value), online)
}

async function stored(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const records: unknown[] = []
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue
      const databaseName = info.name
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        for (const name of database.objectStoreNames) {
          records.push(...await new Promise<unknown[]>((resolve, reject) => {
            const transaction = database.transaction(name, 'readonly')
            const request = transaction.objectStore(name).getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          }))
        }
      } finally { database.close() }
    }
    return records
  })
}

async function durableDraft(page: Page, description: string) {
  await expect(page.getByRole('button', { name: 'Add RFI', exact: true })).toBeEnabled()
  await page.getByLabel('Description').fill(description)
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain(description)
}

async function waitRequests(count: number) {
  await expect.poll(() => requests.length).toBe(count)
}

function fail(index: number, outcome: 'unknown' | 'rejected' = 'unknown') {
  const response = pending[index]
  if (!response) throw new Error('Missing request to reject')
  response.end(JSON.stringify({ ok: false, error: 'Controlled outcome could not be confirmed', code: 'UNAVAILABLE', outcome }))
}

function confirm(index: number, overrides: Record<string, unknown> = {}) {
  const request = requests[index]
  const response = pending[index]
  if (!request || !response) throw new Error('Missing controlled action request')
  response.end(JSON.stringify({ ok: true, rfiId: '77777777-7777-4777-8777-777777777777', replayed: index > 0, refreshFailed: false,
    confirmation: { ...request.owner, opportunityId: request.opportunityId, inspectionId: request.inspectionId, submissionId: request.fields.submission_id }, ...overrides }))
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  directory = resolve(await mkdtemp(join(tmpdir(), 'erp-rfi-offline-')))
  if (!directory.startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('erp-rfi-offline-')) throw new Error('Unsafe harness path')
  const actions = join(directory, 'actions.ts')
  await writeFile(actions, `export async function addInspectionRfi(opportunityId, inspectionId, formData, owner) {
    window.__rfiActionCalls = (window.__rfiActionCalls || 0) + 1
    if (!navigator.onLine) throw new TypeError('Controlled connection unavailable')
    const response = await fetch('/__rfi_submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId, inspectionId, fields: Object.fromEntries(formData), owner }) })
    const result = await response.json()
    window.__rfiActionResolved = (window.__rfiActionResolved || 0) + 1
    return result
  }`)
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(join(directory, 'store.html'), '<!doctype html><html><body><script type="module" src="/store-harness.ts"></script></body></html>')
  await writeFile(join(directory, 'store-harness.ts'), `import * as store from ${JSON.stringify(join(process.cwd(), 'src/components/proposal/rfi-offline-store.ts'))}; window.__rfiStore = store`)
  await writeFile(join(directory, 'harness.tsx'), `import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(join(process.cwd(), 'src/app/globals.css'))}
import { RfiForm } from ${JSON.stringify(join(process.cwd(), 'src/components/proposal/rfi-form.tsx'))}
let online = !new URL(location.href).searchParams.has('offline')
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
const root = createRoot(document.getElementById('root'))
window.__rfiOffline = {
  online(value) { online = value; dispatchEvent(new Event(value ? 'online' : 'offline')) },
  unmount() { root.render(null) },
  mount(actorId, tenantId, inspectionId = ${JSON.stringify(INSPECTION)}) { root.render(<main style={{maxWidth:680,margin:'0 auto',padding:16}}><h1>Inspection RFIs</h1><RfiForm actorId={actorId} tenantId={tenantId} opportunityId=${JSON.stringify(OPPORTUNITY)} inspectionId={inspectionId} submissionId={crypto.randomUUID()} /></main>) }
}
window.__rfiOffline.mount(${JSON.stringify(ACTOR)}, ${JSON.stringify(TENANT)})
`)
  vite = await createServer({ root: directory, configFile: false, esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), directory] } },
    resolve: { alias: [
      { find: 'react', replacement: join(process.cwd(), 'node_modules/react') },
      { find: 'react-dom', replacement: join(process.cwd(), 'node_modules/react-dom') },
      { find: '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', replacement: actions },
      { find: '@', replacement: join(process.cwd(), 'src') },
    ] },
    plugins: [{ name: 'controlled-rfi-action', configureServer(server) {
      server.middlewares.use('/__rfi_submit', (request, response) => {
        let body = ''
        request.on('data', chunk => { body += String(chunk) })
        request.on('end', () => {
          requests.push(JSON.parse(body))
          pending.push(response)
          response.setHeader('content-type', 'application/json')
          response.flushHeaders()
        })
      })
    } }],
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Harness failed to bind')
  url = `http://127.0.0.1:${address.port}`
})

test.afterEach(() => {
  for (const response of pending) if (!response.writableEnded) response.end(JSON.stringify({ ok: false, error: 'Test ended', code: 'UNAVAILABLE', outcome: 'unknown' }))
  expect(pageErrors).toEqual([])
})
test.afterAll(async () => {
  await vite?.close()
  if (directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('erp-rfi-offline-')) {
    const { rm } = await import('node:fs/promises')
    await rm(directory, { recursive: true, force: true })
  }
})
test.beforeEach(async ({ page }, testInfo) => {
  requests.length = 0
  pending.length = 0
  pageErrors.length = 0
  page.on('pageerror', error => pageErrors.push(error.message))
  if (testInfo.title.startsWith('store:')) {
    await page.goto(url + '/store.html')
    await page.waitForFunction(() => Boolean((window as unknown as { __rfiStore?: StoreBridge }).__rfiStore))
    return
  }
  await page.goto(url)
  await expect(page.getByLabel('Description')).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Add RFI', exact: true })).toBeEnabled()
})

test('store: real IndexedDB revision prevents stale saves before and after acknowledgement', async ({ page }) => {
  const result = await page.evaluate(async scope => {
    const store = (window as unknown as { __rfiStore: StoreBridge }).__rfiStore
    const input = { description: 'Atomic revision evidence', priority: 'minor' as const }
    const initial = await store.loadRfiSnapshot(scope)
    const draftRevision = await store.saveRfiDraft(scope, input, initial.revision)
    const envelope = store.createRfiPendingEnvelope(scope, input, crypto.randomUUID())
    const queuedRevision = await store.putRfiPending(envelope, draftRevision)
    const queued = await store.loadRfiSnapshot(scope)
    const fails = async (operation: () => Promise<unknown>) => {
      try { await operation(); return false } catch { return true }
    }
    const staleQueued = await fails(() => store.saveRfiDraft(scope, { ...input, description: 'Stale while queued' }, draftRevision))
    const exactReplayRevision = await store.putRfiPending(envelope, draftRevision)
    const different = { ...envelope, description: 'Different immutable payload' }
    const differentPut = await fails(() => store.putRfiPending(different, queuedRevision))
    const differentDelete = await fails(() => store.deleteRfiPending(different))
    const acknowledgedRevision = await store.deleteRfiPending(envelope)
    const duplicateDeleteRevision = await store.deleteRfiPending(envelope)
    const staleAcknowledged = await fails(() => store.saveRfiDraft(scope, { ...input, description: 'Stale after acknowledgement' }, draftRevision))
    const empty = await store.loadRfiSnapshot(scope)
    const freshRevision = await store.saveRfiDraft(scope, { ...input, description: 'Fresh explicit draft' }, empty.revision)
    const fresh = await store.loadRfiSnapshot(scope)
    return { initial, draftRevision, queuedRevision, queued, staleQueued, exactReplayRevision, differentPut, differentDelete, acknowledgedRevision, duplicateDeleteRevision, staleAcknowledged, empty, freshRevision, fresh }
  }, { actorId: ACTOR, tenantId: TENANT, opportunityId: OPPORTUNITY, inspectionId: INSPECTION })
  expect(result.initial).toEqual({ draft: null, pending: null, revision: 0 })
  expect(result.queued.draft).toBeNull()
  expect(result.queued.pending).toMatchObject({ description: 'Atomic revision evidence' })
  expect(result.staleQueued && result.differentPut && result.differentDelete && result.staleAcknowledged).toBe(true)
  expect(result.exactReplayRevision).toBe(result.queuedRevision)
  expect(result.acknowledgedRevision).toBeGreaterThan(result.queuedRevision)
  expect(result.duplicateDeleteRevision).toBe(result.acknowledgedRevision)
  expect(result.empty).toEqual({ draft: null, pending: null, revision: result.acknowledgedRevision })
  expect(result.fresh.draft).toMatchObject({ description: 'Fresh explicit draft' })
  expect(result.freshRevision).toBeGreaterThan(result.acknowledgedRevision)
})

test('store: transaction aborts cannot partially enqueue or acknowledge a command', async ({ page }) => {
  const result = await page.evaluate(async scope => {
    const store = (window as unknown as { __rfiStore: StoreBridge }).__rfiStore
    const input = { description: 'Abort preserves evidence', priority: 'minor' as const }
    const revision = await store.saveRfiDraft(scope, input, 0)
    const before = await store.loadRfiSnapshot(scope)
    const envelope = store.createRfiPendingEnvelope(scope, input, crypto.randomUUID())
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      const request = key === undefined ? put.call(this, value) : put.call(this, value, key)
      if (this.name === 'pending') this.transaction.abort()
      return request
    }
    let enqueueRejected = false
    try { await store.putRfiPending(envelope, revision) } catch { enqueueRejected = true }
    finally { IDBObjectStore.prototype.put = put }
    const afterAbort = await store.loadRfiSnapshot(scope)
    await store.putRfiPending(envelope, revision)
    const queued = await store.loadRfiSnapshot(scope)
    const remove = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key) {
      const request = remove.call(this, key)
      if (this.name === 'pending') this.transaction.abort()
      return request
    }
    let cleanupRejected = false
    try { await store.deleteRfiPending(envelope) } catch { cleanupRejected = true }
    finally { IDBObjectStore.prototype.delete = remove }
    const afterCleanupAbort = await store.loadRfiSnapshot(scope)
    await store.deleteRfiPending(envelope)
    return { enqueueRejected, cleanupRejected, before, afterAbort, queued, afterCleanupAbort, final: await store.loadRfiSnapshot(scope) }
  }, { actorId: ACTOR, tenantId: TENANT, opportunityId: OPPORTUNITY, inspectionId: INSPECTION })
  expect(result.enqueueRejected).toBe(true)
  expect(result.cleanupRejected).toBe(true)
  expect(result.afterAbort).toEqual(result.before)
  expect(result.afterCleanupAbort).toEqual(result.queued)
  expect(result.final.pending).toBeNull()
  expect(result.final.draft).toBeNull()
})

test('store: mismatched saved draft cannot be enqueued or resurrected after acknowledgement', async ({ page }) => {
  const result = await page.evaluate(async scope => {
    const store = (window as unknown as { __rfiStore: StoreBridge }).__rfiStore
    const first = { description: 'Earlier saved draft A', priority: 'minor' as const }
    const second = { description: 'New explicit draft B', priority: 'minor' as const }
    const firstRevision = await store.saveRfiDraft(scope, first, 0)
    const before = await store.loadRfiSnapshot(scope)
    const envelope = store.createRfiPendingEnvelope(scope, second, crypto.randomUUID())
    let rejected = false
    try { await store.putRfiPending(envelope, firstRevision) } catch { rejected = true }
    const after = await store.loadRfiSnapshot(scope)
    if (!rejected) return { rejected, before, after, final: null, staleRejected: false }
    const secondRevision = await store.saveRfiDraft(scope, second, firstRevision)
    await store.putRfiPending(envelope, secondRevision)
    await store.deleteRfiPending(envelope)
    let staleRejected = false
    try { await store.saveRfiDraft(scope, first, firstRevision) } catch { staleRejected = true }
    return { rejected, before, after, final: await store.loadRfiSnapshot(scope), staleRejected }
  }, { actorId: ACTOR, tenantId: TENANT, opportunityId: OPPORTUNITY, inspectionId: INSPECTION })
  expect(result.rejected).toBe(true)
  expect(result.after).toEqual(result.before)
  expect(result.final).toMatchObject({ draft: null, pending: null })
  expect(result.staleRejected).toBe(true)
})

test('store: malformed persisted data fails closed and closed connections can reopen', async ({ page }) => {
  const result = await page.evaluate(async scope => {
    const store = (window as unknown as { __rfiStore: StoreBridge }).__rfiStore
    const open = IDBFactory.prototype.open
    const connections: IDBDatabase[] = []
    IDBFactory.prototype.open = function (name, version) {
      const request = version === undefined ? open.call(this, name) : open.call(this, name, version)
      request.addEventListener('success', () => connections.push(request.result))
      return request
    }
    const initial = await store.loadRfiSnapshot(scope)
    for (const connection of connections) { connection.dispatchEvent(new Event('versionchange')); connection.close() }
    const reopened = await store.loadRfiSnapshot(scope)
    IDBFactory.prototype.open = open
    const name = (await indexedDB.databases())[0]?.name
    if (!name) throw new Error('Expected real IndexedDB database')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('pending', 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore('pending').put({ scopeKey: [scope.actorId, scope.tenantId, scope.opportunityId, scope.inspectionId].join('|'), corrupt: true })
    })
    database.close()
    let rejected = false
    try { await store.loadRfiSnapshot(scope) } catch { rejected = true }
    return { initial, reopened, rejected }
  }, { actorId: ACTOR, tenantId: TENANT, opportunityId: OPPORTUNITY, inspectionId: INSPECTION })
  expect(result.reopened).toEqual(result.initial)
  expect(result.rejected).toBe(true)
})

test('keeps an unsubmitted draft through reload without sending it', async ({ page }) => {
  await durableDraft(page, 'Durable inspection draft')
  await page.getByLabel('Priority').selectOption('major')
  await page.getByLabel('Priority').blur()
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain('major')
  await page.reload()
  await expect(page.getByLabel('Description')).toHaveValue('Durable inspection draft')
  await expect(page.getByLabel('Priority')).toHaveValue('major')
  expect(requests).toHaveLength(0)
})

test('queues only explicit offline submission and reconnects after reload using the exact key', async ({ page }) => {
  // Connectivity signals are controlled; the harness page remains available
  // for reload. This is not a service-worker/offline-page-cache test.
  await page.goto(url + '?offline=1')
  await durableDraft(page, 'Explicit offline request')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await expect(page.getByLabel('Description')).toBeDisabled()
  const queued = await stored(page)
  expect(requests).toHaveLength(0)
  await page.reload()
  await expect(page.getByLabel('Description')).toHaveValue('Explicit offline request')
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(requests).toHaveLength(0)
  await connectivity(page, true)
  await waitRequests(1)
  const first = requests[0]!
  expect(first).toMatchObject({ opportunityId: OPPORTUNITY, inspectionId: INSPECTION, owner: { actorId: ACTOR, tenantId: TENANT }, fields: { description: 'Explicit offline request' } })
  expect(JSON.stringify(queued)).toContain(first.fields.submission_id)
  await connectivity(page, true)
  await connectivity(page, true)
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(requests).toHaveLength(1)
  confirm(0)
  await expect(page.getByLabel('Description')).toHaveValue('')
  await expect.poll(async () => JSON.stringify(await stored(page))).not.toContain('Explicit offline request')
  await page.reload()
  await expect(page.getByLabel('Description')).toHaveValue('')
  await expect(page.getByLabel('Description')).toBeEnabled()
  expect(requests).toHaveLength(1)
})

test('a stale tab cannot save over queued evidence or resurrect it after confirmation', async ({ page, context }) => {
  await connectivity(page, false)
  await durableDraft(page, 'Original multi-tab evidence')
  const stale = await context.newPage()
  try {
    await stale.goto(url + '?offline=1')
    await expect(stale.getByLabel('Description')).toHaveValue('Original multi-tab evidence')
    await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
    await expect(page.getByLabel('Description')).toBeDisabled()
    await stale.getByLabel('Description').fill('Stale tab must not overwrite queued payload')
    await expect(stale.getByRole('alert')).toBeVisible()
    const records = JSON.stringify(await stored(page))
    expect(records).toContain('Original multi-tab evidence')
    expect(records).not.toContain('Stale tab must not overwrite queued payload')
    expect(requests).toHaveLength(0)
    await connectivity(page, true)
    await waitRequests(1)
    expect(requests[0]?.fields.description).toBe('Original multi-tab evidence')
    confirm(0)
    await expect(page.getByLabel('Description')).toHaveValue('')
    // The stale page still carries its old persisted revision after cleanup.
    // If the editor is intentionally disabled, visible conflict itself blocks
    // autosave; otherwise exercise another real edit on that stale revision.
    if (await stale.getByLabel('Description').isEnabled()) {
      await stale.getByLabel('Description').fill('Late stale edit after acknowledgement')
    }
    await expect(stale.getByRole('alert')).toBeVisible()
    expect(JSON.stringify(await stored(page))).not.toContain('Late stale edit after acknowledgement')
    await page.reload()
    await expect(page.getByLabel('Description')).toHaveValue('')
    await stale.reload()
    await expect(stale.getByLabel('Description')).toHaveValue('')
    expect(JSON.stringify(await stored(page))).not.toContain('Original multi-tab evidence')
    expect(requests).toHaveLength(1)
    await durableDraft(stale, 'Fresh explicit draft after revision reload')
    await stale.reload()
    await expect(stale.getByLabel('Description')).toHaveValue('Fresh explicit draft after revision reload')
    expect(requests).toHaveLength(1)
  } finally { await stale.close() }
})

test('unknown and mismatched acknowledgement retain immutable payload across reload and retry', async ({ page }) => {
  await durableDraft(page, 'Frozen command evidence')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await waitRequests(1)
  const original = requests[0]!
  fail(0)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeDisabled()
  await page.reload()
  await waitRequests(2)
  expect(requests[1]).toEqual(original)
  confirm(1, { confirmation: { actorId: OTHER_ACTOR, tenantId: TENANT, opportunityId: OPPORTUNITY, inspectionId: INSPECTION, submissionId: original.fields.submission_id } })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(JSON.stringify(await stored(page))).toContain('Frozen command evidence')
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitRequests(3)
  await connectivity(page, true)
  expect(requests).toHaveLength(3)
  expect(requests[2]).toEqual(original)
  confirm(2, { rfiId: 'not-a-uuid' })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(JSON.stringify(await stored(page))).toContain('Frozen command evidence')
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitRequests(4)
  expect(requests[3]).toEqual(original)
  confirm(3, { unexpectedField: 'must reject strict success boundary' })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(JSON.stringify(await stored(page))).toContain('Frozen command evidence')
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitRequests(5)
  expect(requests[4]).toEqual(original)
  confirm(4)
  await expect(page.getByLabel('Description')).toHaveValue('')
})

for (const nextOwner of [
  { actor: OTHER_ACTOR, tenant: TENANT, label: 'actor' },
  { actor: ACTOR, tenant: '88888888-8888-4888-8888-888888888888', label: 'tenant' },
]) {
test(`${nextOwner.label} switch hides and never drains another owner queued command`, async ({ page }) => {
  await connectivity(page, false)
  await durableDraft(page, 'Private first owner request')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await expect(page.getByLabel('Description')).toBeDisabled()
  await page.evaluate(scope => (window as unknown as { __rfiOffline: Bridge }).__rfiOffline.mount(scope.actor, scope.tenant), nextOwner)
  await expect(page.getByLabel('Description')).toHaveValue('')
  await expect(page.getByLabel('Description')).toBeEnabled()
  await connectivity(page, true)
  expect(requests).toHaveLength(0)
  expect(JSON.stringify(await stored(page))).toContain('Private first owner request')
  await page.evaluate(scope => (window as unknown as { __rfiOffline: Bridge }).__rfiOffline.mount(scope.actor, scope.tenant), { actor: ACTOR, tenant: TENANT })
  await waitRequests(1)
  expect(requests[0]?.owner.actorId).toBe(ACTOR)
  confirm(0)
  await expect(page.getByLabel('Description')).toHaveValue('')
})
}

for (const change of ['owner', 'inspection', 'unmount'] as const) {
test(`delayed pending read cannot dispatch after ${change} changes`, async ({ page }) => {
  await connectivity(page, false)
  await durableDraft(page, 'Pending read belongs to original scope')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await expect(page.getByLabel('Description')).toBeDisabled()
  const original = JSON.stringify(await stored(page))
  // The real readonly transaction completes normally; delay only delivery of
  // its completion callback to the store promise. No fake database/results.
  await page.evaluate(() => {
    const native = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = native.apply(this, args)
      if (args[1] === 'readonly') {
        IDBDatabase.prototype.transaction = native
        Object.defineProperty(transaction, 'oncomplete', { configurable: true, set(handler) {
          transaction.addEventListener('complete', event => {
            (window as unknown as { __releaseRfiRead: () => void }).__releaseRfiRead = () => handler.call(transaction, event)
          })
        } })
      }
      return transaction
    }
  })
  await connectivity(page, true)
  await page.waitForFunction(() => Boolean((window as unknown as { __releaseRfiRead?: () => void }).__releaseRfiRead))
  expect(requests).toHaveLength(0)
  await page.evaluate(({ change, actor, tenant }) => {
    const bridge = (window as unknown as { __rfiOffline: Bridge }).__rfiOffline
    if (change === 'unmount') bridge.unmount()
    else bridge.mount(actor, tenant, change === 'inspection' ? '99999999-9999-4999-8999-999999999999' : undefined)
  }, { change, actor: change === 'owner' ? OTHER_ACTOR : ACTOR, tenant: TENANT })
  if (change === 'unmount') await expect(page.getByLabel('Description')).toHaveCount(0)
  else {
    await expect(page.getByLabel('Description')).toHaveValue('')
    await durableDraft(page, 'New scope remains intact')
  }
  await page.evaluate(async () => {
    (window as unknown as { __releaseRfiRead: () => void }).__releaseRfiRead()
    // Flush the resumed async continuation and its fetch, if erroneously made.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  expect(requests).toHaveLength(0)
  const after = JSON.stringify(await stored(page))
  expect(await page.evaluate(() => (window as unknown as { __rfiActionCalls?: number }).__rfiActionCalls ?? 0)).toBe(0)
  expect(after).toContain('Pending read belongs to original scope')
  if (change === 'unmount') expect(after).toBe(original)
  else {
    await expect(page.getByLabel('Description')).toHaveValue('New scope remains intact')
    expect(after).toContain('New scope remains intact')
  }
})
}

test('failed pending read after unknown outcome does not claim nothing was sent', async ({ page }) => {
  await durableDraft(page, 'Possibly committed command')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await waitRequests(1)
  fail(0)
  await expect(page.getByRole('alert')).toBeVisible()
  const before = JSON.stringify(await stored(page))
  await page.evaluate(() => {
    const native = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (...args) {
      IDBObjectStore.prototype.get = native
      throw new DOMException('Controlled pending read failure', 'UnknownError')
    }
  })
  await page.getByRole('button', { name: /Retry/i }).click()
  await expect(page.getByRole('alert')).toContainText('The queued RFI could not be read')
  await expect(page.getByRole('alert')).not.toContainText(/nothing was sent/i)
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(requests).toHaveLength(1)
  expect(JSON.stringify(await stored(page))).toBe(before)
})

test('transport loss while navigator remains online retains exact command for retry', async ({ page }) => {
  await durableDraft(page, 'Connection lost after request')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await waitRequests(1)
  const original = requests[0]!
  pending[0]!.destroy()
  expect(await page.evaluate(() => navigator.onLine)).toBe(true)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(JSON.stringify(await stored(page))).toContain('Connection lost after request')
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitRequests(2)
  expect(requests[1]).toEqual(original)
  confirm(1)
  await expect(page.getByLabel('Description')).toHaveValue('')
})

test('stale in-flight acknowledgement from owner A cannot clear owner B draft', async ({ page }) => {
  await durableDraft(page, 'Owner A in-flight command')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await waitRequests(1)
  await page.evaluate(scope => (window as unknown as { __rfiOffline: Bridge }).__rfiOffline.mount(scope.actor, scope.tenant), { actor: OTHER_ACTOR, tenant: TENANT })
  await expect(page.getByLabel('Description')).toHaveValue('')
  await page.getByLabel('Description').fill('Owner B must retain this draft')
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain('Owner B must retain this draft')
  confirm(0)
  await page.waitForFunction(() => (window as unknown as { __rfiActionResolved?: number }).__rfiActionResolved === 1)
  await expect(page.getByLabel('Description')).toHaveValue('Owner B must retain this draft')
  await expect(page.getByLabel('Description')).toBeEnabled()
  // An IndexedDB round trip observes state after the old response, without
  // inventing a second owner's server confirmation.
  expect(JSON.stringify(await stored(page))).toContain('Owner B must retain this draft')
  expect(requests).toHaveLength(1)
})

test('failed local write never reports saved or sends the command', async ({ page }) => {
  // Fault injection is separate from the real-IDB durability cases above.
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Controlled quota failure', 'QuotaExceededError') }
    IDBObjectStore.prototype.add = function () { throw new DOMException('Controlled quota failure', 'QuotaExceededError') }
  })
  await page.getByLabel('Description').fill('Unsaved quota failure')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(JSON.stringify(await stored(page))).not.toContain('Unsaved quota failure')
  const submit = page.getByRole('button', { name: 'Add RFI', exact: true })
  if (await submit.isEnabled()) await submit.click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('failed local cleanup retains the exact confirmed request for safe retry', async ({ page }) => {
  await durableDraft(page, 'Confirmed but cleanup failed')
  await page.getByRole('button', { name: 'Add RFI', exact: true }).click()
  await waitRequests(1)
  const original = requests[0]!
  await page.evaluate(() => {
    const originalDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key) {
      IDBObjectStore.prototype.delete = originalDelete
      throw new DOMException('Controlled cleanup failure', 'UnknownError')
    }
  })
  confirm(0)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeDisabled()
  expect(JSON.stringify(await stored(page))).toContain('Confirmed but cleanup failed')
  await page.getByRole('button', { name: /Retry/i }).click()
  await waitRequests(2)
  expect(requests[1]).toEqual(original)
  confirm(1)
  await expect(page.getByLabel('Description')).toHaveValue('')
  await expect.poll(async () => JSON.stringify(await stored(page))).not.toContain('Confirmed but cleanup failed')
})

test('production-styled form is keyboard usable without overflow at four widths', async ({ page }) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(url)
    const description = page.getByLabel('Description')
    await expect(description).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Add RFI', exact: true })).toBeEnabled()
    await description.focus()
    await page.keyboard.type(`Keyboard RFI at ${width}`)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Priority')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByLabel('Priority')).toHaveValue('major')
    await page.screenshot({ path: join(tmpdir(), `erp-rfi-offline-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('Description').fill('')
    await page.getByLabel('Priority').selectOption('minor')
  }
  expect(requests).toHaveLength(0)
})
