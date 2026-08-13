import { describe, expect, it } from 'vitest'

import { getManagementDashboard } from './dashboard-queries'

const suite = process.env.DATABASE_URL ? describe : describe.skip
const SEEDED_TENANT_ID = '2b2b039c-b066-412b-af4c-564f2af6097e'

suite('management dashboard database query', () => {
  it('reads the tenant-scoped Monday-meeting data shape from Postgres', async () => {
    const data = await getManagementDashboard(SEEDED_TENANT_ID)

    expect(Array.isArray(data.projectMargins)).toBe(true)
    expect(Array.isArray(data.slaBreachesByBu)).toBe(true)
    expect(data.totals.permitExposureCount).toBeGreaterThanOrEqual(0)
    expect(data.totals.permitOverdueCount).toBeGreaterThanOrEqual(0)
    expect(data.totals.slaBreachCount).toBeGreaterThanOrEqual(0)
  })
})
