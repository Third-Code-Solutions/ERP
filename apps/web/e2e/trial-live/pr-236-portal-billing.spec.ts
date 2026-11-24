import { expect, test, type Page } from '../base-test'
import { z } from 'zod'
import {
  RUN_ID,
  gateTrialLive,
  maskingPortalTokens,
  needsData,
  noteNeedsData,
  openRole,
  pesoTextToCents,
  tenantRows,
  trialTarget,
  type TrialTarget,
} from '../helpers/trial-live'

gateTrialLive()

const PORTAL_INVOICE_STATUSES = 'issued,partial_payment,paid,overdue'
const PORTAL_CLAIM_STATUSES = 'submitted,certificate_pending,certified,handed_over_finance,invoiced,paid'

const uuid = z.string().uuid()
const cents = z.coerce.number()

async function firstColumn(page: Page, header: string): Promise<string[]> {
  const table = page.locator('table', { has: page.getByRole('columnheader', { name: header, exact: true }) })
  if ((await table.count()) === 0) return []
  return (await table.locator('tbody tr td:first-child').allInnerTexts()).map((text) => text.trim()).sort()
}

async function kpiCents(page: Page, label: string): Promise<number> {
  const value = page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p[1]')
  return pesoTextToCents(await value.innerText())
}

/** Posted customer_current_due receipts per invoice, read from the DB. */
async function receivedByInvoice(target: TrialTarget, invoiceIds: string[]): Promise<Map<string, number>> {
  const received = new Map<string, number>()
  if (invoiceIds.length === 0) return received
  const allocations = await tenantRows(
    target,
    'cash_allocations',
    `invoice_id=in.(${invoiceIds.join(',')})&allocation_type=eq.customer_current_due&select=invoice_id,cash_transaction_id,amount_cents`,
    z.object({ invoice_id: uuid, cash_transaction_id: uuid, amount_cents: cents })
  )
  const transactionIds = [...new Set(allocations.map((row) => row.cash_transaction_id))]
  if (transactionIds.length === 0) return received
  const posted = new Set(
    (
      await tenantRows(
        target,
        'cash_transactions',
        `id=in.(${transactionIds.join(',')})&status=eq.posted&select=id`,
        z.object({ id: uuid })
      )
    ).map((row) => row.id)
  )
  for (const row of allocations) {
    if (!posted.has(row.cash_transaction_id)) continue
    received.set(row.invoice_id, (received.get(row.invoice_id) ?? 0) + row.amount_cents)
  }
  return received
}

// @needs-data: without a draft, a reversed and a part-paid invoice on the E2E
// project the pre-fix page passes too, so the test fails with NEEDS DATA.
test(
  'portal billing shows only issued documents and net outstanding',
  { tag: ['@pr-236', '@needs-data'] },
  async ({ browser }, testInfo) =>
    maskingPortalTokens(async () => {
      const target = await trialTarget(testInfo)
      const project = `project_id=eq.${target.projectId}`
      const shownInvoices = await tenantRows(
        target,
        'invoices',
        `${project}&status=in.(${PORTAL_INVOICE_STATUSES})&reversed_at=is.null&select=id,invoice_number,status,net_amount_cents`,
        z.object({ id: uuid, invoice_number: z.string(), status: z.string(), net_amount_cents: cents })
      )
      const hiddenInvoices = await tenantRows(
        target,
        'invoices',
        `${project}&or=(status.not.in.(${PORTAL_INVOICE_STATUSES}),reversed_at.not.is.null)&select=invoice_number,status,reversed_at`,
        z.object({ invoice_number: z.string(), status: z.string(), reversed_at: z.string().nullable() })
      )
      const shownClaims = await tenantRows(
        target,
        'progress_claims',
        `${project}&status=in.(${PORTAL_CLAIM_STATUSES})&select=claim_number`,
        z.object({ claim_number: z.string() })
      )
      const hiddenClaims = await tenantRows(
        target,
        'progress_claims',
        `${project}&status=not.in.(${PORTAL_CLAIM_STATUSES})&select=claim_number`,
        z.object({ claim_number: z.string() })
      )
      const received = await receivedByInvoice(target, shownInvoices.map((row) => row.id))
      const receivedOf = (id: string) => received.get(id) ?? 0
      // An invoice marked paid is settled; any other is paid up to its posted receipts.
      const expectedPaid = shownInvoices.reduce(
        (sum, row) =>
          sum + (row.status === 'paid' ? row.net_amount_cents : Math.min(Math.max(receivedOf(row.id), 0), row.net_amount_cents)),
        0
      )

      // The pre-fix page listed every invoice and counted only `paid` invoices as paid,
      // so only these rows tell the two pages apart.
      const missing: string[] = []
      if (!hiddenInvoices.some((row) => row.status === 'draft')) missing.push('a draft invoice')
      if (!hiddenInvoices.some((row) => row.reversed_at !== null)) missing.push('a reversed invoice')
      if (!shownInvoices.some((row) => row.status !== 'paid' && receivedOf(row.id) > 0)) {
        missing.push('an issued invoice not marked paid with a posted customer_current_due receipt (part-paid)')
      }
      if (missing.length > 0) needsData(`${missing.join(', ')} on the E2E project`)
      if (hiddenClaims.length === 0) {
        noteNeedsData(testInfo, 'a draft, rejected or cancelled claim on the E2E project to prove it is hidden')
      }

      const admin = await openRole(browser, target, 'admin')
      const viewerName = `trial-live ${RUN_ID}`
      let mintAttempted = false
      let portalUrl: string | null = null
      try {
        await admin.page.goto(`/projects/${target.projectId}/access`)
        await admin.page.locator('input[name="viewer_name"]').fill(viewerName)
        await admin.page.locator('input[name="viewer_email"]').fill(`trial-live-${RUN_ID}@example.invalid`)
        await admin.page.locator('input[name="days"]').fill('1')
        mintAttempted = true
        await admin.page.getByRole('button', { name: 'Mint client link' }).click()
        const link = admin.page.locator('code').filter({ hasText: '/portal/project/' })
        const token = /\/portal\/project\/([^/?#\s]+)/.exec(await link.innerText())?.[1]
        // A boolean, so the token can never appear in an assertion message.
        expect(Boolean(token), 'minted portal link').toBe(true)
        portalUrl = `/portal/project/${token}/billing`

        const client = await browser.newContext({ baseURL: target.baseUrl })
        try {
          const page = await client.newPage()
          await page.goto(portalUrl)
          await expect(page.getByText('Total invoiced')).toBeVisible()
          expect(await firstColumn(page, 'Invoice #')).toEqual(shownInvoices.map((row) => row.invoice_number).sort())
          expect(await firstColumn(page, 'Claim #')).toEqual(shownClaims.map((row) => row.claim_number).sort())
          const invoiced = await kpiCents(page, 'Total invoiced')
          expect(invoiced).toBe(shownInvoices.reduce((sum, row) => sum + row.net_amount_cents, 0))
          expect(await kpiCents(page, 'Total paid'), 'Total paid equals the posted receipts').toBe(expectedPaid)
          expect(await kpiCents(page, 'Outstanding')).toBe(invoiced - expectedPaid)
        } finally {
          await client.close()
        }
      } finally {
        try {
          // Revoke by viewer name, so a link is revoked even when reading its token failed.
          if (mintAttempted) {
            const revoke = admin.page.getByRole('row').filter({ hasText: viewerName }).getByRole('button', { name: 'Revoke' })
            await admin.page.goto(`/projects/${target.projectId}/access`)
            if ((await revoke.count()) > 0) await revoke.click()
            await expect(revoke).toHaveCount(0)
          }
          if (portalUrl) {
            const client = await browser.newContext({ baseURL: target.baseUrl })
            try {
              const page = await client.newPage()
              await page.goto(portalUrl)
              await expect(page.getByText('Link expired or invalid').first()).toBeVisible()
            } finally {
              await client.close()
            }
          }
        } finally {
          await admin.close()
        }
      }
    })
)
