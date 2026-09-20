import { expect, test, type Page } from '@playwright/test'
import type { ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

const PROJECT = '33333333-3333-4333-8333-333333333333'
const ENTRY = '44444444-4444-4444-8444-444444444444'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const TENANT = '22222222-2222-4222-8222-222222222222'
const OTHER = '99999999-9999-4999-8999-999999999999'
type Scope = { projectId: string; entryId: string; actorId: string; tenantId: string }
type Command = { fields: Array<[string, string]>; owner: { actorId: string; tenantId: string } }
type Read = { projectId: string; query: { page: number; limit: number } }
type Bridge = { mount: (scope: Partial<Scope>, disabled?: boolean) => void; unmount: () => void }
let directory = ''
let origin = ''
let vite: import('vite').ViteDevServer | undefined
const reads: Read[] = []
const commands: Command[] = []
const responses: ServerResponse[] = []
const heldReads: Array<{ input: Read; response: ServerResponse }> = []
let readMode: 'normal' | 'error' | 'empty' | 'outofrange' | 'foreign' | 'hold' = 'normal'
const errors: string[] = []

function document(index: number, projectId = PROJECT) {
  return { id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`, projectId,
    fileName: index === 25 ? 'Structural-coordination-drawing-with-a-long-unbroken-file-name-for-the-north-slab-and-concealed-services-final-review.pdf' : `Plan ${String(index).padStart(2, '0')}.pdf`, documentType: 'other', mimeType: 'application/pdf', sizeBytes: 100,
    description: null, createdAt: '2026-09-13T00:00:00.000Z' }
}
function readResult(input: Read) {
  if (readMode === 'error') return { ok: false, error: 'Controlled document read unavailable.' }
  const empty = readMode === 'empty' || readMode === 'outofrange'
  const total = readMode === 'empty' ? 0 : readMode === 'outofrange' ? 1 : 51
  return { ok: true, data: { projectId: input.projectId, page: input.query.page, limit: input.query.limit, total,
    totalPages: Math.max(1, Math.ceil(total / input.query.limit)),
    rows: empty ? [] : Array.from({ length: 51 }, (_, index) => document(index + 1, readMode === 'foreign' ? OTHER : input.projectId)).slice((input.query.page - 1) * input.query.limit, input.query.page * input.query.limit),
  } }
}
function answer(index: number, result: unknown): void { responses[index]!.end(JSON.stringify(result)) }
function confirm(index: number, override: Record<string, unknown> = {}): void {
  const input = commands[index]!
  const fields = Object.fromEntries(input.fields)
  answer(index, { ok: true, outcome: 'confirmed', success: 'Punchlist handoff confirmed.',
    receipt: { ...input.owner, projectId: fields.projectId, entryId: fields.entryId, clientRequestId: fields.clientRequestId }, ...override })
}
async function countCommands(count: number): Promise<void> { await expect.poll(() => commands.length).toBe(count) }
async function mount(page: Page, scope: Partial<Scope>, disabled = false): Promise<void> {
  await page.evaluate(({ scope, disabled }) => (window as unknown as { __quality: Bridge }).__quality.mount(scope, disabled), { scope, disabled })
}
async function openForm(page: Page): Promise<void> {
  await page.getByText('Create punchlist work', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create punchlist items', exact: true })).toBeEnabled()
}
async function choose(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Choose project document', exact: true }).click()
  await page.getByRole('button', { name: 'Select Plan 01.pdf', exact: true }).click()
}

// Real production components/CSS; local controlled action responses only.
// This does not prove Next authentication, Core persistence or server replay.
test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  directory = resolve(await mkdtemp(join(tmpdir(), 'erp-quality-document-')))
  if (!directory.startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('erp-quality-document-')) throw new Error('Unsafe quality harness directory')
  const actionFile = join(directory, 'actions.ts')
  const readFile = join(directory, 'reads.ts')
  await writeFile(actionFile, `export async function handoffQualityHoldPointToPunchlist(prev,form,owner) { const response = await fetch('/__quality_command',{method:'POST',body:JSON.stringify({fields:[...form.entries()],owner})}); const result=await response.json(); window.__qualityResolved=(window.__qualityResolved||0)+1; return result }`)
  await writeFile(readFile, `export async function listQualityProjectDocuments(projectId,query) { const response=await fetch('/__quality_read',{method:'POST',body:JSON.stringify({projectId,query})}); const result=await response.json(); window.__qualityReadResolved=(window.__qualityReadResolved||0)+1; return result }`)
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(join(directory, 'harness.tsx'), `import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ${JSON.stringify(join(process.cwd(), 'src/app/globals.css'))}
import {QualityDocumentPicker} from ${JSON.stringify(join(process.cwd(), 'src/app/(dashboard)/projects/[id]/quality/quality-document-picker.tsx'))}
import {QualityPunchlistHandoffForm} from ${JSON.stringify(join(process.cwd(), 'src/app/(dashboard)/projects/[id]/quality/quality-punchlist-handoff-form.tsx'))}
const root=createRoot(document.getElementById('root'))
const initial={projectId:${JSON.stringify(PROJECT)},entryId:${JSON.stringify(ENTRY)},actorId:${JSON.stringify(ACTOR)},tenantId:${JSON.stringify(TENANT)}}
function Fixture({scope,disabled}) { const [value,setValue]=useState(null); const row={id:scope.entryId,projectId:scope.projectId,iwrNumber:'IWR-0001',title:'Slab',description:'Inspect slab',discipline:'Structural',location:'Level 2',planReference:'S-201 detail 4',holdPoint:true,inspectionDate:null,status:'rejected',requestNotes:'',findings:'Cover deficient',rejectionReason:'Repair before concealment.',acceptanceNotes:'',requestedBy:scope.actorId,assignedTo:null,submittedAt:null,submittedBy:null,acceptedAt:null,acceptedBy:null,rejectedAt:null,rejectedBy:null,punchlistHandoffAt:null,punchlistHandoffBy:null,version:1,createdAt:'2026-09-13T00:00:00.000Z',updatedAt:'2026-09-13T00:00:00.000Z'}; return <main style={{maxWidth:960,margin:'0 auto',padding:16}}><h1>Quality handoff fixture</h1>{location.search.includes('picker')?<QualityDocumentPicker projectId={scope.projectId} value={value} onChange={setValue} disabled={disabled}/>:<QualityPunchlistHandoffForm projectId={scope.projectId} row={row} owner={{actorId:scope.actorId,tenantId:scope.tenantId}}/>}</main> }
window.__quality={mount(partial,disabled=false){root.render(<Fixture scope={{...initial,...partial}} disabled={disabled}/>)},unmount(){root.render(null)}}
window.__quality.mount({})
`)
  vite = await createServer({ root: directory, configFile: false, esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), directory] } },
    resolve: { alias: [{ find: 'react', replacement: join(process.cwd(), 'node_modules/react') }, { find: 'react-dom', replacement: join(process.cwd(), 'node_modules/react-dom') }] },
    plugins: [{ name: 'quality-action-boundaries', enforce: 'pre', resolveId(source, importer) {
      if (importer?.includes('quality-document-picker') && source === './document-actions') return readFile
      if (importer?.includes('quality-punchlist-handoff-form') && source === './actions') return actionFile
    }, configureServer(server) {
      for (const kind of ['read', 'command']) server.middlewares.use('/__quality_' + kind, (request, response) => {
        let body = ''
        request.on('data', chunk => { body += String(chunk) })
        request.on('end', () => {
          response.setHeader('content-type', 'application/json')
          if (kind === 'read') {
            const input: Read = JSON.parse(body); reads.push(input)
            if (readMode === 'hold') heldReads.push({ input, response })
            else response.end(JSON.stringify(readResult(input)))
          } else { commands.push(JSON.parse(body)); responses.push(response); response.flushHeaders() }
        })
      })
    } }],
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Quality harness did not bind')
  origin = `http://127.0.0.1:${address.port}`
})
test.beforeEach(async ({ page }) => {
  reads.length = 0; commands.length = 0; responses.length = 0; heldReads.length = 0; errors.length = 0; readMode = 'normal'
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await expect(page.getByRole('heading')).toHaveText('Quality handoff fixture')
})
test.afterEach(() => {
  for (const response of [...responses, ...heldReads.map(read => read.response)]) if (!response.writableEnded) response.end(JSON.stringify({ ok: false, outcome: 'unknown', error: 'Test ended' }))
  expect(errors).toEqual([])
})
test.afterAll(async () => {
  await vite?.close()
  if (directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('erp-quality-document-')) {
    const { rm } = await import('node:fs/promises'); await rm(directory, { recursive: true, force: true })
  }
})

test('lazy pagination retains selected document across pages and clears explicitly', async ({ page }) => {
  await openForm(page)
  expect(reads).toHaveLength(0)
  await choose(page)
  await expect(page.locator('input[name=planDocumentId]')).toHaveValue(document(1).id)
  await expect(page.getByRole('list', { name: 'Project documents' }).getByRole('listitem')).toHaveCount(25)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Select Plan 26.pdf' })).toBeVisible()
  await expect(page.locator('input[name=planDocumentId]')).toHaveValue(document(1).id)
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(page.locator('input[name=planDocumentId]')).toHaveValue('')
  expect(reads.map(read => read.query)).toEqual([{ page: 1, limit: 25 }, { page: 2, limit: 25 }])
})

test('read failure, nested foreign scope, empty and out-of-range retain honest recovery', async ({ page }) => {
  await openForm(page)
  readMode = 'error'
  await page.getByRole('button', { name: 'Choose project document' }).click()
  await expect(page.getByRole('alert')).toContainText('Controlled document read unavailable')
  readMode = 'foreign'
  await page.getByRole('button', { name: 'Retry loading documents' }).click()
  await expect(page.getByRole('alert')).toContainText('invalid scope')
  await expect(page.getByRole('button', { name: 'Select Plan 01.pdf' })).toHaveCount(0)
  readMode = 'empty'
  await page.getByRole('button', { name: 'Retry loading documents' }).click()
  await expect(page.getByText('No project documents are available. You may continue without one.')).toBeVisible()
  await page.getByRole('button', { name: 'Close document chooser' }).click()
  readMode = 'normal'
  await page.getByRole('button', { name: 'Choose project document' }).click()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  readMode = 'outofrange'
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('No documents on this page. Return to the first page.')).toBeVisible()
  readMode = 'normal'
  await page.getByRole('button', { name: 'First page', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Select Plan 01.pdf' })).toBeVisible()
})

test('selected evidence from a previous project is invalid until explicit clear or replacement', async ({ page }) => {
  await page.goto(origin + '?picker'); await choose(page)
  await expect(page.locator('input[name=planDocumentId]')).toHaveValue(document(1).id)
  await mount(page, { projectId: OTHER })
  await expect(page.getByRole('alert')).toContainText('does not belong to this project')
  await expect(page.locator('input[name=planDocumentId]')).toHaveValue('')
  await expect(page.getByText('No project document selected. You may continue without one.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await choose(page)
  await expect(page.locator('input[name=planDocumentId]')).toHaveValue(document(1).id)
  expect(reads.at(-1)?.projectId).toBe(OTHER)
})

for (const change of ['project', 'disabled', 'unmount'] as const) test(`late document read is ignored after ${change}`, async ({ page }) => {
  await page.goto(origin + '?picker')
  readMode = 'hold'
  await page.getByRole('button', { name: 'Choose project document' }).click()
  await expect.poll(() => heldReads.length).toBe(1)
  if (change === 'unmount') await page.evaluate(() => (window as unknown as { __quality: Bridge }).__quality.unmount())
  else await mount(page, change === 'project' ? { projectId: OTHER } : {}, change === 'disabled')
  readMode = 'normal'
  heldReads[0]!.response.end(JSON.stringify(readResult(heldReads[0]!.input)))
  await page.waitForFunction(() => (window as unknown as { __qualityReadResolved?: number }).__qualityReadResolved === 1)
  await expect(page.getByRole('button', { name: 'Select Plan 01.pdf' })).toHaveCount(0)
  if (change === 'disabled') await expect(page.getByRole('button', { name: 'Close document chooser' })).toBeDisabled()
  expect(commands).toHaveLength(0)
})

test('selected document and every field remain byte-equal through unknown then rejected retries', async ({ page }) => {
  await openForm(page); await choose(page)
  await page.locator('[name=descriptions]').fill('Repair cover\nReinspect slab')
  await page.locator('[name=trade]').fill('Concrete')
  await page.locator('[name=location]').fill('North slab')
  await page.locator('[name=priority]').selectOption('high')
  await page.locator('[name=dueDate]').fill('2026-10-01')
  await page.locator('[name=assignedToText]').fill('Site subcontractor')
  await page.getByRole('button', { name: 'Create punchlist items', exact: true }).click()
  await countCommands(1)
  const original = JSON.stringify(commands[0])
  expect(Object.fromEntries(commands[0]!.fields)).toMatchObject({ projectId: PROJECT, entryId: ENTRY, planDocumentId: document(1).id, descriptions: 'Repair cover\nReinspect slab', trade: 'Concrete', location: 'North slab', priority: 'high', dueDate: '2026-10-01', assignedToText: 'Site subcontractor' })
  expect(Object.fromEntries(commands[0]!.fields).clientRequestId).toMatch(/^[\da-f-]{36}$/)
  expect(commands[0]!.owner).toEqual({ actorId: ACTOR, tenantId: TENANT })
  answer(0, { ok: false, outcome: 'unknown', error: 'Connection uncertain.' })
  await expect(page.getByRole('alert')).toContainText('Connection uncertain')
  for (const name of ['descriptions', 'trade', 'location', 'priority', 'dueDate', 'assignedToText']) await expect(page.locator(`[name=${name}]`)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry same handoff' }).dblclick()
  await countCommands(2)
  expect(JSON.stringify(commands[1])).toBe(original)
  answer(1, { ok: false, outcome: 'rejected', error: 'Later rejection.' })
  await expect(page.getByRole('alert')).toContainText('Later rejection')
  await expect(page.getByRole('button', { name: 'Review and edit rejected request' })).toHaveCount(0)
  await expect(page.locator('[name=descriptions]')).toBeDisabled()
  await page.getByRole('button', { name: 'Retry same handoff' }).click()
  await countCommands(3); expect(JSON.stringify(commands[2])).toBe(original)
  confirm(2, { refreshWarning: 'Refresh unavailable; confirmation retained.' })
  await expect(page.getByText('Punchlist handoff confirmed.', { exact: true })).toBeVisible()
  await expect(page.getByText('Refresh unavailable; confirmation retained.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry same handoff' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create punchlist items', exact: true })).toHaveCount(0)
})

test('only an initially known rejection permits explicit review with a new key', async ({ page }) => {
  await openForm(page)
  await page.getByRole('button', { name: 'Create punchlist items', exact: true }).click(); await countCommands(1)
  answer(0, { ok: false, outcome: 'rejected', error: 'Review correction.' })
  await page.getByRole('button', { name: 'Review and edit rejected request' }).click()
  await expect(page.locator('[name=descriptions]')).toBeEnabled()
  await page.locator('[name=descriptions]').fill('Reviewed correction')
  await page.getByRole('button', { name: 'Create punchlist items', exact: true }).click(); await countCommands(2)
  expect(Object.fromEntries(commands[1]!.fields).clientRequestId).not.toBe(Object.fromEntries(commands[0]!.fields).clientRequestId)
  confirm(1); await expect(page.getByText('Punchlist handoff confirmed.', { exact: true })).toBeVisible()
})

test('malformed and owner-mismatched receipts never release the frozen request', async ({ page }) => {
  await openForm(page)
  await page.getByRole('button', { name: 'Create punchlist items', exact: true }).click(); await countCommands(1)
  confirm(0, { unexpected: true })
  await expect(page.getByRole('alert')).toContainText('could not be confirmed')
  await page.getByRole('button', { name: 'Retry same handoff' }).click(); await countCommands(2)
  const fields = Object.fromEntries(commands[1]!.fields)
  confirm(1, { receipt: { projectId: PROJECT, entryId: ENTRY, clientRequestId: fields.clientRequestId, actorId: OTHER, tenantId: TENANT } })
  await page.waitForFunction(() => (window as unknown as { __qualityResolved?: number }).__qualityResolved === 2)
  await expect(page.getByRole('alert')).toContainText('could not be confirmed')
  await expect(page.locator('[name=descriptions]')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Review and edit rejected request' })).toHaveCount(0)
  expect(commands[1]).toEqual(commands[0])
})

for (const field of ['actorId', 'projectId', 'entryId'] as const) test(`late confirmation cannot alter a new ${field} scope`, async ({ page }) => {
  await openForm(page)
  await page.getByRole('button', { name: 'Create punchlist items', exact: true }).click(); await countCommands(1)
  await mount(page, { [field]: OTHER })
  await openForm(page)
  await page.locator('[name=descriptions]').fill('New scope draft')
  confirm(0)
  await page.waitForFunction(() => (window as unknown as { __qualityResolved?: number }).__qualityResolved === 1)
  await expect(page.locator('[name=descriptions]')).toHaveValue('New scope draft')
  await expect(page.locator('[name=descriptions]')).toBeEnabled()
  await expect(page.getByText('Punchlist handoff confirmed.', { exact: true })).toHaveCount(0)
  expect(commands).toHaveLength(1)
})

test('keyboard selection and production layout work at four widths', async ({ page }) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(origin); await openForm(page)
    const chooser = page.getByRole('button', { name: 'Choose project document' })
    await chooser.focus(); await page.keyboard.press('Enter')
    const selection = page.getByRole('button', { name: 'Select Plan 01.pdf' })
    await selection.focus(); await page.keyboard.press('Enter')
    await expect(page.locator('input[name=planDocumentId]')).toHaveValue(document(1).id)
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByText(document(25).fileName, { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(tmpdir(), `erp-quality-document-picker-${width}.png`) })
    await page.getByRole('button', { name: 'Close document chooser' }).click()
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: join(tmpdir(), `erp-quality-document-${width}.png`) })
  }
})
