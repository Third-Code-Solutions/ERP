import {
  Body,
  type CallHandler,
  Controller,
  Delete,
  Get,
  type ExecutionContext,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  type NestInterceptor,
} from '@nestjs/common'
import {
  createPlatformSupportSessionCommandSchema,
  createPlatformTenantCommandSchema,
  invitePlatformUserCommandSchema,
  platformAuditListQuerySchema,
  platformInvitationListQuerySchema,
  platformTenantListQuerySchema,
  platformUserListQuerySchema,
  updatePlatformTenantCommandSchema,
  updatePlatformTenantStatusCommandSchema,
  updatePlatformUserRoleCommandSchema,
  updatePlatformUserStatusCommandSchema,
  type CreatePlatformSupportSessionCommand,
  type CreatePlatformTenantCommand,
  type InvitePlatformUserCommand,
  type PlatformListQuery,
  type UpdatePlatformTenantCommand,
  type UpdatePlatformTenantStatusCommand,
  type UpdatePlatformUserRoleCommand,
  type UpdatePlatformUserStatusCommand,
} from '@third-code-erp/shared-types'

import {
  CurrentPlatformPrincipal,
  PlatformOwnerGuard,
  PlatformRoute,
  type PlatformPrincipal,
} from '../auth/platform-owner.guard'
import { PlatformAdministrationService } from './platform-administration.service'
import { PlatformValidationPipe } from './platform-validation.pipe'
import type { Observable } from 'rxjs'

class PlatformNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader('Cache-Control', 'private, no-store')
    return next.handle()
  }
}

@Controller('v1/platform-admin')
@PlatformRoute()
@UseGuards(PlatformOwnerGuard)
@UseInterceptors(PlatformNoStoreInterceptor)
export class PlatformAdministrationController {
  constructor(
    @Inject(PlatformAdministrationService)
    private readonly platform: PlatformAdministrationService
  ) {}

  @Get()
  overview(@CurrentPlatformPrincipal() principal: PlatformPrincipal) {
    return this.platform.overview(principal)
  }

  @Get('tenants')
  tenants(
    @Query(new PlatformValidationPipe(platformTenantListQuerySchema, 'tenant query'))
    query: PlatformListQuery
  ) {
    return this.platform.listTenants(query)
  }

  @Post('tenants')
  createTenant(
    @Body(new PlatformValidationPipe(createPlatformTenantCommandSchema, 'tenant'))
    command: CreatePlatformTenantCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.createTenant(command, principal)
  }

  @Patch('tenants/:tenantId')
  updateTenant(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body(new PlatformValidationPipe(updatePlatformTenantCommandSchema, 'tenant configuration'))
    command: UpdatePlatformTenantCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.updateTenant(tenantId, command, principal)
  }

  @Patch('tenants/:tenantId/status')
  updateTenantStatus(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body(new PlatformValidationPipe(updatePlatformTenantStatusCommandSchema, 'tenant status'))
    command: UpdatePlatformTenantStatusCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.updateTenantStatus(tenantId, command, principal)
  }

  @Get('users')
  users(
    @Query(new PlatformValidationPipe(platformUserListQuerySchema, 'user query'))
    query: PlatformListQuery
  ) {
    return this.platform.listUsers(query)
  }

  @Get('invitations')
  invitations(
    @Query(new PlatformValidationPipe(platformInvitationListQuerySchema, 'invitation query'))
    query: PlatformListQuery
  ) {
    return this.platform.listInvitations(query)
  }

  @Post('invitations')
  inviteUser(
    @Body(new PlatformValidationPipe(invitePlatformUserCommandSchema, 'user invitation'))
    command: InvitePlatformUserCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.inviteUser(command, principal)
  }

  @Post('invitations/:invitationId/resend')
  resendInvitation(
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.resendInvitation(invitationId, principal)
  }

  @Delete('invitations/:invitationId')
  revokeInvitation(
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.revokeInvitation(invitationId, principal)
  }

  @Patch('users/:userId/role')
  updateUserRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new PlatformValidationPipe(updatePlatformUserRoleCommandSchema, 'user role'))
    command: UpdatePlatformUserRoleCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.updateUserRole(userId, command, principal)
  }

  @Patch('users/:userId/status')
  updateUserStatus(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new PlatformValidationPipe(updatePlatformUserStatusCommandSchema, 'user status'))
    command: UpdatePlatformUserStatusCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.updateUserStatus(userId, command, principal)
  }

  @Post('users/:userId/password-reset')
  sendPasswordReset(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.sendPasswordReset(userId, principal)
  }

  @Get('roles')
  roles() {
    return this.platform.roles()
  }

  @Get('analytics')
  analytics() {
    return this.platform.analytics()
  }

  @Get('analytics/operations')
  operationalAnalytics() {
    return this.platform.operationalAnalytics()
  }

  @Get('audit')
  audit(
    @Query(new PlatformValidationPipe(platformAuditListQuerySchema, 'audit query'))
    query: PlatformListQuery
  ) {
    return this.platform.listAudit(query)
  }

  @Get('integrations')
  integrations() {
    return this.platform.integrations()
  }

  @Get('system-health')
  systemHealth() {
    return this.platform.systemHealth()
  }

  @Post('support-context')
  startSupportContext(
    @Body(new PlatformValidationPipe(createPlatformSupportSessionCommandSchema, 'support context'))
    command: CreatePlatformSupportSessionCommand,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.startSupportSession(command, principal)
  }

  @Delete('support-context/:sessionId')
  endSupportContext(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @CurrentPlatformPrincipal() principal: PlatformPrincipal
  ) {
    return this.platform.endSupportSession(sessionId, principal)
  }
}
