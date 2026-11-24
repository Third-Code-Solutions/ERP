import { expect, test } from '../base-test'
import { z } from 'zod'
import { gateTrialLive, noteNeedsData, openRole, tenantRows, trialTarget, type TrialTarget } from '../helpers/trial-live'

gateTrialLive()

// MAX_BALANCES in src/lib/inventory-queries.ts: the page lists this many stock lines.
const MAX_BALANCES = 500
const PAGE = 1000

/** Stock lines the page derives: (warehouse, item, UOM) groups whose quantity sums to non-zero. */
async function nonZeroBalances(target: TrialTarget): Promise<number> {
  const sums = new Map<string, number>()
  // Advance by the rows actually returned: PostgREST may cap a page below PAGE.
  for (let offset = 0; ; ) {
    const rows = await tenantRows(
      target,
      'stock_ledger_entries',
      `select=warehouse_id,material_item_id,uom_id,quantity_delta_micros&order=id&limit=${PAGE}&offset=${offset}`,
      z.object({ warehouse_id: z.string(), material_item_id: z.string(), uom_id: z.string(), quantity_delta_micros: z.coerce.number() })
    )
    for (const row of rows) {
      const key = `${row.warehouse_id}:${row.material_item_id}:${row.uom_id}`
      sums.set(key, (sums.get(key) ?? 0) + row.quantity_delta_micros)
    }
    if (rows.length === 0) break
    offset += rows.length
  }
  return [...sums.values()].filter((quantity) => quantity !== 0).length
}

test('the inventory list renders and flags truncation instead of failing', { tag: '@pr-231' }, async ({ browser }, testInfo) => {
  const target = await trialTarget(testInfo)
  const balances = await nonZeroBalances(target)
  const admin = await openRole(browser, target, 'admin')
  try {
    const { page } = admin
    await page.goto('/inventory')
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory', exact: true })).toBeVisible()
    await expect(page.getByText('On-hand value').first()).toBeVisible()
    await expect(page.getByText(/exceeds the display limit/i)).toHaveCount(0)
    const notice = page.getByText(/Showing the first \d+ stock lines/)
    if (balances > MAX_BALANCES) {
      await expect(notice).toBeVisible()
    } else {
      await expect(notice).toHaveCount(0)
      noteNeedsData(testInfo, `more than ${MAX_BALANCES} non-zero stock balances in the E2E tenant to show the truncation notice (it has ${balances})`)
    }
  } finally {
    await admin.close()
  }
})
