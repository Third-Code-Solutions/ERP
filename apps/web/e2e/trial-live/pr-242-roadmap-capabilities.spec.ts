import { randomUUID } from 'node:crypto'
import { expect, test } from '../base-test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { ALL_ROLES, callApi, gateTrialLive, openRole, trialTarget } from '../helpers/trial-live'

gateTrialLive()

test(
  'price-list workflow needs po.approve and provider delivery needs tenant administration',
  { tag: '@pr-242' },
  async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000) // one sign-in per probed role
    const target = await trialTarget(testInfo)
    // Exactly the roles the old guards admitted (procurement.read, notification.manage) and the new ones refuse.
    const priceListRoles = ALL_ROLES.filter(
      (role) => roleHasCapability(role, 'procurement.read') && !roleHasCapability(role, 'po.approve')
    )
    const deliveryRoles = ALL_ROLES.filter(
      (role) => roleHasCapability(role, 'notification.manage') && !roleHasCapability(role, 'admin.system_config')
    )
    expect(priceListRoles).toContain('viewer')
    expect(deliveryRoles.length).toBeGreaterThan(0)

    for (const role of new Set([...priceListRoles, ...deliveryRoles])) {
      const session = await openRole(browser, target, role)
      try {
        if (priceListRoles.includes(role)) {
          // Guards run before the lookup: a missing guard answers 404 for this unknown id, never a write.
          const response = await callApi(
            target,
            session.accessToken,
            'POST',
            `/v1/roadmap/price-lists/${randomUUID()}/workflow`,
            { action: 'activate' }
          )
          expect.soft(response.status, `${role} price-list workflow: ${response.body}`).toBe(403)
        }
        if (deliveryRoles.includes(role)) {
          // An empty body: a missing guard answers 400 from validation, so nothing is ever queued.
          const response = await callApi(target, session.accessToken, 'POST', '/v1/roadmap/provider-delivery', {})
          expect.soft(response.status, `${role} provider delivery: ${response.body}`).toBe(403)
        }
      } finally {
        await session.close()
      }
    }
  }
)
