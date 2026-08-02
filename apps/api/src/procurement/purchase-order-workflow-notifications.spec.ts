import { describe, expect, it } from 'vitest'
import {
  isPurchaseOrderWorkflowNotificationRecipient,
  purchaseOrderWorkflowNotificationRoles,
} from './purchase-order-workflow-notifications'

describe('Purchase Order workflow notification recipients', () => {
  it('routes each approval step to the next accountable role', () => {
    expect(
      purchaseOrderWorkflowNotificationRoles(
        'submit_pm_approval',
        'draft'
      )
    ).toEqual(['owner', 'admin', 'pm', 'sd_pm_pe'])
    expect(
      purchaseOrderWorkflowNotificationRoles(
        'pm_approve',
        'pending_pm_approval'
      )
    ).toEqual(['owner', 'admin', 'commercial'])
    expect(
      purchaseOrderWorkflowNotificationRoles(
        'commercial_approve',
        'pending_commercial_approval'
      )
    ).toEqual(['owner', 'admin', 'procurement'])
  })

  it('keeps stale role changes from receiving workflow deliveries', () => {
    expect(
      isPurchaseOrderWorkflowNotificationRecipient(
        'commercial',
        'commercial_approve',
        'pending_commercial_approval'
      )
    ).toBe(false)
    expect(
      isPurchaseOrderWorkflowNotificationRecipient(
        'procurement',
        'commercial_approve',
        'pending_commercial_approval'
      )
    ).toBe(true)
  })

  it('routes SCM-step rejection to the remaining approval and procurement roles', () => {
    expect(
      purchaseOrderWorkflowNotificationRoles('reject', 'pending_scm_issuance')
    ).toEqual(['owner', 'admin', 'commercial', 'procurement'])
    expect(
      isPurchaseOrderWorkflowNotificationRecipient(
        'procurement',
        'reject',
        'pending_scm_issuance'
      )
    ).toBe(true)
  })
})
