import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common'
import {
  platformRoleAssignments,
  users,
} from '@third-code-erp/database/schema'
import { and, count, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { DatabaseService } from '../database/database.service'
import type { AuthenticatedRequest } from './current-principal.decorator'
import { isRecentAuthentication } from './verified-authentication'

export const PLATFORM_ROUTE = 'third-code-erp:platform-route'
export const PLATFORM_OWNER_EMAIL = 'kurt@thirdcodesolutions.com' as const

/** Marks a route as requiring PlatformOwnerGuard instead of a tenant capability. */
export const PlatformRoute = () => SetMetadata(PLATFORM_ROUTE, true)

export interface PlatformPrincipal {
  userId: string
  email: typeof PLATFORM_OWNER_EMAIL
  traceId?: string
  supportSessionId?: string
}

export interface PlatformAuthenticatedRequest extends AuthenticatedRequest {
  platformPrincipal?: PlatformPrincipal
  requestId?: string
}

export const CurrentPlatformPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<PlatformAuthenticatedRequest>()
    if (!request.platformPrincipal) throw new ForbiddenException()
    return request.platformPrincipal
  }
)

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PlatformAuthenticatedRequest>()
    const identity = request.verifiedIdentity
    if (
      !identity ||
      !identity.emailConfirmedAt ||
      identity.email !== PLATFORM_OWNER_EMAIL
    ) {
      throw new ForbiddenException()
    }

    const [assignment] = await this.database.client
      .select({
        userId: platformRoleAssignments.user_id,
        email: platformRoleAssignments.normalized_email,
        role: platformRoleAssignments.role,
        accountStatus: users.account_status,
      })
      .from(platformRoleAssignments)
      .innerJoin(users, eq(users.id, platformRoleAssignments.user_id))
      .where(
        and(
          eq(platformRoleAssignments.user_id, identity.userId),
          eq(platformRoleAssignments.role, 'platform_owner'),
          isNull(platformRoleAssignments.revoked_at)
        )
      )
      .limit(1)

    const [activeCount] = await this.database.client
      .select({ value: count() })
      .from(platformRoleAssignments)
      .where(isNull(platformRoleAssignments.revoked_at))

    if (
      !assignment ||
      assignment.userId !== identity.userId ||
      assignment.email !== PLATFORM_OWNER_EMAIL ||
      assignment.accountStatus !== 'active' ||
      activeCount?.value !== 1
    ) {
      throw new ForbiddenException()
    }

    const supportSessionId = z.string().uuid().safeParse(request.headers?.['x-platform-support-session'])
    if (
      request.method &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !isRecentAuthentication(identity.authenticatedAt)
    ) {
      throw new ForbiddenException(
        'A sign-in within the last 15 minutes is required. Return to the tenant workspace, sign out, then sign in again before making platform changes.'
      )
    }
    if (request.headers?.['x-platform-support-session'] !== undefined && !supportSessionId.success) {
      throw new ForbiddenException('Invalid support context')
    }
    request.platformPrincipal = {
      userId: identity.userId,
      email: PLATFORM_OWNER_EMAIL,
      ...(request.requestId ? { traceId: request.requestId } : {}),
      ...(supportSessionId.success ? { supportSessionId: supportSessionId.data } : {}),
    }
    return true
  }
}
