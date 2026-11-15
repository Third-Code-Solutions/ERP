import { describe, expect, it } from 'vitest'
import { ERP_ROLES } from '../authorization'
import { canRejectPurchaseOrderApproval } from './purchase-orders'

function rejecters(status: string): string[] {
  return ERP_ROLES.filter((role) => canRejectPurchaseOrderApproval(status, role))
}

describe('canRejectPurchaseOrderApproval', () => {
  it('lets the roles that own each pending step send it back to draft', () => {
    expect(rejecters('pending_pm_approval').sort()).toEqual(
      ['admin', 'commercial', 'owner', 'pm', 'procurement', 'sd_pm_pe']
    )
    expect(rejecters('pending_commercial_approval').sort()).toEqual([
      'admin',
      'commercial',
      'owner',
    ])
    // The issuer, plus the commercial approver; not the PM-step roles.
    expect(rejecters('pending_scm_issuance').sort()).toEqual([
      'admin',
      'commercial',
      'owner',
      'procurement',
    ])
  })

  it.each(['draft', 'issued', 'cancelled', 'submitted'])(
    'lets nobody reject a %s PO',
    (status) => {
      expect(rejecters(status)).toEqual([])
    }
  )
})
