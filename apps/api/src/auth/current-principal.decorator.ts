import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common'
import type { Request } from 'express'

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

export interface ErpPrincipal {
  userId: string
  tenantId: string
  role: ErpRole
  email: string
}

export interface AuthenticatedRequest extends Request {
  principal?: ErpPrincipal
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
