import { expect, test } from '@playwright/test'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'

type RoleRequest = {
  user_id: string
  role: string
  expected_role: string
  client_request_id: string
}

type RoleResponse =
  | { ok: true; role: string }
  | { ok: false; error: string; outcome: 'rejected' | 'unknown' }

type RoleResolution =
  | RoleResponse
  | { ok: true; role?: string }
  | { ok: false; error?: string; outcome?: 'rejected' | 'unknown' }

type BrowserBridge = {
  roleRequests: RoleRequest[]
  rolePending: Array<{ resolve: (response: RoleResolution) => void }>
  refreshes: number
  throwOnRefresh: boolean
  resolveRole: (response: RoleResolution) => void
  mount: (userId: string, currentRole: string) => void
}

type BrowserBridgeSnapshot = {
  roleRequests: RoleRequest[]
  refreshes: number
}

function requireRoleRequest(request: RoleRequest | undefined): RoleRequest {
  if (!request) throw new Error('Role harness did not record the expected request')
  return request
}

let harnessDirectory = ''
let harnessDirectoryIsSafe = false
let harnessUrl = ''
let vite: import('vite').ViteDevServer | undefined

test.describe.configure({ mode: 'serial' })

async function waitForRoleRequests(
  page: import('@playwright/test').Page,
  count: number,
): Promise<void> {
  await page.waitForFunction((expectedCount) => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    return bridge.roleRequests.length >= expectedCount
  }, count)
}

async function resolveRole(
  page: import('@playwright/test').Page,
  response: RoleResolution,
): Promise<void> {
  await page.evaluate((value) => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    bridge.resolveRole(value)
  }, response)
}

async function bridgeSnapshot(
  page: import('@playwright/test').Page,
): Promise<BrowserBridgeSnapshot> {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    return {
      roleRequests: bridge.roleRequests,
      refreshes: bridge.refreshes,
    }
  })
}

test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')

  const temporaryRoot = resolve(tmpdir())
  const harnessPrefix = 'erp-user-role-'
  harnessDirectory = await mkdtemp(join(temporaryRoot, harnessPrefix))
  const resolvedHarnessDirectory = resolve(harnessDirectory)
  if (
    !resolvedHarnessDirectory.startsWith(`${temporaryRoot}${sep}`) ||
    !basename(resolvedHarnessDirectory).startsWith(harnessPrefix)
  ) {
    await rm(resolvedHarnessDirectory, { recursive: true, force: true })
    throw new Error('Refusing to use an unexpected browser harness directory')
  }
  harnessDirectory = resolvedHarnessDirectory
  harnessDirectoryIsSafe = true

  const componentPath = join(
    process.cwd(),
    'src',
    'components',
    'admin',
    'manage-user-panel.tsx',
  )
  const rolesPath = join(
    process.cwd(),
    'src',
    'app',
    '(dashboard)',
    'admin',
    'users',
    'roles.ts',
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
    `type RoleRequest = {
  user_id: string
  role: string
  expected_role: string
  client_request_id: string
}
type RoleResponse = { ok: true; role: string } | { ok: false; error: string; outcome: 'rejected' | 'unknown' }
type RoleResolution = RoleResponse | { ok: true; role?: string } | { ok: false; error?: string; outcome?: 'rejected' | 'unknown' }
type Bridge = {
  roleRequests: RoleRequest[]
  rolePending: Array<{ resolve: (response: RoleResolution) => void }>
  refreshes: number
  throwOnRefresh: boolean
  resolveRole: (response: RoleResolution) => void
  mount: (userId: string, currentRole: string) => void
}
const globalState = globalThis as unknown as { __userRoleTest?: Bridge }
const bridge: Bridge = globalState.__userRoleTest ?? {
  roleRequests: [],
  rolePending: [],
  refreshes: 0,
  throwOnRefresh: false,
  resolveRole(response: RoleResolution) { bridge.rolePending.shift()?.resolve(response) },
  mount: (_userId: string, _currentRole: string) => {},
}
globalState.__userRoleTest = bridge
export function updateUserRole(formData: FormData): Promise<RoleResponse> {
  bridge.roleRequests.push({
    user_id: String(formData.get('user_id') ?? ''),
    role: String(formData.get('role') ?? ''),
    expected_role: String(formData.get('expected_role') ?? ''),
    client_request_id: String(formData.get('client_request_id') ?? ''),
  })
  return new Promise((resolve) => bridge.rolePending.push({ resolve }))
}
export async function resetUserPassword(): Promise<{ error?: string }> {
  throw new Error('Password reset is outside this credential-free role harness')
}
export async function deleteUser(): Promise<{ error?: string }> {
  throw new Error('User deletion is outside this credential-free role harness')
}
`,
  )
  await writeFile(
    navigationPath,
    `export function useRouter() {
  return { refresh() {
    const state = globalThis as unknown as { __userRoleTest: { refreshes: number; throwOnRefresh: boolean } }
    if (state.__userRoleTest.throwOnRefresh) throw new Error('refresh failed')
    state.__userRoleTest.refreshes += 1
  } }
}
`,
  )
  await writeFile(
    join(harnessDirectory, 'harness.tsx'),
    `import ${JSON.stringify(globalsPath)}
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ManageUserPanel } from ${JSON.stringify(componentPath)}
const root = createRoot(document.getElementById('root')!)
const state = (globalThis as unknown as { __userRoleTest: { mount: (userId: string, currentRole: string) => void } }).__userRoleTest
state.mount = (userId: string, currentRole: string) => root.render(
  <main style={{ maxWidth: 680, margin: '0 auto', padding: 16 }}>
    <div className="card">
      <div className="card-header"><h2 className="card-title">Manage</h2></div>
      <div style={{ padding: 16 }}>
        <ManageUserPanel
          userId={userId}
          currentRole={currentRole}
          email="credential-free@example.test"
          isSelf={false}
        />
      </div>
    </div>
  </main>,
)
state.mount(${JSON.stringify(USER_ID)}, 'viewer')
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
          find: '@/app/(dashboard)/admin/users/actions',
          replacement: actionsPath,
        },
        {
          find: '@/app/(dashboard)/admin/users/roles',
          replacement: rolesPath,
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
  await expect(page.locator('#admin-user-role-select')).toBeVisible()
})

test('freezes exact role command through uncertain retry and handles known rejection', async ({
  page,
}) => {
  const selector = page.getByRole('combobox', { name: 'Assign role' })
  const saveButton = page.getByRole('button', { name: 'Save role' })

  await selector.selectOption('pm')
  await saveButton.click()
  await waitForRoleRequests(page, 1)
  const firstRequest = requireRoleRequest((await bridgeSnapshot(page)).roleRequests[0])
  expect(firstRequest).toMatchObject({
    user_id: USER_ID,
    role: 'pm',
    expected_role: 'viewer',
  })
  expect(firstRequest.client_request_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  await expect(selector).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Saving role')

  await resolveRole(page, {
    ok: false,
    error: 'Role change outcome could not be confirmed. Retry the same request.',
    outcome: 'unknown',
  })
  await expect(page.getByRole('alert')).toContainText('outcome could not be confirmed')
  await expect(selector).toBeDisabled()

  // A server refresh may show a newer current role while Core's outcome is
  // unresolved. The original selection and id remain the retry command.
  await page.evaluate((userId) => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    bridge.mount(userId, 'sales')
  }, USER_ID)
  await expect(selector).toHaveValue('pm')
  await expect(page.locator('input[name="expected_role"]')).toHaveValue('viewer')
  await expect(page.locator('input[name="client_request_id"]')).toHaveValue(
    firstRequest.client_request_id,
  )

  await page.getByRole('button', { name: 'Retry same role change' }).click()
  await waitForRoleRequests(page, 2)
  const secondRequest = (await bridgeSnapshot(page)).roleRequests[1]
  expect(secondRequest).toEqual(firstRequest)

  await resolveRole(page, {
    ok: false,
    error: 'The role changed after this form was opened.',
    outcome: 'rejected',
  })
  await expect(selector).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('changed after this form')

  // A rejected replay remains uncertain; only the exact command's confirmed
  // success releases the editor and permits a new intent.
  await page.getByRole('button', { name: 'Retry same role change' }).click()
  await waitForRoleRequests(page, 3)
  const thirdRequest = requireRoleRequest((await bridgeSnapshot(page)).roleRequests[2])
  expect(thirdRequest).toEqual(firstRequest)
  await resolveRole(page, { ok: true, role: 'pm' })
  await expect(page.getByRole('status')).toHaveText('Role updated.')
  await expect(selector).toBeEnabled()
  await expect(selector).toHaveValue('pm')
  await expect.poll(async () => (await bridgeSnapshot(page)).refreshes).toBe(1)
})

test('allows explicit review after an initial known rejection', async ({ page }) => {
  const selector = page.getByRole('combobox', { name: 'Assign role' })
  await selector.selectOption('pm')
  await page.getByRole('button', { name: 'Save role' }).click()
  await waitForRoleRequests(page, 1)
  await resolveRole(page, {
    ok: false,
    error: 'The role changed after this form was opened.',
    outcome: 'rejected',
  })
  await expect(selector).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Refresh and review role' })).toBeVisible()

  await page.getByRole('button', { name: 'Refresh and review role' }).click()
  await expect.poll(async () => (await bridgeSnapshot(page)).refreshes).toBe(1)
  await expect(selector).toHaveValue('viewer')
  await expect(page.locator('input[name="expected_role"]')).toHaveValue('viewer')

  // A later server refresh can provide the now-current role. The explicit
  // review has cleared the rejected intent, so this is a fresh expected role.
  await page.evaluate((userId) => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    bridge.mount(userId, 'sales')
  }, USER_ID)
  await expect(selector).toHaveValue('sales')
  await selector.selectOption('finance')
  await page.getByRole('button', { name: 'Save role' }).click()
  await waitForRoleRequests(page, 2)
  const nextRequest = requireRoleRequest((await bridgeSnapshot(page)).roleRequests[1])
  expect(nextRequest).toMatchObject({
    user_id: USER_ID,
    role: 'finance',
    expected_role: 'sales',
  })
  await resolveRole(page, { ok: true, role: 'finance' })
  await expect(page.getByRole('status')).toHaveText('Role updated.')
})

test('treats malformed or mismatched success responses as unknown', async ({ page }) => {
  const selector = page.getByRole('combobox', { name: 'Assign role' })
  await selector.selectOption('pm')
  await page.getByRole('button', { name: 'Save role' }).click()
  await waitForRoleRequests(page, 1)
  const firstRequest = requireRoleRequest((await bridgeSnapshot(page)).roleRequests[0])

  await resolveRole(page, { ok: false, error: 'Malformed response' })
  await expect(page.getByRole('alert')).toContainText('outcome could not be confirmed')
  await expect(selector).toBeDisabled()

  await page.getByRole('button', { name: 'Retry same role change' }).click()
  await waitForRoleRequests(page, 2)
  expect((await bridgeSnapshot(page)).roleRequests[1]).toEqual(firstRequest)

  await resolveRole(page, { ok: true, role: 'sales' })
  await expect(page.getByRole('alert')).toContainText('outcome could not be confirmed')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(selector).toBeDisabled()

  await page.getByRole('button', { name: 'Retry same role change' }).click()
  await waitForRoleRequests(page, 3)
  expect((await bridgeSnapshot(page)).roleRequests[2]).toEqual(firstRequest)
  await resolveRole(page, { ok: true, role: 'pm' })
  await expect(page.getByRole('status')).toHaveText('Role updated.')
})

test('keeps a confirmed commit distinct from a refresh failure', async ({ page }) => {
  const selector = page.getByRole('combobox', { name: 'Assign role' })
  await selector.selectOption('pm')
  await page.getByRole('button', { name: 'Save role' }).click()
  await waitForRoleRequests(page, 1)
  await page.evaluate(() => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    bridge.throwOnRefresh = true
  })
  await resolveRole(page, { ok: true, role: 'pm' })

  await expect(page.getByRole('status')).toHaveText('Role updated.')
  await expect(page.getByRole('alert')).toContainText('could not refresh')
  await expect(page.getByRole('button', { name: 'Retry same role change' })).toHaveCount(0)
  await expect(selector).toBeEnabled()
})

test('ignores an old role response after the user scope changes', async ({ page }) => {
  const selector = page.getByRole('combobox', { name: 'Assign role' })
  await selector.selectOption('pm')
  await page.getByRole('button', { name: 'Save role' }).click()
  await waitForRoleRequests(page, 1)

  await page.evaluate((scope) => {
    const bridge = (window as unknown as { __userRoleTest: BrowserBridge })
      .__userRoleTest
    bridge.mount(scope.userId, scope.currentRole)
  }, { userId: OTHER_USER_ID, currentRole: 'admin' })
  await expect(selector).toHaveValue('admin')

  await resolveRole(page, { ok: true, role: 'pm' })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(selector).toHaveValue('admin')
  await expect.poll(async () => (await bridgeSnapshot(page)).refreshes).toBe(0)
})

test('keeps the role editor readable and keyboard reachable at supported widths', async ({
  page,
}) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(harnessUrl)
    const selector = page.getByRole('combobox', { name: 'Assign role' })
    await expect(selector).toBeVisible()
    await selector.focus()
    await expect(selector).toBeFocused()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    await expect(selector).toHaveValue('sales')
    await page.screenshot({ path: join(tmpdir(), `erp-user-role-${width}.png`), fullPage: true })
    const dimensions = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  }
})
