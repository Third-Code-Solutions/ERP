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
  ERP_CAPABILITIES,
  roleHasCapability,
  type ErpCapability,
  type ErpRole,
} from '@third-code-erp/shared-types/authorization'
import type { AuthenticatedRequest } from './current-principal.decorator'
import { PUBLIC_ROUTE } from './supabase-jwt.guard'

export { ERP_CAPABILITIES, roleHasCapability }
export type { ErpCapability }

const CAPABILITIES_KEY = 'third-code-erp:capabilities'

export const RequireCapabilities = (
  ...capabilities: ErpCapability[]
) => SetMetadata(CAPABILITIES_KEY, capabilities)

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
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

    const required = this.reflector.getAllAndOverride<ErpCapability[]>(
      CAPABILITIES_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required || required.length === 0) {
      throw new ForbiddenException(
        'Route has no explicit ERP capability policy',
      )
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>()
    const role: ErpRole | undefined = request.principal?.role
    if (
      !role ||
      !required.every((capability) => roleHasCapability(role, capability))
    ) {
      throw new ForbiddenException()
    }
    return true
  }
}
