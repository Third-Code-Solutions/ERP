import { expect, test, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { projectBillingMilestoneListResultSchema, type ProjectBillingMilestoneRow } from '@third-code-erp/shared-types'

const PROJECT = '33333333-3333-4333-8333-333333333333'
const INVOICE = '66666666-6666-4666-8666-666666666666'
const BASE_PATH = `/projects/${PROJECT}/billing`
const BLOCKERS = [
  'Locked WAR evidence is below this milestone',
  'COC must be signed for the 90%/100% gate',
  'Claim still needs commercial certification',
  'Claim still needs Finance handover',
  'Invoice link is missing',
  'Linked invoice is still a draft',
]
const rows: ProjectBillingMilestoneRow[] = Array.from({ length: 51 }, (_, index) => ({
  claimId: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
  claimNumber: `PC-${String(index + 1).padStart(5, '0')}`,
  milestonePct: 90, amountCents: 100_000, claimStatus: 'draft', certificateDocumentId: null,
  invoiceId: index === 1 ? INVOICE : null, invoiceNumber: index === 1 ? 'INV-00002' : null,
  invoiceStatus: index === 1 ? 'draft' : null, cocStatus: null,
  evidence: { lockedWarPeriods: 1, latestWarWeekEnding: '2026-09-13', latestWarOverallPct: 50 },
  readyForInvoice: false,
  // Deliberate presentation stress fixture: every supported blocker must remain
  // visible even if future backend rules return more than today's combinations.
  blockers: index === 0 ? ['war_evidence_below_milestone', 'coc_not_signed_for_final_milestone', 'claim_not_certified', 'claim_not_handed_to_finance', 'invoice_not_linked', 'invoice_not_issued'] : ['claim_not_certified'],
}))
let directory = ''
let origin = ''
let vite: import('vite').ViteDevServer | undefined
const errors: string[] = []

// Real card and production CSS, controlled source data and native browser links.
// This is not a mounted Next route, authentication, or backend pagination proof.
test.beforeAll(async () => {
  const { createServer } = await import('vite')
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  directory = resolve(await mkdtemp(join(tmpdir(), 'erp-billing-milestone-')))
  if (!directory.startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('erp-billing-milestone-')) throw new Error('Unsafe billing harness path')
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><body><main id="root"></main><script type="module" src="/harness.tsx"></script></body></html>')
  await writeFile(join(directory, 'harness.tsx'), `import React from 'react'
import { createRoot } from 'react-dom/client'
import ${JSON.stringify(join(process.cwd(), 'src/app/globals.css'))}
import { ProjectBillingMilestoneCard } from ${JSON.stringify(join(process.cwd(), 'src/components/billing/project-billing-milestone-card.tsx'))}
import { buildBillingMilestoneNavigation } from ${JSON.stringify(join(process.cwd(), 'src/components/billing/billing-milestone-navigation.ts'))}
const response = await fetch('/__billing_fixture' + location.search)
const result = await response.json()
const query = new URLSearchParams(location.search)
const searchParams = Object.fromEntries([...new Set(query.keys())].map(key => [key, query.getAll(key).length > 1 ? query.getAll(key) : query.get(key)]))
const pagination = buildBillingMilestoneNavigation(result.projectId, searchParams, result)
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1200,margin:'0 auto',padding:16}}><h1>Project billing fixture</h1><ProjectBillingMilestoneCard result={result} pagination={pagination}/></main>)
`)
  vite = await createServer({ root: directory, configFile: false, esbuild: { jsx: 'automatic' },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), directory] } },
    resolve: { alias: [
      { find: 'react', replacement: join(process.cwd(), 'node_modules/react') },
      { find: 'react-dom', replacement: join(process.cwd(), 'node_modules/react-dom') },
      { find: '@', replacement: join(process.cwd(), 'src') },
    ] },
    plugins: [{ name: 'controlled-billing-source', configureServer(server) {
      server.middlewares.use('/__billing_fixture', (request, response) => {
        const search = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
        const page = Number(search.get('milestonePage') ?? '1')
        const sourceRows = search.get('fixture') === 'empty' ? [] : rows
        const totalPages = Math.max(1, Math.ceil(sourceRows.length / 25))
        const result = projectBillingMilestoneListResultSchema.parse({ projectId: PROJECT, coc: null,
          rows: sourceRows.slice((page - 1) * 25, page * 25), page, limit: 25, total: sourceRows.length, totalPages })
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify(result))
      })
    } }],
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Billing harness failed to bind')
  origin = `http://127.0.0.1:${address.port}`
})

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + BASE_PATH + '?filter=open&tag=alpha&tag=beta&milestonePage=1')
  await expect(page.getByRole('heading', { name: 'Milestone billing traceability' })).toBeVisible()
})
test.afterEach(() => { expect(errors).toEqual([]) })
test.afterAll(async () => {
  await vite?.close()
  if (directory.startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('erp-billing-milestone-')) {
    const { rm } = await import('node:fs/promises')
    await rm(directory, { recursive: true, force: true })
  }
})

async function expectPage(page: Page, number: number, firstClaim: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`milestonePage=${number}(?:&|#|$)`))
  await expect(page.getByRole('link', { name: `View claim ${firstClaim}`, exact: true })).toBeVisible()
  const query = new URL(page.url()).searchParams
  expect(query.get('filter')).toBe('open')
  expect(query.getAll('tag')).toEqual(['alpha', 'beta'])
}

test('shows all six blockers instead of truncating readiness evidence', async ({ page }) => {
  const firstRow = page.locator('tbody tr').first()
  for (const blocker of BLOCKERS) await expect(firstRow.getByText(blocker, { exact: true })).toBeVisible()
})

test('pagination reaches page two and last page preserving query and browser history', async ({ page }) => {
  await expect(page.getByText('Previous', { exact: true })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('link', { name: 'Previous', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await expectPage(page, 2, 'PC-00026')
  await expect(page.getByRole('link', { name: 'View claim PC-00001', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await expectPage(page, 3, 'PC-00051')
  await expect(page.getByText('Next', { exact: true })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('link', { name: 'Next', exact: true })).toHaveCount(0)
  await page.goBack()
  await expectPage(page, 2, 'PC-00026')
  await page.goForward()
  await expectPage(page, 3, 'PC-00051')
  await page.getByRole('link', { name: 'Previous', exact: true }).click()
  await expectPage(page, 2, 'PC-00026')
})

test('claim, invoice, progress and turnover links navigate to their exact source identities', async ({ page }) => {
  const destinations = [
    { href: `/claims/${rows[0]!.claimId}`, label: 'PC-00001' },
    { href: `/invoices/${INVOICE}`, label: 'INV-00002' },
    { href: `/projects/${PROJECT}/progress`, label: null },
    { href: `/projects/${PROJECT}/turnover`, label: null },
  ]
  for (const destination of destinations) {
    const link = page.locator(`a[href="${destination.href}"]`).first()
    await expect(link).toBeVisible()
    if (destination.label) await expect(link).toContainText(destination.label)
    else await expect(link).toHaveAccessibleName(/\S/)
    await link.click()
    await expect(page).toHaveURL(origin + destination.href)
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Milestone billing traceability' })).toBeVisible()
  }
})

test('an out-of-range page gives first-page recovery without claiming the project is empty', async ({ page }) => {
  await page.goto(origin + BASE_PATH + '?filter=open&tag=alpha&tag=beta&milestonePage=99')
  await expect(page.getByText('Page 99 has no progress claims in the available range.', { exact: true })).toBeVisible()
  await expect(page.getByText('No progress claims are linked to this project yet.', { exact: true })).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(0)
  const first = page.getByRole('link', { name: 'Return to first page', exact: true })
  await expect(first).toHaveAttribute('href', `${BASE_PATH}?filter=open&tag=alpha&tag=beta#project-billing-milestones-heading`)
  await expect(first).toBeVisible()
  await first.click()
  await expect(page.getByRole('link', { name: 'View claim PC-00001', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.has('milestonePage')).toBe(false)
  expect(new URL(page.url()).searchParams.getAll('tag')).toEqual(['alpha', 'beta'])
})

test('a project without claims remains distinct from an empty later page', async ({ page }) => {
  await page.goto(origin + BASE_PATH + '?fixture=empty')
  await expect(page.getByText('No progress claims are linked to this project yet.', { exact: true })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Next', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Previous', exact: true })).toHaveCount(0)
})

test('production card is keyboard navigable without document overflow at four widths', async ({ page }) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(origin + BASE_PATH + '?filter=open&tag=alpha&tag=beta')
    for (const blocker of BLOCKERS) await expect(page.getByText(blocker, { exact: true }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveAttribute('href', /\/(progress|turnover|claims\/)/)
    const next = page.getByRole('link', { name: 'Next', exact: true })
    await next.focus()
    await expect(next).toBeFocused()
    await page.keyboard.press('Enter')
    await expectPage(page, 2, 'PC-00026')
    await page.goBack()
    await expect(page.getByRole('link', { name: 'View claim PC-00001', exact: true })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: join(tmpdir(), `erp-billing-milestone-${width}.png`) })
    const lastBlocker = page.locator('tbody tr').first().getByText(BLOCKERS[5]!, { exact: true })
    await lastBlocker.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'end' }))
    await expect(lastBlocker).toBeInViewport()
    for (const blocker of BLOCKERS) {
      await expect(page.locator('tbody tr').first().getByText(blocker, { exact: true })).toBeInViewport()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: join(tmpdir(), `erp-billing-milestone-readiness-${width}.png`) })
  }
})
