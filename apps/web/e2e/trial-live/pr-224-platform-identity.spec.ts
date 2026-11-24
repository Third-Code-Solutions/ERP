import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { gateTrialLive, needsData, openRole, tenantRows, trialTarget } from '../helpers/trial-live'

gateTrialLive()

// The only platform identity (apps/api/src/auth: PLATFORM_OWNER_EMAIL).
const PLATFORM_OWNER_EMAIL = 'kurt@thirdcodesolutions.com'
const memberRow = z.object({ id: z.string().uuid(), role: z.string() })

test(
  'a workspace admin cannot change the role of a platform identity',
  { tag: ['@pr-224', '@needs-data'] },
  async ({ browser }, testInfo) => {
    const target = await trialTarget(testInfo)
    const query = `email=eq.${encodeURIComponent(PLATFORM_OWNER_EMAIL)}&select=id,role&limit=1`
    const [member] = await tenantRows(target, 'users', query, memberRow)
    if (!member) {
      needsData(`the platform identity ${PLATFORM_OWNER_EMAIL} has no membership in the E2E tenant, so the refusal cannot be reached`)
    }

    const admin = await openRole(browser, target, 'admin')
    try {
      // A deliberately stale expectedRole: if the platform guard were missing the
      // API answers 409 (stale) and still changes nothing.
      const [expectedRole, role] = ['viewer', 'design', 'safety'].filter((r) => r !== member.role)
      const response = await fetch(`${target.apiBaseUrl}/v1/admin/users/${member.id}/role`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${admin.accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ expectedRole, role }),
      })
      const body = await response.text()
      expect(response.status, body).toBe(403)
      expect(body).toContain('Platform administration roles cannot be changed from a workspace.')
      const [after] = await tenantRows(target, 'users', query, memberRow)
      expect(after?.role).toBe(member.role)
    } finally {
      await admin.close()
    }
  }
)
