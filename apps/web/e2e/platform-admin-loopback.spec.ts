import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const CONTROLLED_UPLOAD = resolve(
  __dirname,
  '..',
  'public',
  'samples',
  'mep-sample.dxf'
)
const CONTROLLED_UPLOAD_FILE = {
  name: 'browser-controlled-upload.dxf',
  mimeType: 'application/dxf',
  buffer: readFileSync(CONTROLLED_UPLOAD),
}

async function login(page: Page, email = 'owner@independent.example.invalid') {
  await page.goto('/auth/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

const consolePages = [
  ['', 'Platform overview'], ['tenants', 'Tenants'], ['users', 'Users'],
  ['roles', 'Roles'], ['analytics', 'Analytics'], ['audit', 'Platform audit'],
  ['integrations', 'Integrations'], ['system-health', 'System health'],
] as const

test('owner console renders all pages without horizontal viewport overflow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page)
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [path, title] of consolePages) {
      await page.goto(`/platform-admin${path ? `/${path}` : ''}`)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      await expect(page.getByText('Platform data unavailable', { exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  }
  expect(errors).toEqual([])
})

test('support context is explicit, bounded, ends, and leaves audit evidence', async ({ page }) => {
  let commandPosts = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/platform-admin/submit') commandPosts++
  })
  await login(page)
  await page.goto('/platform-admin/tenants')
  const customer = page.getByRole('row').filter({ hasText: 'Browser customer fixture' })
  await customer.getByLabel('Support reason for Browser customer fixture', { exact: true }).fill('Browser regression support review')
  await customer.getByLabel('Duration', { exact: true }).evaluate((select) => {
    if (!(select instanceof HTMLSelectElement)) throw new Error('Duration control is not a select')
    const option = document.createElement('option')
    option.value = '4'
    option.textContent = 'Invalid fixture duration'
    select.append(option)
    select.value = option.value
  })
  await customer.getByRole('button', { name: 'Enter', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'A tenant, reason, and valid duration are required.' })).toBeVisible()
  await customer.getByLabel('Support reason for Browser customer fixture', { exact: true }).fill('Browser regression support review')
  await customer.getByLabel('Duration', { exact: true }).selectOption('30')
  await customer.getByRole('button', { name: 'Enter', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Support context started.' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'A tenant, reason, and valid duration are required.' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Platform Support Mode' })).toContainText('Browser customer fixture')
  const supportCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'erp-platform-support')
  expect(supportCookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/platform-admin' })
  expect(supportCookie?.expires).toBeGreaterThan(Date.now() / 1000)
  await customer.getByLabel('Lifecycle for Browser customer fixture', { exact: true }).selectOption('suspended')
  await customer.getByLabel('Status reason for Browser customer fixture', { exact: true }).fill('Browser lifecycle regression')
  const beforeCancelledChange = commandPosts
  page.once('dialog', (dialog) => dialog.dismiss())
  await customer.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(customer.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
  expect(commandPosts).toBe(beforeCancelledChange)
  page.on('dialog', (dialog) => dialog.accept())
  await customer.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Tenant lifecycle updated.' })).toBeVisible()
  await expect(customer.locator('td').nth(1).getByText('suspended', { exact: true })).toBeVisible()
  await customer.getByLabel('Lifecycle for Browser customer fixture', { exact: true }).selectOption('active')
  await customer.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Tenant lifecycle updated.' })).toBeVisible()
  await expect(customer.locator('td').nth(1).getByText('active', { exact: true })).toBeVisible()
  await page.goto('/platform-admin')
  await expect(page.getByRole('heading', { name: 'Browser customer fixture', exact: true })).toBeVisible()
  await expect(page.getByText('Browser regression support review', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'End context', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Support context ended.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No tenant context is active' })).toBeVisible()
  expect((await page.context().cookies()).find((cookie) => cookie.name === 'erp-platform-support')).toBeUndefined()
  await page.goto('/platform-admin/audit')
  await expect(page.getByRole('table')).toContainText('support')
})

test('tenant admin is denied every console route', async ({ page }) => {
  await login(page, 'platform-admin-fixture@example.invalid')
  for (const [path] of consolePages) {
    const response = await page.goto(`/platform-admin${path ? `/${path}` : ''}`)
    expect(response?.status()).toBe(403)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This account does not have platform authority.')
  }
})

test('settings exposes the console only after server verification and saves tenant settings with audit', async ({ page }) => {
  await login(page)
  const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' })
  await primaryNavigation.getByRole('link', { name: 'Projects', exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Projects', exact: true })).toBeVisible()
  await primaryNavigation.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/settings')
  await expect(page.getByRole('link', { name: 'Open platform administration', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Workspace Name *', { exact: true })).toBeFocused()
  await page.getByLabel('Registered Legal Name', { exact: true }).fill('Synthetic ABI Demonstration Company')
  await page.getByLabel('Registered Address', { exact: true }).fill('Synthetic verification address')
  await page.getByLabel('BIR TIN', { exact: true }).fill('fixture-tax-id')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Workspace settings saved.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByText('fixture-tax-id', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic ABI Demonstration Company', { exact: true })).toBeVisible()
  const savedSettingsUrl = page.url()
  await page.goBack()
  await expect(page).toHaveURL(/\/settings$/)
  const editButton = page.getByRole('button', { name: 'Edit', exact: true })
  await expect(editButton.or(page.getByRole('button', { name: 'Save Changes', exact: true }))).toBeVisible()
  if (await editButton.isVisible()) await editButton.click()
  await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
  await page.goto(savedSettingsUrl)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('BIR TIN', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByText('fixture-tax-id', { exact: true })).toHaveCount(0)
  const audit = await page.request.get('http://127.0.0.1:4418/__fixture/settings-audit')
  expect((await audit.json()).count).toBe(2)
  await page.context().clearCookies()
  await login(page, 'platform-admin-fixture@example.invalid')
  await page.goto('/settings')
  await expect(page.getByRole('link', { name: 'Open platform administration', exact: true })).toHaveCount(0)
})

test('project entry points resolve to a real tenant project', async ({ page }) => {
  await login(page)
  const features = ['scope', 'cost', 'cost/budget', 'checklist', 'progress', 'billing', 'turnover', 'coc', 'comments', 'access', 'audit']
  for (const feature of features) {
    await page.goto(`/${feature}`)
    const row = page.getByRole('row').filter({ hasText: 'Browser selector fixture' })
    await expect(row).toBeVisible()
    await expect(row.getByRole('link')).toHaveAttribute('href', new RegExp(`^/projects/[0-9a-f-]+/${feature}$`))
    await expect(page.getByRole('alert').filter({ hasText: 'Projects unavailable' })).toHaveCount(0)
  }
})

test('legacy pipeline URLs retain their query and redirect permanently', async ({ page }) => {
  await login(page)
  for (const [legacy, canonical] of [['board', '/pipeline'], ['conversion', '/pipeline/list']]) {
    const response = await page.request.get(`/pipeline/${legacy}?q=fixture`, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(`${canonical}?q=fixture`)
  }
})

test('project documents offers only permitted actions with responsive empty states', async ({ page }) => {
  await login(page)
  await page.goto('/scope')
  const href = await page.getByRole('row').filter({ hasText: 'Browser selector fixture' }).getByRole('link').getAttribute('href')
  expect(href).toMatch(/^\/projects\/[0-9a-f-]+\/scope$/)
  const documentsPath = href!.replace(/\/scope$/, '/documents')
  for (const [email, operator] of [['owner@independent.example.invalid', true], ['platform-viewer-fixture@example.invalid', false]] as const) {
    await page.context().clearCookies()
    await login(page, email)
    for (const width of [1440, 768, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(documentsPath)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Browser selector fixture — Documents')
      await expect(page.getByText('No documents uploaded yet.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Upload file', exact: true })).toHaveCount(operator ? 1 : 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  }
})

test('Reports renders exact tenant-scoped totals with a working export and mobile table', async ({ page }) => {
  await login(page)
  const seeded = await page.request.post('http://127.0.0.1:4418/__fixture/reports')
  expect(seeded.ok()).toBe(true)
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Scoping' })).toContainText('₱1,234.56')
    await expect(page.getByText('₱9,999.99', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  const exportLink = page.getByRole('link', { name: 'Export pipeline CSV', exact: true })
  await expect(exportLink).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportLink.click(),
  ])
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const csv = readFileSync(downloadPath!, 'utf8')
  expect(csv).toContain('Browser selector fixture')
  expect(csv).not.toContain('Other report fixture')
})

test('platform operational analytics displays real cross-tenant metadata and failed jobs', async ({ page }) => {
  await login(page)
  expect((await page.request.post('http://127.0.0.1:4418/__fixture/reports')).ok()).toBe(true)
  expect((await page.request.post('http://127.0.0.1:4418/__fixture/operations')).ok()).toBe(true)
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/platform-admin/analytics')
    const metrics = page.getByRole('region', { name: 'Persisted operational counts' })
    for (const [label, value] of [['Documents', '2'], ['Recorded document bytes', '600'], ['Failed document jobs', '1']] as const) {
      await expect(metrics.locator('article').filter({ has: page.getByText(label, { exact: true }) }).locator('strong')).toHaveText(value)
    }
    // Next's route announcer is an empty alert outside main, not an application error.
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})

test('controlled document upload completes through Core and shows quota denial', async ({ page }) => {
  await login(page)
  await page.goto('/scope')
  const href = await page.getByRole('row').filter({ hasText: 'Browser selector fixture' }).getByRole('link').getAttribute('href')
  expect(href).toMatch(/^\/projects\/[0-9a-f-]+\/scope$/)
  await page.goto(href!.replace(/\/scope$/, '/documents'))
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('documents-upload-trigger')).toBeEnabled()

  const signResponse = page.waitForResponse((response) =>
    response.url().includes('/api/upload/sign') &&
    response.request().method() === 'POST'
  )
  const rawUploadResponse = page.waitForResponse((response) =>
    /\/v1\/document-uploads\/[0-9a-f-]+\/content$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'PUT'
  )
  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/upload/complete') &&
    response.request().method() === 'POST'
  )
  await page.getByTestId('documents-file-input').setInputFiles(CONTROLLED_UPLOAD_FILE)
  expect((await signResponse).status()).toBe(200)
  expect((await rawUploadResponse).status()).toBe(200)
  expect((await uploadResponse).status()).toBe(200)
  await expect(page.getByRole('status')).toContainText(/DXF: \d+ scope items? extracted/)
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)

  const stateResponse = await page.request.get('http://127.0.0.1:4418/__fixture/document-upload-state')
  expect(stateResponse.ok()).toBe(true)
  const state = await stateResponse.json() as {
    reservation: { state: string; document_id: string; storage_path: string; declared_size_bytes: number }
    document: { id: string; file_name: string; storage_path: string; size_bytes: number }
    auditCount: number
    storageWrites: Array<{ storagePath: string; bytes: number }>
  }
  expect(state.reservation).toMatchObject({
    state: 'completed',
    document_id: state.document.id,
    storage_path: state.document.storage_path,
    declared_size_bytes: state.document.size_bytes,
  })
  expect(state.document.file_name).toBe('browser-controlled-upload.dxf')
  expect(state.storageWrites).toEqual([
    { storagePath: state.document.storage_path, bytes: state.document.size_bytes },
  ])
  expect(state.auditCount).toBeGreaterThanOrEqual(3)

  const quota = await page.request.post('http://127.0.0.1:4418/__fixture/document-upload-quota')
  expect(quota.ok()).toBe(true)
  await page.getByTestId('documents-file-input').setInputFiles(CONTROLLED_UPLOAD_FILE)
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Project storage quota exceeded')
  const afterQuota = await page.request.get('http://127.0.0.1:4418/__fixture/document-upload-state')
  expect((await afterQuota.json()).storageWrites).toHaveLength(1)
})
