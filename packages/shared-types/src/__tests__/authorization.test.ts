import { describe, expect, it } from 'vitest'
import {
  ERP_CAPABILITIES,
  ERP_CAPABILITY_ROLES,
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
  type ErpRole,
} from '../authorization'

const ALL_ROLES = [...ERP_ROLES]
const ALL_OPERATORS = ALL_ROLES.filter((role) => role !== 'viewer')

/**
 * The overlapping policy before consolidation. Order was never meaningful;
 * this locks the actual grants while moving the implementation to one module.
 * `asset.read` intentionally follows the existing Core policy: the legacy
 * estimator role maps to Commercial and the asset register is read-only.
 */
const SHARED_CAPABILITY_GRANT_BASELINE = {
  'project.create': ['owner', 'admin', 'sales', 'commercial', 'sd_pm_pe', 'pm', 'estimator'],
  'project.update': ['owner', 'admin', 'sales', 'commercial', 'sd_pm_pe', 'pm'],
  'opportunity.read': ALL_ROLES,
  'account.kyc_review': ['owner', 'admin', 'finance'],
  'change_request.create': ['owner', 'admin', 'sales'],
  'document.manage': ALL_OPERATORS,
  'bom.generate': ['owner', 'admin', 'commercial', 'estimator'],
  'rfq.dispatch': ['owner', 'admin', 'procurement'],
  'po.create': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm', 'procurement'],
  'po.approve': ['owner', 'admin', 'commercial'],
  'po.issue': ['owner', 'admin', 'procurement'],
  'admin.users': ['owner', 'admin'],
  'cost.record': ['owner', 'admin', 'sd_pm_pe', 'pm', 'commercial', 'finance'],
  'finance.post': ['owner', 'admin', 'finance'],
  'finance.issue_invoice': ['owner', 'admin', 'finance'],
  'finance.manage_cash': ['owner', 'admin', 'finance'],
  'asset.read': ALL_ROLES,
  'asset.maintenance.manage': ['owner', 'admin', 'pm', 'sd_pm_pe', 'procurement'],
  'inventory.read': ['owner', 'admin', 'finance', 'procurement', 'sd_pm_pe', 'pm', 'commercial'],
  'inventory.manage': ['owner', 'admin', 'procurement'],
  'inventory.post_receipt': ['owner', 'admin', 'finance'],
  'inventory.post_movement': ['owner', 'admin', 'finance'],
  'notification.read': ALL_ROLES,
} as const satisfies Partial<Record<ErpCapability, readonly ErpRole[]>>

function sorted(roles: readonly ErpRole[]): ErpRole[] {
  return [...roles].sort()
}

describe('canonical authorization policy', () => {
  it('contains each current Web/Core capability once and gives each a non-empty role policy', () => {
    expect(new Set(ERP_CAPABILITIES).size).toBe(ERP_CAPABILITIES.length)
    expect(ERP_CAPABILITIES).toHaveLength(69)

    for (const capability of ERP_CAPABILITIES) {
      const roles = ERP_CAPABILITY_ROLES[capability]
      expect(roles.length, capability).toBeGreaterThan(0)
      expect(new Set(roles).size, capability).toBe(roles.length)
      expect(roles.every((role) => ERP_ROLES.includes(role))).toBe(true)
    }
  })

  it('preserves the previously overlapping effective grants', () => {
    for (const [capability, expectedRoles] of Object.entries(
      SHARED_CAPABILITY_GRANT_BASELINE,
    ) as Array<[ErpCapability, readonly ErpRole[]]>) {
      expect(sorted(ERP_CAPABILITY_ROLES[capability]), capability).toEqual(
        sorted(expectedRoles),
      )
    }
  })

  it('aligns the read-only asset route with the existing Core policy for the legacy estimator role', () => {
    expect(roleHasCapability('estimator', 'asset.read')).toBe(true)
    expect(roleHasCapability('viewer', 'asset.read')).toBe(true)
    expect(roleHasCapability('viewer', 'asset.maintenance.manage')).toBe(false)
  })

  it('retains distinct domain permissions instead of collapsing different workflows by name', () => {
    expect(ERP_CAPABILITIES).toEqual(
      expect.arrayContaining([
        'opportunity.advance_stage',
        'opportunity.stage_change',
        'project.award',
        'opportunity.convert',
        'po.receive',
        'delivery.receive',
      ]),
    )
  })
})
