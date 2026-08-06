import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  type AuthenticatedRequest,
  type ErpRole,
} from './current-principal.decorator'
import { PUBLIC_ROUTE } from './supabase-jwt.guard'

export const ERP_CAPABILITIES = [
  'asset.read',
  'cortex.search',
  'finance.read',
  'account.read',
  'audit.read',
  'account.kyc_review',
  'opportunity.read',
  'opportunity.convert',
  'project.read',
  'project.create',
  'project.update',
  'cost.record',
  'rfq.dispatch',
  'po.create',
  'po.approve',
  'po.issue',
  'delivery.receive',
  'change_request.create',
  'inventory.read',
  'inventory.manage',
  'inventory.post_receipt',
  'inventory.post_movement',
  'document.manage',
  'document.process',
  'document.processing.read',
  'bom.generate',
  'finance.post',
  'finance.issue_invoice',
  'finance.manage_cash',
  'provider.quota.consume',
] as const
export type ErpCapability = (typeof ERP_CAPABILITIES)[number]

const CAPABILITY_ROLES: Record<ErpCapability, readonly ErpRole[]> = {
  'asset.read': [
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
  ],
  'cortex.search': [
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
  ],
  'finance.read': ['owner', 'admin', 'finance'],
  'account.read': [
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
  ],
  // Audit activity exposes entity and actor metadata, so keep it narrower
  // than ordinary ERP reads even though diff payloads are redacted.
  'audit.read': ['owner', 'admin', 'pm', 'finance'],
  'account.kyc_review': ['owner', 'admin', 'finance'],
  'opportunity.read': [
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
  ],
  'opportunity.convert': [
    'owner',
    'admin',
    'sales',
    'commercial',
    'sd_pm_pe',
    'pm',
    'estimator',
  ],
  'project.read': [
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
  ],
  'project.create': [
    'owner',
    'admin',
    'sales',
    'commercial',
    'sd_pm_pe',
    'pm',
    'estimator',
  ],
  'project.update': [
    'owner',
    'admin',
    'sales',
    'commercial',
    'sd_pm_pe',
    'pm',
  ],
  'cost.record': [
    'owner',
    'admin',
    'sd_pm_pe',
    'pm',
    'commercial',
    'finance',
  ],
  'rfq.dispatch': ['owner', 'admin', 'procurement'],
  // Kept intentionally narrow while the PO command is disabled by default.
  'po.create': [
    'owner',
    'admin',
    'commercial',
    'sd_pm_pe',
    'pm',
    'procurement',
  ],
  'po.approve': ['owner', 'admin', 'commercial'],
  'po.issue': ['owner', 'admin', 'procurement'],
  'delivery.receive': [
    'owner',
    'admin',
    'commercial',
    'sd_pm_pe',
    'pm',
    'procurement',
  ],
  'change_request.create': ['owner', 'admin', 'sales'],
  'inventory.read': [
    'owner',
    'admin',
    'finance',
    'procurement',
    'sd_pm_pe',
    'pm',
    'commercial',
  ],
  'inventory.manage': ['owner', 'admin', 'procurement'],
  'inventory.post_receipt': ['owner', 'admin', 'finance'],
  'inventory.post_movement': ['owner', 'admin', 'finance'],
  'document.manage': [
    'owner',
    'admin',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'pm',
    'finance',
    'procurement',
    'safety',
    'cx',
    'estimator',
  ],
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
  ],
  // Mirrors web permission matrix. Togal commit remains separately
  // fail-closed behind a tenant-scoped server feature flag.
  'bom.generate': ['owner', 'admin', 'commercial', 'estimator'],
  'finance.post': ['owner', 'admin', 'finance'],
  'finance.issue_invoice': ['owner', 'admin', 'finance'],
  'finance.manage_cash': ['owner', 'admin', 'finance'],
  // Every authenticated ERP role may consume a bounded provider budget. The
  // quota key remains tenant/user scoped; this capability grants no ERP write.
  'provider.quota.consume': [
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
  ],
}

export function roleHasCapability(
  role: ErpRole,
  capability: ErpCapability
): boolean {
  return CAPABILITY_ROLES[capability].includes(role)
}

const CAPABILITIES_KEY = 'third-code-erp:capabilities'

export const RequireCapabilities = (
  ...capabilities: ErpCapability[]
) => SetMetadata(CAPABILITIES_KEY, capabilities)

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true
    }

    const required =
      this.reflector.getAllAndOverride<ErpCapability[]>(
        CAPABILITIES_KEY,
        [context.getHandler(), context.getClass()]
      )
    if (!required || required.length === 0) {
      throw new ForbiddenException(
        'Route has no explicit ERP capability policy'
      )
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>()
    const role = request.principal?.role
    if (
      !role ||
      !required.every((capability) =>
        roleHasCapability(role, capability)
      )
    ) {
      throw new ForbiddenException()
    }
    return true
  }
}
