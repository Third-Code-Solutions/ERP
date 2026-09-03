import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import {
  ERP_ROLES,
  type ErpRole,
} from '@third-code-erp/shared-types/authorization'
import type { Request } from 'express'

export { ERP_ROLES }
export type { ErpRole }

export interface ErpPrincipal {
  userId: string
  tenantId: string
  role: ErpRole
  email: string
}

export interface AuthenticatedRequest extends Request {
  principal?: ErpPrincipal
  verifiedIdentity?: {
    userId: string
    email: string | null
    emailConfirmedAt: string | null
    authenticatedAt?: number
  }
}

export function requireCurrentPrincipal(
  request: Pick<AuthenticatedRequest, 'principal'>
): ErpPrincipal {
  if (!request.principal) {
    throw new UnauthorizedException('Authenticated principal missing')
  }
  return request.principal
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ErpPrincipal => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>()
    return requireCurrentPrincipal(request)
  }
)
