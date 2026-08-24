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
  'project.delete': ['owner', 'admin'],
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
  'inventory.read': ['owner', 'admin', 'finance', 'procurement', 'sd_pm_pe', 'pm', 'commercial', 'viewer'],
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
    expect(ERP_CAPABILITIES).toHaveLength(83)

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

  it('keeps project retirement with the workspace owner and admin only', () => {
    expect(roleHasCapability('owner', 'project.delete')).toBe(true)
    expect(roleHasCapability('admin', 'project.delete')).toBe(true)
    expect(roleHasCapability('viewer', 'project.delete')).toBe(false)
    expect(roleHasCapability('sales', 'project.delete')).toBe(false)
  })

  it('retains distinct domain permissions instead of collapsing different workflows by name', () => {
    expect(ERP_CAPABILITIES).toEqual(
      expect.arrayContaining([
        'bom.read',
        'dashboard.analytics.read',
        'delivery.schedule',
        'opportunity.advance_stage',
        'opportunity.stage_change',
        'project.award',
        'opportunity.convert',
        'po.receive',
        'delivery.receive',
      ]),
    )
  })

  it('keeps newly explicit read and scheduling capabilities least-privileged', () => {
    expect(roleHasCapability('viewer', 'bom.read')).toBe(true)
    expect(roleHasCapability('sales', 'bom.read')).toBe(false)
    expect(roleHasCapability('viewer', 'delivery.schedule')).toBe(false)
    expect(roleHasCapability('procurement', 'delivery.schedule')).toBe(true)
    expect(roleHasCapability('safety', 'dashboard.analytics.read')).toBe(false)
    expect(roleHasCapability('finance', 'dashboard.analytics.read')).toBe(true)
  })

  it('matches the requested ABI OPS operating lanes without granting viewers a mutation', () => {
    // Owner retains the rank-equivalent full operational authority of Admin.
    expect(roleHasCapability('owner', 'admin.users')).toBe(true)
    expect(roleHasCapability('admin', 'admin.users')).toBe(true)

    expect(roleHasCapability('sales', 'account.create')).toBe(true)
    expect(roleHasCapability('sales', 'opportunity.advance_stage')).toBe(true)
    expect(roleHasCapability('sales', 'pprf.submit')).toBe(true)
    expect(roleHasCapability('sales', 'account.kyc_review')).toBe(false)

    expect(roleHasCapability('commercial', 'site_inspection.submit')).toBe(true)
    expect(roleHasCapability('commercial', 'bom.approve_internal')).toBe(true)
    expect(roleHasCapability('commercial', 'admin.rate_card')).toBe(true)
    expect(roleHasCapability('commercial', 'po.approve')).toBe(true)

    expect(roleHasCapability('design', 'design.upload')).toBe(true)
    expect(roleHasCapability('design', 'design.ready_for_presentation')).toBe(true)
    expect(roleHasCapability('design', 'design.approve_client')).toBe(true)

    expect(roleHasCapability('sd_pm_pe', 'precon.manage_checklist')).toBe(true)
    expect(roleHasCapability('sd_pm_pe', 'sd.daily_tasks')).toBe(true)
    expect(roleHasCapability('sd_pm_pe', 'project.weekly_progress.submit')).toBe(true)
    expect(roleHasCapability('sd_pm_pe', 'variation_order.create')).toBe(true)

    expect(roleHasCapability('finance', 'account.kyc_review')).toBe(true)
    expect(roleHasCapability('finance', 'kyc.create_ar_code')).toBe(true)
    expect(roleHasCapability('finance', 'finance.issue_invoice')).toBe(true)
    expect(roleHasCapability('finance', 'finance.manage_cash')).toBe(true)

    expect(roleHasCapability('procurement', 'rfq.dispatch')).toBe(true)
    expect(roleHasCapability('procurement', 'po.create')).toBe(true)
    expect(roleHasCapability('procurement', 'po.issue')).toBe(true)

    expect(roleHasCapability('safety', 'sd.daily_tasks')).toBe(true)
    expect(roleHasCapability('safety', 'safety.dole_permit.manage')).toBe(true)
    expect(roleHasCapability('cx', 'punchlist.manage')).toBe(true)
    expect(roleHasCapability('cx', 'warranty.manage')).toBe(true)
    expect(roleHasCapability('cx', 'cx.cnps.read')).toBe(true)

    expect(roleHasCapability('viewer', 'finance.read')).toBe(false)
    expect(roleHasCapability('viewer', 'inventory.read')).toBe(true)
    expect(roleHasCapability('viewer', 'cx.cnps.read')).toBe(true)
    expect(roleHasCapability('viewer', 'project.update')).toBe(false)
    expect(roleHasCapability('viewer', 'finance.post')).toBe(false)
    expect(roleHasCapability('viewer', 'variation_order.create')).toBe(false)
    expect(roleHasCapability('viewer', 'sd.daily_tasks')).toBe(false)
  })
})
