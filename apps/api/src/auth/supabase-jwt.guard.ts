import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { users } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import {
  ERP_ROLES,
  type AuthenticatedRequest,
  type ErpRole,
} from './current-principal.decorator'
import { SupabaseIdentityService } from './supabase-identity.service'

export const PUBLIC_ROUTE = 'third-code-erp:public-route'
export const Public = () => SetMetadata(PUBLIC_ROUTE, true)

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(
    @Inject(SupabaseIdentityService)
    private readonly identity: SupabaseIdentityService,
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = this.bearerToken(request)
    if (!token) throw new UnauthorizedException()

    const identity = await this.identity.verifyAccessToken(token)
    if (!identity) throw new UnauthorizedException()

    const [membership] = await this.database.client
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1)

    if (
      !membership ||
      !ERP_ROLES.includes(membership.role as ErpRole)
    ) {
      throw new UnauthorizedException()
    }

    request.principal = {
      userId: identity.userId,
      tenantId: membership.tenantId,
      role: membership.role as ErpRole,
      email: membership.email,
    }
    return true
  }

  private bearerToken(request: AuthenticatedRequest): string | null {
    const authorization = request.headers.authorization
    if (!authorization) return null
    const [scheme, token] = authorization.split(' ')
    return scheme === 'Bearer' && token ? token : null
  }
}
