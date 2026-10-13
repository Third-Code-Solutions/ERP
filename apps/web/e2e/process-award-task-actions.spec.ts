import { expect, test } from '@playwright/test'
import { basename, join, resolve, sep } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

let directory = ''
let url = ''
let server: import('vite').ViteDevServer | undefined
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  directory = resolve(await mkdtemp(join(tmpdir(), 'erp-process-award-')))
  const component = join(process.cwd(), 'src/app/(dashboard)/process/process-task-actions.tsx')
  const actions = join(directory, 'actions.ts')
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(actions, `
export async function completeAwardTask(form: FormData) {
  if (form.get('taskId') === 'failure') throw new Error('private network details')
  if (form.get('taskId') === 'blocked') return { ok: false, error: 'Task is blocked awaiting NTP' }
  return { ok: true }
}
export async function updateProcessTaskStatus() { return { ok: false, error: 'Generic action invoked' } }
`)
  await writeFile(join(directory, 'harness.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ProcessTaskActions } from ${JSON.stringify(component)}
const query = new URLSearchParams(location.search)
createRoot(document.getElementById('root')!).render(<ProcessTaskActions
  taskId={query.get('id') ?? 'award'} status={query.get('status') ?? 'in_progress'}
  awardParticipant={query.get('manager') !== 'true'} blockedReason={query.get('reason')} />)
`)
  server = await createServer({
    root: directory, configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), directory] } },
    resolve: { alias: [
      { find: 'react', replacement: join(process.cwd(), 'node_modules/react') },
      { find: 'react-dom', replacement: join(process.cwd(), 'node_modules/react-dom') },
      { find: './actions', replacement: actions },
    ] },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('No component harness port')
  url = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
  if (directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('erp-process-award-')) {
    await rm(directory, { recursive: true, force: true })
  }
})

test('participant completes through the scoped action using keyboard', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByRole('button')).toHaveCount(1)
  await page.getByRole('button', { name: 'Complete' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Updated')
})

for (const query of ['status=blocked&reason=Awaiting+NTP', 'status=in_progress&reason=Awaiting+NTP', 'status=pending', 'status=completed', 'status=cancelled']) {
  test(`participant has no actions for ${query}`, async ({ page }) => {
    await page.goto(`${url}?${query}`)
    await expect(page.getByText('No actions')).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)
  })
}

test('manager keeps generic transitions', async ({ page }) => {
  await page.goto(`${url}?manager=true`)
  await expect(page.getByRole('button', { name: 'Block', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Complete' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
})

test('Core rejection and network errors stay visible without false success', async ({ page }) => {
  await page.goto(`${url}?id=blocked`)
  await page.getByRole('button', { name: 'Complete' }).click()
  await expect(page.getByRole('alert')).toHaveText('Task is blocked awaiting NTP')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.goto(`${url}?id=failure`)
  await page.getByRole('button', { name: 'Complete' }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to confirm')
  await expect(page.getByRole('alert')).not.toContainText('private network details')
  await expect(page.getByRole('status')).toHaveCount(0)
})
