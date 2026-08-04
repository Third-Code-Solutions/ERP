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
  'project.create',
  'project.update',
  'rfq.dispatch',
  'po.create',
  'po.approve',
  'po.issue',
  'delivery.receive',
  'change_request.create',
  'inventory.manage',
  'inventory.post_receipt',
  'document.manage',
  'document.process',
  'document.processing.read',
  'finance.post',
  'finance.issue_invoice',
  'finance.manage_cash',
] as const
export type ErpCapability = (typeof ERP_CAPABILITIES)[number]

const CAPABILITY_ROLES: Record<ErpCapability, readonly ErpRole[]> = {
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
  'inventory.manage': ['owner', 'admin', 'procurement'],
  'inventory.post_receipt': ['owner', 'admin', 'finance'],
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
  'finance.post': ['owner', 'admin', 'finance'],
  'finance.issue_invoice': ['owner', 'admin', 'finance'],
  'finance.manage_cash': ['owner', 'admin', 'finance'],
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
