import { expect, test } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'

let directory = '', url = ''
let vite: import('vite').ViteDevServer | undefined
const scope = { opportunityId: '11111111-1111-4111-8111-111111111111', inspectionId: '22222222-2222-4222-8222-222222222222', actorId: '33333333-3333-4333-8333-333333333333', tenantId: '44444444-4444-4444-8444-444444444444' }
test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  directory = resolve(await mkdtemp(join(tmpdir(), 'erp-report-repair-')))
  const actions = join(directory, 'actions.ts'), navigation = join(directory, 'navigation.ts')
  await writeFile(actions, `export async function repairInspectionReport(opportunityId, inspectionId, owner) {const r=await fetch('/__repair',{method:'POST',body:JSON.stringify({opportunityId,inspectionId,owner})});return r.json()}`)
  await writeFile(navigation, `export function useRouter(){return {refresh(){window.__refreshes=(window.__refreshes||0)+1}}}`)
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(join(directory, 'harness.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import ${JSON.stringify(join(process.cwd(), 'src/app/globals.css'))};import {InspectionReportRepair} from ${JSON.stringify(join(process.cwd(), 'src/components/proposal/inspection-report-repair.tsx'))};createRoot(document.getElementById('root')).render(<main style={{padding:16}}><InspectionReportRepair {...${JSON.stringify(scope)}}/></main>)`)
  vite = await createServer({ root: directory, configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), directory] } }, resolve: { alias: [
    { find: 'react', replacement: join(process.cwd(), 'node_modules/react') },
    { find: 'react-dom', replacement: join(process.cwd(), 'node_modules/react-dom') },
    { find: 'next/navigation', replacement: navigation },
    { find: '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', replacement: actions },
    { find: '@', replacement: join(process.cwd(), 'src') },
  ] } })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Missing local harness listener')
  url = `http://127.0.0.1:${address.port}`
})
test.afterAll(async () => {
  await vite?.close()
  if (directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('erp-report-repair-')) {
    const { rm } = await import('node:fs/promises'); await rm(directory, { recursive: true, force: true })
  }
})

// Production React and CSS; only action/network and navigation are controlled.
for (const width of [320, 768, 1024, 1440]) {
  test(`repair retries safely with keyboard and no overflow at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    const calls: unknown[] = []
    await page.route('**/__repair', async route => {
      calls.push(JSON.parse(route.request().postData()!))
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(calls.length === 1 ? { ok: false, error: 'Archive unavailable. Retry this report.' } : { ok: true, documentId: scope.inspectionId, refreshFailed: false }) })
    })
    await page.goto(url)
    const retry = page.getByRole('button', { name: 'Retry report archive' })
    await retry.focus(); await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('Archive unavailable')
    if (width === 320) await page.screenshot({ path: testInfo.outputPath('repair-error-mobile.png') })
    await retry.click()
    await expect(page.getByRole('status')).toContainText('Report archived')
    await expect(page.getByRole('link', { name: 'Download archived HTML' })).toHaveAttribute('href', `/api/documents/${scope.inspectionId}?download=1`)
    expect(calls).toEqual(Array.from({ length: 2 }, () => ({ opportunityId: scope.opportunityId, inspectionId: scope.inspectionId, owner: { actorId: scope.actorId, tenantId: scope.tenantId } })))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('pending repair prevents duplicate clicks and an uncertain response remains retryable', async ({ page }) => {
  let calls = 0, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/__repair', async route => { calls++; await gate; await route.abort('failed') })
  await page.goto(url)
  await page.getByRole('button', { name: 'Retry report archive' }).click()
  await expect(page.getByRole('button', { name: 'Archiving report…' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Inspection report archive' })).toHaveAttribute('aria-busy', 'true')
  expect(calls).toBe(1)
  release()
  await expect(page.getByRole('alert')).toContainText('outcome is unconfirmed')
  await expect(page.getByRole('button', { name: 'Retry report archive' })).toBeEnabled()
})
