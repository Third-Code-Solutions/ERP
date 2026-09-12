import { expect, test, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import type { ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'

const scope = { actorId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', opportunityId: '33333333-3333-4333-8333-333333333333' }
const other = '44444444-4444-4444-8444-444444444444'
const documentId = '55555555-5555-4555-8555-555555555555'
type Scope = typeof scope
type Bridge = { mount(scope: Scope): void }
type Submission = { opportunityId: string; fields: Record<string, string>; owner: { actorId: string; tenantId: string } }
let directory = ''
let url = ''
let vite: import('vite').ViteDevServer | undefined
const submissions: Submission[] = []
const pending: ServerResponse[] = []
const errors: string[] = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=', 'base64')
function photoReceipt(fileName: string, bytes = png) {
  return { documentId, tenantId: scope.tenantId, opportunityId: scope.opportunityId, projectId: null, fileName,
    storagePath: `${scope.tenantId}/opportunities/${scope.opportunityId}/inspection/${createHash('sha256').update(bytes).digest('hex')}-${fileName}`, status: 'created' }
}

// Real React, production CSS and IndexedDB; only the server action is replaced.
// This does not establish authenticated Next/Core or provider persistence.
test.describe.configure({ mode: 'default' })
test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  directory = resolve(await mkdtemp(join(tmpdir(), 'erp-inspection-draft-')))
  if (!directory.startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('erp-inspection-draft-')) throw new Error('Unsafe harness path')
  const actions = join(directory, 'actions.ts')
  const auth = join(directory, 'auth.ts')
  await writeFile(auth, `export function createSupabaseBrowserClient(){return {auth:{async getSession(){return {data:{session:{access_token:'controlled-browser-session',user:{id:window.__scope.actorId}}},error:null}}}}}`)
  await writeFile(actions, `export async function submitInspection(opportunityId, formData, owner) {
    const response = await fetch('/__submit', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({opportunityId,fields:Object.fromEntries(formData),owner})}); const result=await response.json(); window.__resolved=(window.__resolved||0)+1; return result
  }`)
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(join(directory, 'harness.tsx'), `import React from 'react'
import {createRoot} from 'react-dom/client'
import ${JSON.stringify(join(process.cwd(), 'src/app/globals.css'))}
import {InspectionForm} from ${JSON.stringify(join(process.cwd(), 'src/components/proposal/inspection-form.tsx'))}
import * as store from ${JSON.stringify(join(process.cwd(), 'src/lib/operations/site-inspection-draft.ts'))}
window.__draftStore=store
const nativeFetch=window.fetch.bind(window)
window.fetch=async(...args)=>{const response=await nativeFetch(...args); if(String(args[0]).endsWith('/inspection-photos/upload')){await response.clone().json();window.__photoResolved=(window.__photoResolved||0)+1}return response}
const root=createRoot(document.getElementById('root'))
window.__inspection={mount(scope){window.__scope=scope;root.render(<main style={{maxWidth:680,margin:'0 auto',padding:16}}><h1>Site inspection</h1><InspectionForm {...scope} pprfSubmitted={true}/></main>)}}
window.__inspection.mount(JSON.parse(new URL(location.href).searchParams.get('scope') || ${JSON.stringify(JSON.stringify(scope))}))
`)
  vite = await createServer({ root: directory, configFile: false, esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), directory] } },
    resolve: { alias: [
      { find: 'react', replacement: join(process.cwd(), 'node_modules/react') },
      { find: 'react-dom', replacement: join(process.cwd(), 'node_modules/react-dom') },
      { find: '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', replacement: actions },
      { find: '@third-code-erp/auth/client', replacement: auth },
      { find: '@', replacement: join(process.cwd(), 'src') },
    ] }, plugins: [{ name: 'controlled-inspection-action', configureServer(server) {
      server.middlewares.use('/__submit', (request, response) => {
        let body = ''
        request.on('data', chunk => { body += String(chunk) })
        request.on('end', () => { submissions.push(JSON.parse(body)); pending.push(response); response.setHeader('content-type', 'application/json'); response.flushHeaders() })
      })
    } }],
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Harness did not bind')
  url = `http://127.0.0.1:${address.port}`
})
test.beforeEach(async ({ page }) => {
  submissions.length = 0; pending.length = 0; errors.length = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/crm/opportunities/*/inspection-photos/transport', route => route.fulfill({ json: {
    actorId: route.request().headers()['x-expected-actor-id'], tenantId: route.request().headers()['x-expected-tenant-id'],
    opportunityId: scope.opportunityId, uploadUrl: `https://core.example.test/v1/opportunities/${scope.opportunityId}/inspection-photos/upload`,
  } }))
})
test.afterEach(() => {
  for (const response of pending) if (!response.writableEnded) response.end(JSON.stringify({ ok: false, error: 'Controlled test ended' }))
  expect(errors).toEqual([])
})
test.afterAll(async () => {
  await vite?.close()
  if (directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('erp-inspection-draft-')) {
    const { rm } = await import('node:fs/promises')
    await rm(directory, { recursive: true, force: true })
  }
})

async function open(page: Page, current = scope) {
  await page.goto(url + '/?scope=' + encodeURIComponent(JSON.stringify(current)))
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
}
async function save(page: Page, address: string) {
  await page.getByLabel('Site address').fill(address)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible()
}
async function remount(page: Page, current: Scope) {
  await page.evaluate(value => (window as unknown as { __inspection: Bridge }).__inspection.mount(value), current)
}
async function addPhotos(page: Page, names: string[]) {
  await page.getByLabel('Photos', { exact: true }).setInputFiles(names.map(name => ({ name, mimeType: 'image/png', buffer: png })))
  for (const name of names) await expect(page.getByRole('button', { name: `Remove photo ${name}` })).toBeVisible()
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible()
}
function confirmSubmission(index: number, override: Partial<Scope> = {}) {
  const response = pending[index]
  const request = submissions[index]
  if (!response || !request) throw new Error('Missing controlled submission response')
  response.end(JSON.stringify({ ok: true, replayed: false, confirmation: { ...request.owner, opportunityId: request.opportunityId, submissionId: request.fields.client_submission_id, ...override } }))
}

for (const dimension of ['actorId', 'tenantId', 'opportunityId'] as const) {
  test(`${dimension} separates mounted and reloaded drafts`, async ({ page }) => {
    await open(page)
    await save(page, 'Original private site')
    const changed = { ...scope, [dimension]: other }
    await remount(page, changed)
    await expect(page.getByLabel('Site address')).toHaveValue('')
    await save(page, 'Different scoped site')
    await open(page, changed)
    await expect(page.getByLabel('Site address')).toHaveValue('Different scoped site')
    await open(page)
    await expect(page.getByLabel('Site address')).toHaveValue('Original private site')
  })
}

test('reload preserves exact photo bytes and submission identity without submitting', async ({ page }) => {
  await open(page); await save(page, 'Durable site'); await addPhotos(page, ['evidence.png'])
  const key = await page.locator('[name=client_submission_id]').inputValue()
  expect(key).toMatch(/^[0-9a-f-]{36}$/)
  const image = await page.locator('.photo-thumb').getAttribute('src')
  expect(image).toBe('data:image/png;base64,' + png.toString('base64'))
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('Durable site')
  await expect(page.locator('.photo-thumb')).toHaveAttribute('src', image!)
  await expect(page.locator('[name=client_submission_id]')).toHaveValue(key)
  expect(submissions).toEqual([])
})

test('unavailable storage never reports a saved draft', async ({ page }) => {
  await page.addInitScript(() => {
    const factory = window.indexedDB
    Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined })
    ;(window as unknown as { __restoreStorage: () => void }).__restoreStorage = () => Object.defineProperty(window, 'indexedDB', { configurable: true, value: factory })
  })
  await page.goto(url)
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByText(/Draft saved on this device|Saved offline on this device/)).toHaveCount(0)
  expect(submissions).toEqual([])
  await page.evaluate(() => (window as unknown as { __restoreStorage: () => void }).__restoreStorage())
  await page.getByRole('button', { name: 'Retry loading draft', exact: true }).click()
  await save(page, 'Storage recovered explicitly')
})

test('absent IndexedDB permits only explicit online-only work and keeps unknown retries frozen in memory', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined }))
  await page.goto(url)
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByLabel('Site address')).toBeDisabled()
  expect(submissions).toHaveLength(0)
  await page.getByRole('button', { name: 'Continue online without a saved draft', exact: true }).click()
  await expect(page.getByLabel('Site address')).toBeEnabled()
  await page.getByLabel('Site address').fill('Explicit online-only report')
  await page.getByLabel('Observations').fill('Keep this exact report in memory')
  await expect(page.getByText(/Draft saved on this device|Saved offline on this device/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  const original = submissions[0]
  expect(original?.owner).toEqual({ actorId: scope.actorId, tenantId: scope.tenantId })
  const response = pending[0]
  if (!response) throw new Error('Missing online-only submission')
  response.end(JSON.stringify({ ok: false, error: 'Controlled unknown online-only outcome' }))
  await expect(page.getByRole('button', { name: 'Retry report sync', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await expect(page.getByText(/Draft saved on this device|Saved offline on this device/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry report sync', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(2)
  expect(submissions[1]).toEqual(original)
  confirmSubmission(1)
  await expect(page.getByLabel('Site address')).toHaveValue('')
})

test('corrupt retained draft stays blocked without an online-only bypass', async ({ page }) => {
  await open(page)
  await save(page, 'Evidence before corruption fixture')
  await page.evaluate(async current => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('abi-ops-site-inspection', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('drafts', 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
        transaction.objectStore('drafts').put({ malformed: 'Retained synthetic evidence' }, [current.actorId, current.tenantId, current.opportunityId].join('|'))
      })
    } finally { database.close() }
  }, scope)
  await page.reload()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Continue online without a saved draft', exact: true })).toHaveCount(0)
  await expect(page.getByText(/Draft saved on this device|Saved offline on this device/)).toHaveCount(0)
  expect(submissions).toHaveLength(0)
})

test('real draft hydration disables editing until transaction completion is delivered', async ({ page }) => {
  await page.addInitScript(() => {
    const native = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = native.apply(this, args)
      if (args[1] === 'readonly') {
        IDBDatabase.prototype.transaction = native
        Object.defineProperty(transaction, 'oncomplete', { configurable: true, set(handler) {
          transaction.addEventListener('complete', event => {
            (window as unknown as { __releaseDraftRead: () => void }).__releaseDraftRead = () => handler.call(transaction, event)
          })
        } })
      }
      return transaction
    }
  })
  await page.goto(url)
  await page.waitForFunction(() => Boolean((window as unknown as { __releaseDraftRead?: () => void }).__releaseDraftRead))
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await expect(page.getByLabel('Photos', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled()
  await page.evaluate(() => (window as unknown as { __releaseDraftRead: () => void }).__releaseDraftRead())
  await expect(page.getByLabel('Site address')).toBeEnabled()
  expect(submissions).toHaveLength(0)
})

test('aborted real IndexedDB write is not acknowledged as saved', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = original.apply(this, args)
      this.transaction.abort()
      return request
    }
  })
  await page.getByLabel('Site address').fill('Must not be saved')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByText('Draft saved on this device.', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('')
})

test('saved acknowledgement waits for actual write transaction completion', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const native = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = native.apply(this, args)
      if (args[1] === 'readwrite') {
        IDBDatabase.prototype.transaction = native
        Object.defineProperty(transaction, 'oncomplete', { configurable: true, set(handler) {
          transaction.addEventListener('complete', event => {
            (window as unknown as { __releaseDraftWrite: () => void }).__releaseDraftWrite = () => handler.call(transaction, event)
          })
        } })
      }
      return transaction
    }
  })
  await page.getByLabel('Site address').fill('Await committed write acknowledgement')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.waitForFunction(() => Boolean((window as unknown as { __releaseDraftWrite?: () => void }).__releaseDraftWrite))
  await expect(page.getByText('Draft saved on this device.', { exact: true })).toHaveCount(0)
  await page.evaluate(() => (window as unknown as { __releaseDraftWrite: () => void }).__releaseDraftWrite())
  await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('Await committed write acknowledgement')
})

test('partial photo receipt reloads and removing it excludes its document from submission', async ({ page }) => {
  let uploads = 0
  await page.route('**/v1/opportunities/*/inspection-photos/upload', async route => {
    uploads++
    await route.fulfill({ status: uploads === 1 ? 200 : 503, json: uploads === 1 ? photoReceipt('first.png') : { error: 'Controlled second upload failure' } })
  })
  await open(page); await save(page, 'Partial upload site'); await addPhotos(page, ['first.png', 'second.png'])
  const key = await page.locator('[name=client_submission_id]').inputValue()
  await page.getByRole('button', { name: 'Sync report and photos', exact: true }).click()
  await expect(page.getByText('Photo upload is unconfirmed. Your saved photo remains available; retry the same photo.', { exact: true })).toBeVisible()
  expect(submissions).toHaveLength(0)
  await page.reload()
  await expect(page.getByText('Uploaded; attaches when report syncs', { exact: true })).toBeVisible()
  await expect(page.locator('[name=client_submission_id]')).toHaveValue(key)
  await page.getByRole('button', { name: 'Remove photo first.png' }).click()
  await page.getByRole('button', { name: 'Remove photo second.png' }).click()
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  const submission = submissions[0]
  if (!submission?.fields.photo_document_ids) throw new Error('Missing submitted photo IDs')
  expect(JSON.parse(submission.fields.photo_document_ids)).toEqual([])
  expect(submission.fields.client_submission_id).toBe(key)
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await expect(page.getByLabel('Photos', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled()
  confirmSubmission(0)
})

test('stale tab cannot overwrite a newer draft or resurrect a cleared report', async ({ page, context }) => {
  await open(page); await save(page, 'Initial shared revision')
  const stale = await context.newPage()
  await open(stale)
  await expect(stale.getByLabel('Site address')).toHaveValue('Initial shared revision')
  await save(page, 'Newer authoritative local revision')
  await stale.getByLabel('Site address').fill('Stale overwrite')
  await stale.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(stale.getByRole('alert').first()).toBeVisible()
  await expect(stale.getByRole('button', { name: 'Continue online without a saved draft', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('Newer authoritative local revision')
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  confirmSubmission(0)
  await expect(page.getByText('Site inspection submitted. The Design handoff was recorded.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Site address')).toHaveValue('')
  await stale.getByLabel('Site address').fill('Stale resurrection')
  await stale.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(stale.getByRole('alert').first()).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('')
  await stale.reload()
  await save(stale, 'Fresh revision is usable')
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('Fresh revision is usable')
  await stale.close()
})

test('unknown and mismatched confirmation survive reload and retry the exact frozen report', async ({ page }) => {
  await page.route('**/v1/opportunities/*/inspection-photos/upload', route => route.fulfill({ json: photoReceipt('pending.png') }))
  await open(page); await save(page, 'Frozen submitted site')
  await page.getByLabel('Observations').fill('Exact submitted observations')
  await addPhotos(page, ['pending.png'])
  await page.getByRole('button', { name: 'Sync report and photos', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  const original = submissions[0]
  expect(submissions[0]?.owner).toEqual({ actorId: scope.actorId, tenantId: scope.tenantId })
  const response = pending[0]
  if (!response) throw new Error('Missing unknown response')
  response.end(JSON.stringify({ ok: false, error: 'Controlled unknown server outcome' }))
  await expect(page.getByRole('button', { name: 'Retry report sync', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove photo pending.png' })).toBeDisabled()
  await page.reload()
  await expect(page.getByLabel('Site address')).toHaveValue('Frozen submitted site')
  await expect(page.getByLabel('Observations')).toHaveValue('Exact submitted observations')
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await page.getByRole('button', { name: 'Retry report sync', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(2)
  expect(submissions[1]).toEqual(original)
  confirmSubmission(1, { actorId: other })
  await page.waitForFunction(() => (window as unknown as { __resolved?: number }).__resolved === 1)
  await expect(page.getByRole('button', { name: 'Retry report sync', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Site address')).toBeDisabled()
  await page.getByRole('button', { name: 'Retry report sync', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(3)
  expect(submissions[2]).toEqual(original)
  confirmSubmission(2)
  await expect(page.getByLabel('Site address')).toHaveValue('')
})

test('owner switch during photo upload prevents the obsolete session dispatching a report', async ({ page }) => {
  let releaseUpload: (() => Promise<void>) | undefined
  await page.route('**/v1/opportunities/*/inspection-photos/upload', route => {
    expect(route.request().headers()['x-expected-actor-id']).toBe(scope.actorId)
    expect(route.request().headers()['x-expected-tenant-id']).toBe(scope.tenantId)
    expect(route.request().headers().authorization).toBe('Bearer controlled-browser-session')
    releaseUpload = () => route.fulfill({ json: photoReceipt('held.png') })
  })
  await open(page); await save(page, 'Original uploading report'); await addPhotos(page, ['held.png'])
  await page.getByRole('button', { name: 'Sync report and photos', exact: true }).click()
  await expect.poll(() => Boolean(releaseUpload)).toBe(true)
  await remount(page, { ...scope, actorId: other })
  await expect(page.getByLabel('Site address')).toHaveValue('')
  await save(page, 'New owner draft')
  if (!releaseUpload) throw new Error('Missing held upload')
  await releaseUpload()
  await page.waitForFunction(() => (window as unknown as { __photoResolved?: number }).__photoResolved === 1)
  await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  expect(submissions).toHaveLength(0)
  await expect(page.getByLabel('Site address')).toHaveValue('New owner draft')
  await open(page, { ...scope, actorId: other })
  await expect(page.getByLabel('Site address')).toHaveValue('New owner draft')
})

test('keyboard form and long photo name fit four viewport widths', async ({ page }) => {
  await open(page)
  await page.getByLabel('Site address').focus()
  await page.keyboard.type('Keyboard field report')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Floor area (sqm)')).toBeFocused()
  await addPhotos(page, ['very-long-inspection-evidence-filename-for-a-narrow-mobile-screen.png'])
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1100 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(tmpdir(), `erp-inspection-draft-${width}.png`), fullPage: true })
  }
})

test('photo above Web body limit transfers directly to Core and persists its verified receipt', async ({ page }) => {
  const large = Buffer.alloc(5 * 1024 * 1024)
  png.copy(large)
  let uploads = 0
  const webBodies: number[] = []
  page.on('request', request => {
    if (request.url().includes('/api/crm/')) webBodies.push(request.postDataBuffer()?.length ?? 0)
  })
  await page.route('**/v1/opportunities/*/inspection-photos/upload', async route => {
    uploads++
    expect(route.request().postDataBuffer()!.length).toBeGreaterThan(5 * 1024 * 1024)
    expect(route.request().headers().authorization).toBe('Bearer controlled-browser-session')
    await route.fulfill({ json: photoReceipt('large.png', large) })
  })
  await open(page); await save(page, 'Large evidence upload')
  await page.getByLabel('Photos', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: large })
  await expect(page.getByRole('button', { name: 'Remove photo large.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Sync report and photos', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  expect(JSON.parse(submissions[0]!.fields.photo_document_ids!)).toEqual([documentId])
  expect(webBodies.length).toBeGreaterThan(0)
  expect(webBodies.every(length => length === 0)).toBe(true)
  pending[0]!.end(JSON.stringify({ ok: false, error: 'Controlled response loss' }))
  await expect(page.getByRole('button', { name: 'Retry report sync', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByText('Uploaded; attaches when report syncs', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retry report sync', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(2)
  expect(uploads).toBe(1)
  expect(submissions[1]).toEqual(submissions[0])
  confirmSubmission(1)
})

for (const originalName of ['café.png', 'folder/photo.png', 'folder\\photo.png']) {
  test(`canonical multipart filename preserves receipt recovery: ${originalName}`, async ({ page }) => {
    const canonicalName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
    await page.route('**/v1/opportunities/*/inspection-photos/upload', async route => {
      expect(route.request().postDataBuffer()?.toString('utf8')).toContain(`filename="${canonicalName}"`)
      await route.fulfill({ json: photoReceipt(canonicalName) })
    })
    await open(page); await save(page, 'Canonical filename evidence')
    await addPhotos(page, [originalName])
    await page.getByRole('button', { name: 'Sync report and photos', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(1)
    expect(JSON.parse(submissions[0]!.fields.photo_document_ids!)).toEqual([documentId])
    confirmSubmission(0)
    await expect(page.getByLabel('Site address')).toHaveValue('')
  })
}
