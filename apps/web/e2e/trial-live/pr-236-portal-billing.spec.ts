import { expect, test, type Page } from '@playwright/test'
import { z } from 'zod'
import {
  RUN_ID,
  gateTrialLive,
  noteNeedsData,
  openRole,
  pesoTextToCents,
  tenantRows,
  trialTarget,
} from '../helpers/trial-live'

gateTrialLive()

const PORTAL_INVOICE_STATUSES = 'issued,partial_payment,paid,overdue'
const PORTAL_CLAIM_STATUSES = 'submitted,certificate_pending,certified,handed_over_finance,invoiced,paid'

async function firstColumn(page: Page, header: string): Promise<string[]> {
  const table = page.locator('table', { has: page.getByRole('columnheader', { name: header, exact: true }) })
  if ((await table.count()) === 0) return []
  return (await table.locator('tbody tr td:first-child').allInnerTexts()).map((text) => text.trim()).sort()
}

async function kpiCents(page: Page, label: string): Promise<number> {
  const value = page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p[1]')
  return pesoTextToCents(await value.innerText())
}

test('portal billing shows only issued documents and net outstanding', { tag: '@pr-236' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const project = `project_id=eq.${target.projectId}`
  const shownInvoices = await tenantRows(
    target,
    'invoices',
    `${project}&status=in.(${PORTAL_INVOICE_STATUSES})&reversed_at=is.null&select=invoice_number,net_amount_cents`,
    z.object({ invoice_number: z.string(), net_amount_cents: z.coerce.number() })
  )
  const hiddenInvoices = await tenantRows(
    target,
    'invoices',
    `${project}&or=(status.not.in.(${PORTAL_INVOICE_STATUSES}),reversed_at.not.is.null)&select=invoice_number`,
    z.object({ invoice_number: z.string() })
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
  if (hiddenInvoices.length + hiddenClaims.length === 0) {
    noteNeedsData(testInfo, 'a draft, cancelled or reversed invoice or a draft claim on the E2E project to prove it is hidden')
  }

  const admin = await openRole(browser, target, 'admin')
  const viewerName = `trial-live ${RUN_ID}`
  let portalUrl: string | null = null
  try {
    await admin.page.goto(`/projects/${target.projectId}/access`)
    await admin.page.locator('input[name="viewer_name"]').fill(viewerName)
    await admin.page.locator('input[name="viewer_email"]').fill(`trial-live-${RUN_ID}@example.invalid`)
    await admin.page.locator('input[name="days"]').fill('1')
    await admin.page.getByRole('button', { name: 'Mint client link' }).click()
    const link = admin.page.locator('code').filter({ hasText: '/portal/project/' })
    const token = /\/portal\/project\/([^/?#\s]+)/.exec(await link.innerText())?.[1]
    expect(token, 'minted portal link').toBeTruthy()
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
      expect(await kpiCents(page, 'Outstanding')).toBe(invoiced - (await kpiCents(page, 'Total paid')))
    } finally {
      await client.close()
    }
  } finally {
    try {
      if (portalUrl) {
        await admin.page.goto(`/projects/${target.projectId}/access`)
        await admin.page.getByRole('row').filter({ hasText: viewerName }).getByRole('button', { name: 'Revoke' }).click()
        await expect(admin.page.getByRole('row').filter({ hasText: viewerName }).getByRole('button', { name: 'Revoke' })).toHaveCount(0)
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
