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

export const ERP_CAPABILITIES = ['project.update'] as const
export type ErpCapability = (typeof ERP_CAPABILITIES)[number]

const CAPABILITY_ROLES: Record<ErpCapability, readonly ErpRole[]> = {
  'project.update': [
    'owner',
    'admin',
    'sales',
    'commercial',
    'sd_pm_pe',
    'pm',
  ],
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
        CAPABILITY_ROLES[capability].includes(role)
      )
    ) {
      throw new ForbiddenException()
    }
    return true
  }
}
