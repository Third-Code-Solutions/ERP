import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const enabled = process.env.E2E_AWARD_TASK_INTEGRATED_LOCAL === '1'
test.skip(!enabled, 'Run only against the disposable local Supabase, Core, and Web stack.')
test.describe.configure({ mode: 'serial' })

type Role = 'finance' | 'cx' | 'viewer' | 'pm'
type Identity = { id: string; email: string; password: string }
type Fixture = {
  tenantId: string
  finance: Identity
  cx: Identity
  viewer: Identity
  pm: Identity
  foreignFinance: Identity
  projectId: string
  financeTaskId: string
  cxTaskId: string
  trackerTaskId: string
  foreignTaskId: string
  handoffId: string
  foreignHandoffId: string
}

let fixture: Fixture
let readTaskStatus: (taskId: string) => Promise<string | undefined>
let readClock: (taskId: string) => Promise<{ status: string; startedAt: string; targetValue: number } | undefined>
type FixtureRow = Record<string, string | number | boolean | null | object>
type InsertFixture = (table: string, values: FixtureRow | FixtureRow[]) => Promise<void>
type SqlClient = {
  unsafe: (statement: string, parameters?: readonly unknown[]) => Promise<unknown[]>
  json: (value: object) => unknown
  end: () => Promise<void>
}
let fixtureSql: SqlClient | undefined

function requireLocalEnvironment(): {
  supabaseUrl: string
  anonKey: string
  serviceKey: string
} {
  const dbUrl = new URL(process.env.DATABASE_URL ?? '')
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  const webUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? '')
  const coreUrl = new URL(process.env.ERP_CORE_API_URL ?? '')
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (
    ![dbUrl, supabaseUrl, webUrl, coreUrl].every((url) => loopback.has(url.hostname)) ||
    dbUrl.port !== process.env.E2E_AWARD_TASK_DISPOSABLE_DB_PORT ||
    supabaseUrl.port !== process.env.E2E_AWARD_TASK_DISPOSABLE_AUTH_PORT ||
    !dbUrl.port || !supabaseUrl.port
  ) {
    throw new Error('Award task browser proof requires explicitly named disposable loopback services.')
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!anonKey || !serviceKey) throw new Error('Local Supabase credentials are missing.')
  return { supabaseUrl: supabaseUrl.toString().replace(/\/$/, ''), anonKey, serviceKey }
}

async function createIdentity(
  createUser: (email: string, password: string) => Promise<string>,
  role: Role,
  prefix: string
): Promise<Identity> {
  const email = `award-browser-${prefix}-${role}-${randomUUID()}@example.test`
  const password = `${randomBytes(24).toString('hex')}Aa1!`
  return { id: await createUser(email, password), email, password }
}

async function createAward(
  insert: InsertFixture,
  tenantId: string,
  finance: Identity,
  cx: Identity
): Promise<{ financeTaskId: string; cxTaskId: string; trackerTaskId: string; handoffId: string; projectId: string }> {
  const projectId = randomUUID()
  const bomId = randomUUID()
  const budgetId = randomUUID()
  const invoiceId = randomUUID()
  const trackerId = randomUUID()
  const handoffId = randomUUID()
  const financeTaskId = randomUUID()
  const cxTaskId = randomUUID()
  const dpTaskId = randomUUID()
  const cariTaskId = randomUUID()
  const trackerTaskId = randomUUID()
  const financeStepId = randomUUID()
  const cxStepId = randomUUID()
  const dpStepId = randomUUID()
  const cariStepId = randomUUID()
  const trackerStepId = randomUUID()
    await insert('projects', { id: projectId, tenant_id: tenantId, name: 'Synthetic browser award project', client: 'Synthetic', created_by: finance.id })
    await insert('boms', { id: bomId, tenant_id: tenantId, project_id: projectId, created_by: finance.id, status: 'locked' })
    await insert('project_budgets', { id: budgetId, tenant_id: tenantId, project_id: projectId, source_bom_id: bomId, revision: 1, status: 'draft', effective_from: '2026-09-28', revision_reason: 'Synthetic browser proof', created_by: finance.id })
    await insert('invoices', { id: invoiceId, tenant_id: tenantId, project_id: projectId, created_by: finance.id, invoice_number: `SYN-${invoiceId}`, status: 'draft' })
    await insert('master_schedules', { id: trackerId, tenant_id: tenantId, project_id: projectId, name: 'Synthetic browser tracker', tasks: {}, imported_by: finance.id })
    await insert('process_steps', [
      { id: financeStepId, tenant_id: tenantId, code: 'AWARD.AR_PROJECT_CODE', stage: 'award', name: 'AR project code', responsible_bu: 'Finance', input: 'Signed BOM', input_from: 'Commercial', output: 'Project code', output_by: 'Finance', sla_days: 2 },
      { id: dpStepId, tenant_id: tenantId, code: 'AWARD.DP_INVOICE', stage: 'award', name: 'Down payment invoice', responsible_bu: 'Finance', input: 'Signed BOM', input_from: 'Commercial', output: 'Draft invoice', output_by: 'Finance', sla_days: 2 },
      { id: cariStepId, tenant_id: tenantId, code: 'AWARD.CARI', stage: 'award', name: 'CARI', responsible_bu: 'Finance', input: 'Signed BOM', input_from: 'Commercial', output: 'CARI task', output_by: 'Finance', sla_days: 2 },
      { id: trackerStepId, tenant_id: tenantId, code: 'AWARD.PROJECT_TRACKER', stage: 'award', name: 'Project Tracker', responsible_bu: 'SD/PM/PE', input: 'Signed BOM', input_from: 'Commercial', output: 'Tracker', output_by: 'SD/PM/PE', sla_days: 2 },
      { id: cxStepId, tenant_id: tenantId, code: 'AWARD.CX_ONBOARDING', stage: 'award', name: 'CX onboarding', responsible_bu: 'CX', input: 'Signed BOM', input_from: 'Commercial', output: 'Onboarding', output_by: 'CX', sla_days: 7 },
    ])
    await insert('task_instances', [
      { id: financeTaskId, tenant_id: tenantId, process_step_id: financeStepId, subject_type: 'award_handoff', subject_id: handoffId, instance_key: `award:${handoffId}:arProjectCode`, status: 'in_progress', started_at: new Date().toISOString(), created_by: finance.id },
      { id: dpTaskId, tenant_id: tenantId, process_step_id: dpStepId, subject_type: 'award_handoff', subject_id: handoffId, instance_key: `award:${handoffId}:downPaymentInvoice`, status: 'in_progress', started_at: new Date().toISOString(), created_by: finance.id },
      { id: cariTaskId, tenant_id: tenantId, process_step_id: cariStepId, subject_type: 'award_handoff', subject_id: handoffId, instance_key: `award:${handoffId}:cari`, status: 'in_progress', started_at: new Date().toISOString(), created_by: finance.id },
      { id: trackerTaskId, tenant_id: tenantId, process_step_id: trackerStepId, subject_type: 'award_handoff', subject_id: handoffId, instance_key: `award:${handoffId}:projectTracker`, status: 'blocked', blocked_reason: 'Awaiting NTP date', created_by: finance.id },
      { id: cxTaskId, tenant_id: tenantId, process_step_id: cxStepId, subject_type: 'award_handoff', subject_id: handoffId, instance_key: `award:${handoffId}:cxOnboarding`, status: 'blocked', blocked_reason: 'Awaiting NTP date', created_by: finance.id },
    ])
    await insert('award_handoffs', { id: handoffId, tenant_id: tenantId, source_bom_id: bomId, project_id: projectId, project_code: projectId, budget_id: budgetId, dp_invoice_id: invoiceId, project_tracker_id: trackerId, task_ids: { arProjectCode: financeTaskId, downPaymentInvoice: dpTaskId, cari: cariTaskId, projectTracker: trackerTaskId, cxOnboarding: cxTaskId }, created_by: finance.id })
  return { financeTaskId, cxTaskId, trackerTaskId, handoffId, projectId }
}

async function login(page: Page, identity: Identity): Promise<void> {
  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(identity.email)
  await page.locator('#password').fill(identity.password)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ])
}

test.beforeAll(async () => {
  const { supabaseUrl, anonKey, serviceKey } = requireLocalEnvironment()
  const auth = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  // The service role intentionally has no tenant INSERT grant. Seed only this
  // disposable loopback database through its own PostgreSQL connection.
  const requireFromDatabase = createRequire(resolve(process.cwd(), '../../packages/database/package.json'))
  const createSqlClient: (connection: string, options: { max: number }) => SqlClient = requireFromDatabase('postgres')
  const sqlClient = createSqlClient(process.env.DATABASE_URL!, { max: 1 })
  fixtureSql = sqlClient
  const insert: InsertFixture = async (table, values) => {
    const rows = Array.isArray(values) ? values : [values]
    if (!/^[a-z][a-z_]*$/.test(table)) throw new Error('Invalid local fixture table name')
    for (const row of rows) {
      const columns = Object.keys(row)
      if (!columns.every((column) => /^[a-z][a-z_]*$/.test(column))) {
        throw new Error('Invalid local fixture column name')
      }
      const parameters = columns.map((column) => {
        const value = row[column]!
        return typeof value === 'object' && value !== null ? sqlClient.json(value) : value
      })
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
      await sqlClient.unsafe(
        `insert into public.${table} (${columns.join(', ')}) values (${placeholders})`,
        parameters
      )
    }
  }
  readTaskStatus = async (taskId) => {
    const rows = await sqlClient.unsafe('select status from public.task_instances where id = $1', [taskId])
    const row = rows[0]
    if (!row || typeof row !== 'object' || !('status' in row) || typeof row.status !== 'string') {
      throw new Error('Local task status row is missing or invalid')
    }
    return row.status
  }
  readClock = async (taskId) => {
    const rows = await sqlClient.unsafe('select status, started_at, target_value from public.sla_clocks where task_instance_id = $1 order by created_at desc limit 1', [taskId])
    const row = rows[0]
    if (!row) return undefined
    if (typeof row !== 'object' || !('status' in row) || typeof row.status !== 'string' || !('started_at' in row) || !(row.started_at instanceof Date) || !('target_value' in row) || typeof row.target_value !== 'number') {
      throw new Error('Local award clock row is invalid')
    }
    return { status: row.status, startedAt: row.started_at.toISOString(), targetValue: row.target_value }
  }
  const createUser = async (email: string, password: string): Promise<string> => {
    const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(`Local Auth fixture creation failed: ${error?.message ?? 'no user'}`)
    return data.user.id
  }
  const tenantId = randomUUID()
  const foreignTenantId = randomUUID()
  const finance = await createIdentity(createUser, 'finance', 'home')
  const cx = await createIdentity(createUser, 'cx', 'home')
  const viewer = await createIdentity(createUser, 'viewer', 'home')
  const pm = await createIdentity(createUser, 'pm', 'home')
  const foreignFinance = await createIdentity(createUser, 'finance', 'foreign')
  await insert('tenants', [
    { id: tenantId, name: 'Synthetic award browser tenant', slug: `award-browser-${tenantId}` },
    { id: foreignTenantId, name: 'Synthetic foreign award browser tenant', slug: `award-browser-${foreignTenantId}` },
  ])
  // Local Auth provisions an individual workspace and admin profile for each
  // new user. Reassign only these generated synthetic profiles to the two
  // explicit fixture tenants, matching the production membership lookup.
  for (const [identity, companyId, role, name] of [
    [finance, tenantId, 'finance', 'Synthetic Finance'],
    [cx, tenantId, 'cx', 'Synthetic CX'],
    [viewer, tenantId, 'viewer', 'Synthetic Viewer'],
    [pm, tenantId, 'pm', 'Synthetic Project Manager'],
    [foreignFinance, foreignTenantId, 'finance', 'Synthetic Foreign Finance'],
  ] as const) {
    await sqlClient.unsafe('delete from public.tenant_memberships where user_id = $1', [identity.id])
    await sqlClient.unsafe(
      'update public.users set tenant_id = $1, role = $2, full_name = $3 where id = $4',
      [companyId, role, name, identity.id]
    )
  }
  const home = await createAward(insert, tenantId, finance, cx)
  const foreign = await createAward(insert, foreignTenantId, foreignFinance, foreignFinance)
  fixture = { tenantId, finance, cx, viewer, pm, foreignFinance, projectId: home.projectId, financeTaskId: home.financeTaskId, cxTaskId: home.cxTaskId, trackerTaskId: home.trackerTaskId, foreignTaskId: foreign.financeTaskId, handoffId: home.handoffId, foreignHandoffId: foreign.handoffId }
  const { data: user } = await createClient(supabaseUrl, anonKey).auth.signInWithPassword({ email: finance.email, password: finance.password })
  expect(user.user?.id).toBe(finance.id)
})

test.afterAll(async () => {
  await fixtureSql?.end()
})

test('Finance sees and completes only its award task through Web and Core', async ({ page }) => {
  await login(page, fixture.finance)
  await page.goto('/process')
  const queue = page.getByRole('region', { name: 'Process task queue' })
  await expect(queue).toContainText('AWARD.AR_PROJECT_CODE')
  await expect(queue).toContainText(fixture.handoffId)
  await expect(queue).not.toContainText('AWARD.CX_ONBOARDING')
  await expect(queue).not.toContainText(fixture.foreignHandoffId)
  const arTask = queue.locator('tbody tr').filter({ hasText: 'AWARD.AR_PROJECT_CODE' })
  await arTask.getByRole('button', { name: 'Complete' }).click()
  await expect(arTask.getByRole('status')).toHaveText('Updated')
  await expect.poll(async () => readTaskStatus(fixture.financeTaskId)).toBe('completed')
})

test('CX sees its blocked award task and cannot complete it', async ({ page }) => {
  await login(page, fixture.cx)
  await page.goto('/process')
  const queue = page.getByRole('region', { name: 'Process task queue' })
  await expect(queue).toContainText('AWARD.CX_ONBOARDING')
  await expect(queue).toContainText('Awaiting NTP date')
  await expect(queue).not.toContainText('AWARD.AR_PROJECT_CODE')
  await expect(queue.getByRole('button', { name: 'Complete' })).toHaveCount(0)
})

test('Viewer has no task queue access and foreign Finance sees only its company', async ({ browser }) => {
  const viewerContext = await browser.newContext()
  try {
    const viewerPage = await viewerContext.newPage()
    await login(viewerPage, fixture.viewer)
    await viewerPage.goto('/process')
    await expect(viewerPage.getByText('You do not have permission to view the process task queue.')).toBeVisible()
    await viewerPage.goto(`/projects/${fixture.projectId}/permits`)
    await expect(viewerPage.getByRole('heading', { name: 'Four returns before site start' })).toHaveCount(0)
    await expect(viewerPage.getByRole('button', { name: 'Save NTP from Building Admin receipt' })).toHaveCount(0)
    expect(await readTaskStatus(fixture.cxTaskId)).toBe('blocked')
  } finally {
    await viewerContext.close()
  }
  const foreignContext = await browser.newContext()
  try {
    const foreignPage = await foreignContext.newPage()
    await login(foreignPage, fixture.foreignFinance)
    await foreignPage.goto('/process')
    const queue = foreignPage.getByRole('region', { name: 'Process task queue' })
    await expect(queue).toContainText('AWARD.AR_PROJECT_CODE')
    await expect(queue).toContainText(fixture.foreignHandoffId)
    await expect(queue).not.toContainText(fixture.handoffId)
  } finally {
    await foreignContext.close()
  }
})

test('Project Manager records NTP through permits and releases CX and Project Tracker clocks', async ({ page }) => {
  await login(page, fixture.pm)
  await page.goto(`/projects/${fixture.projectId}/permits`)
  const panel = page.getByRole('region', { name: 'Four returns before site start' })
  await expect(panel).toBeVisible()
  const receiptDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const ntpDate = panel.locator('input[aria-label="NTP from Building Admin received date"]')
  await expect.poll(async () => ntpDate.evaluate((element) =>
    Object.keys(element).some((key) => key.startsWith('__reactFiber'))
  )).toBe(true)
  await ntpDate.fill(receiptDate)
  await expect(panel.getByText('Unsaved edit', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Save NTP from Building Admin receipt' }).click()
  await expect(panel.getByRole('status')).toContainText('NTP from Building Admin receipt committed')
  await expect.poll(async () => readTaskStatus(fixture.cxTaskId)).toBe('in_progress')
  await expect.poll(async () => readTaskStatus(fixture.trackerTaskId)).toBe('in_progress')
  const expectedStart = `${receiptDate}T00:00:00.000Z`
  await expect.poll(async () => readClock(fixture.cxTaskId)).toEqual({ status: 'running', startedAt: expectedStart, targetValue: 7 })
  await expect.poll(async () => readClock(fixture.trackerTaskId)).toEqual({ status: 'running', startedAt: expectedStart, targetValue: 2 })
})

test('CX completes its released task through its scoped queue', async ({ page }) => {
  await login(page, fixture.cx)
  await page.goto('/process')
  const queue = page.getByRole('region', { name: 'Process task queue' })
  const cxTask = queue.locator('tbody tr').filter({ hasText: 'AWARD.CX_ONBOARDING' })
  await expect(cxTask).toContainText('In Progress')
  await cxTask.getByRole('button', { name: 'Complete' }).click()
  await expect(cxTask.getByRole('status')).toHaveText('Updated')
  await expect.poll(async () => readTaskStatus(fixture.cxTaskId)).toBe('completed')
  await expect.poll(async () => (await readClock(fixture.cxTaskId))?.status).toBe('completed')
})

test('A retired project rejects a stale NTP receipt retry', async ({ page }) => {
  await login(page, fixture.pm)
  await page.goto(`/projects/${fixture.projectId}/permits`)
  const panel = page.getByRole('region', { name: 'Four returns before site start' })
  const ntpDate = panel.locator('input[aria-label="NTP from Building Admin received date"]')
  await expect(ntpDate).not.toHaveValue('')
  await expect.poll(async () => ntpDate.evaluate((element) =>
    Object.keys(element).some((key) => key.startsWith('__reactFiber'))
  )).toBe(true)
  if (!fixtureSql) throw new Error('Disposable SQL fixture is unavailable')
  await fixtureSql.unsafe(
    'update public.projects set deleted_at = now(), deleted_by = $1, deletion_reason = $2 where id = $3 and tenant_id = $4',
    [fixture.pm.id, 'Synthetic retired-project browser proof', fixture.projectId, fixture.tenantId]
  )
  await panel.getByRole('button', { name: 'Save NTP from Building Admin receipt' }).click()
  await expect(panel.getByRole('alert')).toHaveText('Project not found.')
})
