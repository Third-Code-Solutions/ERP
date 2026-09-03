/**
 * Canonical ERP authorization vocabulary and role policy.
 *
 * This module intentionally has no framework, database, or server dependency
 * so the Next.js server helpers and Nest guards enforce the same policy.
 * Distinct capability names remain distinct when their existing grants differ;
 * consolidating the policy must not silently change a workflow's authority.
 */
export const ERP_ROLES = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const

export type ErpRole = (typeof ERP_ROLES)[number]

const ALL_ROLES: readonly ErpRole[] = ERP_ROLES
const ALL_OPERATORS = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
] as const satisfies readonly ErpRole[]

const capabilityRoles = {
  // CRM, proposal, and project authority
  'project.create': ['owner', 'admin', 'sales', 'commercial', 'sd_pm_pe', 'pm', 'estimator'],
  'project.update': ['owner', 'admin', 'sales', 'commercial', 'sd_pm_pe', 'pm'],
  // Project deletion is controlled logical retirement; it never grants a
  // browser a physical cascade/delete capability.
  'project.delete': ['owner', 'admin'],
  'project.read': ALL_ROLES,
  'project.award': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
  'account.create': ['owner', 'admin', 'sales'],
  'account.read': ALL_ROLES,
  'account.kyc.read': ['owner', 'admin', 'finance', 'viewer'],
  'account.kyc_review': ['owner', 'admin', 'finance'],
  'opportunity.create': ['owner', 'admin', 'sales'],
  'opportunity.read': ALL_ROLES,
  'opportunity.export': [
    'owner',
    'estimator',
    'pm',
    'admin',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'finance',
    'procurement',
    'viewer',
  ],
  'opportunity.advance_stage': ['owner', 'admin', 'sales'],
  'opportunity.stage_change': ['owner', 'admin', 'sales'],
  'opportunity.convert': ['owner', 'admin', 'sales'],
  'opportunity.kyc_track_manage': ['owner', 'admin', 'finance'],
  'opportunity.kyc_track_approve': ['owner', 'admin', 'finance'],
  'pprf.submit': ['owner', 'admin', 'sales'],
  'change_request.create': ['owner', 'admin', 'sales'],
  'site_inspection.submit': ['owner', 'admin', 'commercial'],
  'design.upload': ['owner', 'admin', 'design'],
  // Keep the design lifecycle distinct from file upload. A UI control is not
  // the authority boundary: each transition is checked again by its server
  // action so a read-only caller cannot forge a form submission.
  'design.ready_for_presentation': ['owner', 'admin', 'design'],
  'design.approve_client': ['owner', 'admin', 'design'],

  // Documents, BOM, and estimation
  'document.read': ALL_ROLES,
  'document.manage': ALL_OPERATORS,
  'document.process': [
    'owner',
    'admin',
    'commercial',
    'sd_pm_pe',
    'pm',
    'sales',
    'design',
    'estimator',
  ],
  'document.processing.read': [
    'owner',
    'admin',
    'commercial',
    'sd_pm_pe',
    'pm',
    'sales',
    'viewer',
  ],
  'bom.generate': ['owner', 'admin', 'commercial', 'estimator'],
  'bom.edit': ['owner', 'admin', 'commercial', 'estimator'],
  'bom.approve_internal': ['owner', 'admin', 'commercial'],

  // Procurement and delivery
  'procurement.read': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm', 'procurement', 'viewer'],
  'rfq.dispatch': ['owner', 'admin', 'procurement'],
  'po.create': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm', 'procurement'],
  'po.approve': ['owner', 'admin', 'commercial'],
  'po.issue': ['owner', 'admin', 'procurement'],
  'po.receive': ['owner', 'admin', 'procurement', 'finance'],
  'delivery.receive': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm', 'procurement'],

  // Finance, cost, and budget
  'kyc.create_ar_code': ['owner', 'admin', 'finance'],
  'cost.record': ['owner', 'admin', 'sd_pm_pe', 'pm', 'commercial', 'finance'],
  // Financial projections remain role-bounded for operators, while Viewer is
  // explicitly read-only. Mutation capabilities stay Finance-only.
  'finance.read': ['owner', 'admin', 'finance', 'viewer'],
  'finance.manage': ['owner', 'admin', 'finance'],
  'finance.post': ['owner', 'admin', 'finance'],
  'finance.issue_invoice': ['owner', 'admin', 'finance'],
  'finance.post_supplier_bill': ['owner', 'admin', 'finance'],
  'finance.manage_cash': ['owner', 'admin', 'finance'],
  'budget.read': [
    'owner',
    'admin',
    'finance',
    'commercial',
    'procurement',
    'sd_pm_pe',
    'pm',
    'estimator',
    'viewer',
  ],
  'budget.manage': ['owner', 'admin', 'finance', 'commercial', 'sd_pm_pe', 'pm', 'estimator'],
  'budget.approve_commercial': ['owner', 'admin', 'commercial'],
  'budget.approve_finance': ['owner', 'admin', 'finance'],

  // Delivery, construction, and service
  'precon.manage_checklist': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
  'precon.manage_permits': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
  'precon.override_mobilization': ['owner', 'admin', 'commercial', 'pm'],
  'sd.daily_tasks': ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety'],
  'project.schedule.manage': ['owner', 'admin', 'sd_pm_pe', 'pm'],
  'project.weekly_progress.submit': ['owner', 'admin', 'sd_pm_pe', 'pm'],
  'variation_order.create': ['owner', 'admin', 'sd_pm_pe', 'pm'],
  'variation_order.submit_for_commercial_pricing': [
    'owner',
    'admin',
    'sd_pm_pe',
    'pm',
  ],
  'variation_order.send_for_client_signature': ['owner', 'admin', 'commercial'],
  'variation_order.reject': ['owner', 'admin', 'commercial'],
  // Safety owns the DOLE lane, not the whole pre-con/mobilization surface.
  'safety.dole_permit.manage': ['owner', 'admin', 'safety'],
  'punchlist.manage': ['owner', 'admin', 'sd_pm_pe', 'pm', 'cx'],
  'warranty.manage': ['owner', 'admin', 'cx'],
  'cx.cnps.read': ['owner', 'admin', 'cx', 'viewer'],

  // Asset and inventory authority
  // Estimator is retained here because the legacy role maps to Commercial and
  // the existing Nest asset-read policy already permits it. This fixes the
  // Web-only denial without granting any asset mutation capability.
  'asset.read': ALL_ROLES,
  'asset.maintenance.manage': ['owner', 'admin', 'pm', 'sd_pm_pe', 'procurement'],
  'inventory.read': [
    'owner',
    'admin',
    'finance',
    'procurement',
    'sd_pm_pe',
    'pm',
    'commercial',
    'viewer',
  ],
  'inventory.closeout.read': ['owner', 'admin', 'procurement', 'viewer'],
  'inventory.manage': ['owner', 'admin', 'procurement'],
  'inventory.post_receipt': ['owner', 'admin', 'finance'],
  'inventory.post_movement': ['owner', 'admin', 'finance'],

  // Administration and notifications
  'admin.rate_card.read': ['owner', 'admin', 'commercial', 'viewer'],
  'admin.rate_card': ['owner', 'admin', 'commercial'],
  'admin.users.read': ['owner', 'admin', 'viewer'],
  'admin.users': ['owner', 'admin'],
  'admin.system_config.read': ['owner', 'admin', 'viewer'],
  'admin.system_config': ['owner', 'admin'],
  'project.access.read': ['owner', 'admin', 'viewer'],
  'notification.read': ALL_ROLES,
  'notification.manage': ALL_OPERATORS,
  'audit.read': ['owner', 'admin', 'pm', 'finance', 'viewer'],

  // Core-only projections and process authority
  'today.read': ALL_ROLES,
  'provider.quota.consume': ALL_ROLES,
  'cortex.search': ALL_ROLES,
  'cortex.assistant.use': ALL_OPERATORS,
  'cortex.index.read': ['owner', 'admin', 'viewer'],
  'cortex.index.manage': ['owner', 'admin'],
  'cortex.provider.health.read': ['owner', 'admin', 'finance', 'viewer'],
  'process.health.read': ALL_ROLES,
  'process.step.manage': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
  'process.task.manage': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
  'process.approval.manage': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
  'process.sla.manage': ['owner', 'admin', 'commercial', 'sd_pm_pe', 'pm'],
} as const satisfies Record<string, readonly ErpRole[]>

export type ErpCapability = keyof typeof capabilityRoles

export const ERP_CAPABILITY_ROLES: Readonly<
  Record<ErpCapability, readonly ErpRole[]>
> = capabilityRoles

export const ERP_CAPABILITIES: readonly ErpCapability[] = Object.freeze(
  Object.keys(ERP_CAPABILITY_ROLES) as ErpCapability[],
)

/** Tenant-safe read and export capabilities. Viewer receives every one. */
export const ERP_READ_CAPABILITIES = [
  'project.read',
  'project.access.read',
  'account.read',
  'account.kyc.read',
  'opportunity.read',
  'opportunity.export',
  'document.read',
  'document.processing.read',
  'procurement.read',
  'finance.read',
  'budget.read',
  'cx.cnps.read',
  'asset.read',
  'inventory.read',
  'inventory.closeout.read',
  'admin.rate_card.read',
  'admin.users.read',
  'admin.system_config.read',
  'notification.read',
  'audit.read',
  'today.read',
  'cortex.search',
  'cortex.index.read',
  'cortex.provider.health.read',
  'process.health.read',
] as const satisfies readonly ErpCapability[]

/** Business mutations; Viewer must remain denied for every entry. */
export const ERP_MUTATION_CAPABILITIES: readonly ErpCapability[] =
  ERP_CAPABILITIES.filter(
    (capability) =>
      capability !== 'provider.quota.consume' &&
      !(ERP_READ_CAPABILITIES as readonly ErpCapability[]).includes(capability),
  )

export function roleHasCapability(
  role: ErpRole,
  capability: ErpCapability,
): boolean {
  return ERP_CAPABILITY_ROLES[capability].includes(role)
}
