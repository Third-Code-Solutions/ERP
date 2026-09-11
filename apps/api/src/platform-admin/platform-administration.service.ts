import { randomUUID } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  opportunities,
  documents,
  documentProcessingJobs,
  cortexAssistantGenerationJobs,
  cortexSemanticIndexJobs,
  opportunityKycTracks,
  platformAuditEvents,
  platformRoleAssignments,
  platformSupportSessions,
  platformUserInvitations,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  ERP_CAPABILITIES,
  ERP_CAPABILITY_ROLES,
  ERP_ROLES,
  type CreatePlatformSupportSessionCommand,
  type CreatePlatformTenantCommand,
  type InvitePlatformUserCommand,
  type PlatformAnalyticsResult,
  type PlatformOperationalAnalyticsResult,
  type PlatformAuditSummary,
  type PlatformDependencyStatus,
  type PlatformInvitationSummary,
  type PlatformListQuery,
  type PlatformOverviewResult,
  type PlatformPagedResult,
  type PlatformRoleSummary,
  type PlatformSupportSessionResult,
  type PlatformSystemHealthResult,
  type PlatformTenantSummary,
  type PlatformUserSummary,
  type UpdatePlatformTenantCommand,
  type UpdatePlatformTenantStatusCommand,
  type UpdatePlatformUserRoleCommand,
  type UpdatePlatformUserStatusCommand,
} from '@third-code-erp/shared-types'
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
} from 'drizzle-orm'

import type { PlatformPrincipal } from '../auth/platform-owner.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { PlatformIdentityAdminService } from './platform-identity-admin.service'
import { databaseErrorCode } from '../database/database-error'

type AuditInput = {
  action: string
  outcome: 'succeeded' | 'denied' | 'failed'
  targetType: string
  targetId?: string | null
  targetTenantId?: string | null
  metadata?: Record<string, unknown> | null
}

type InvitationResultRow = {
  id: string
  tenantId: string
  tenantName: string
  email: string
  fullName: string
  role: PlatformInvitationSummary['role']
  status: PlatformInvitationSummary['status']
  createdAt: Date
  sentAt: Date | null
  acceptedAt: Date | null
  revokedAt: Date | null
  failureReason: string | null
}

function pageResult<Row>(
  rows: Row[],
  query: PlatformListQuery,
  total: number
): PlatformPagedResult<Row> {
  return {
    rows,
    page: query.page,
    limit: query.limit,
    total,
    totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
  }
}

@Injectable()
export class PlatformAdministrationService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(PlatformIdentityAdminService)
    private readonly identity: PlatformIdentityAdminService
  ) {}

  async overview(principal: PlatformPrincipal): Promise<PlatformOverviewResult> {
    const [analytics, supportRows, auditRows] = await Promise.all([
      this.analytics(),
      this.database.client
        .select({
          id: platformSupportSessions.id,
          tenantId: platformSupportSessions.tenant_id,
          tenantName: tenants.name,
          reason: platformSupportSessions.reason,
          createdAt: platformSupportSessions.created_at,
          expiresAt: platformSupportSessions.expires_at,
          endedAt: platformSupportSessions.ended_at,
        })
        .from(platformSupportSessions)
        .innerJoin(tenants, eq(tenants.id, platformSupportSessions.tenant_id))
        .where(
          and(
            eq(platformSupportSessions.actor_id, principal.userId),
            eq(platformSupportSessions.id, principal.supportSessionId ?? '00000000-0000-0000-0000-000000000000'),
            isNull(platformSupportSessions.ended_at),
            sql`${platformSupportSessions.expires_at} > now()`
          )
        )
        .orderBy(desc(platformSupportSessions.created_at))
        .limit(1),
      this.database.client
        .select()
        .from(platformAuditEvents)
        .orderBy(desc(platformAuditEvents.created_at))
        .limit(8),
    ])
    return {
      analytics,
      activeSupportSession: supportRows[0]
        ? this.supportResult(supportRows[0])
        : null,
      recentAudit: auditRows.map((row) => this.auditResult(row)),
    }
  }

  async listTenants(
    query: PlatformListQuery
  ): Promise<PlatformPagedResult<PlatformTenantSummary>> {
    const conditions = []
    if (query.q) {
      const term = `%${query.q}%`
      const search = or(ilike(tenants.name, term), ilike(tenants.slug, term))
      if (search) conditions.push(search)
    }
    if (query.status) {
      conditions.push(
        eq(
          tenants.status,
          query.status as 'active' | 'suspended' | 'disabled'
        )
      )
    }
    const where = conditions.length ? and(...conditions) : undefined
    const offset = (query.page - 1) * query.limit
    const [rows, totals] = await Promise.all([
      this.database.client
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          organizationType: tenants.organization_type,
          status: tenants.status,
          statusReason: tenants.status_reason,
          createdAt: tenants.created_at,
          updatedAt: tenants.updated_at,
          userCount: sql<number>`(
            select count(*)::int from public.users as tenant_user
            where tenant_user.tenant_id = "tenants"."id"
          )`,
          activeUserCount: sql<number>`(
            select count(*)::int from public.users as tenant_user
            where tenant_user.tenant_id = "tenants"."id"
              and tenant_user.account_status = 'active'
          )`,
          projectCount: sql<number>`(
            select count(*)::int from public.projects as tenant_project
            where tenant_project.tenant_id = "tenants"."id"
              and tenant_project.deleted_at is null
          )`,
          lastActivityAt: sql<Date | null>`(
            select max(entry.created_at) from public.audit_log as entry
            where entry.tenant_id = "tenants"."id"
          )`,
        })
        .from(tenants)
        .where(where)
        .orderBy(asc(tenants.name))
        .limit(query.limit)
        .offset(offset),
      this.database.client.select({ value: count() }).from(tenants).where(where),
    ])
    return pageResult(
      rows.map((row) => ({
        ...row,
        userCount: Number(row.userCount),
        activeUserCount: Number(row.activeUserCount),
        projectCount: Number(row.projectCount),
        lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      query,
      Number(totals[0]?.value ?? 0)
    )
  }

  async createTenant(
    command: CreatePlatformTenantCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformTenantSummary> {
    try {
      const tenantId = await this.database.client.transaction(async (tx) => {
        await this.lockOwner(tx, principal)
        const [created] = await tx
          .insert(tenants)
          .values({
            name: command.name,
            slug: command.slug,
            organization_type: command.organizationType,
            pcab_license: command.pcabLicense ?? null,
            bir_tin: command.birTin ?? null,
            dpo_contact: command.dpoContact ?? null,
          })
          .returning({ id: tenants.id })
        if (!created) {
          throw new InternalServerErrorException('Tenant was not created')
        }
        await this.writeAudit(tx, principal, {
          action: 'platform.tenant.create',
          outcome: 'succeeded',
          targetType: 'tenant',
          targetId: created.id,
          targetTenantId: created.id,
          metadata: { organization_type: command.organizationType },
        })
        return created.id
      })
      return this.readTenant(tenantId)
    } catch (error) {
      if (this.postgresCode(error) === '23505') {
        throw new ConflictException('Tenant slug is already in use')
      }
      throw error
    }
  }

  async updateTenant(
    tenantId: string,
    command: UpdatePlatformTenantCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformTenantSummary> {
    await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, tenantId)
      const [updated] = await tx
        .update(tenants)
        .set({
          ...(command.name !== undefined ? { name: command.name } : {}),
          ...(command.organizationType !== undefined
            ? { organization_type: command.organizationType }
            : {}),
          ...(command.pcabLicense !== undefined
            ? { pcab_license: command.pcabLicense }
            : {}),
          ...(command.birTin !== undefined ? { bir_tin: command.birTin } : {}),
          ...(command.dpoContact !== undefined
            ? { dpo_contact: command.dpoContact }
            : {}),
          updated_at: new Date(),
        })
        .where(eq(tenants.id, tenantId))
        .returning({ id: tenants.id })
      if (!updated) throw new NotFoundException('Tenant not found')
      await this.writeAudit(tx, principal, {
        action: 'platform.tenant.configure',
        outcome: 'succeeded',
        targetType: 'tenant',
        targetId: tenantId,
        targetTenantId: tenantId,
        metadata: { changed_fields: Object.keys(command).sort() },
      })
    })
    return this.readTenant(tenantId)
  }

  async updateTenantStatus(
    tenantId: string,
    command: UpdatePlatformTenantStatusCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformTenantSummary> {
    try {
      await this.database.client.transaction(async (tx) => {
        await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, tenantId)
        const [updated] = await tx
          .update(tenants)
          .set({
            status: command.status,
            status_reason: command.status === 'active' ? null : command.reason,
            status_changed_at: command.status === 'active' ? null : new Date(),
            status_changed_by:
              command.status === 'active' ? null : principal.userId,
            updated_at: new Date(),
          })
          .where(eq(tenants.id, tenantId))
          .returning({ id: tenants.id })
        if (!updated) throw new NotFoundException('Tenant not found')
        await this.writeAudit(tx, principal, {
          action: 'platform.tenant.status',
          outcome: 'succeeded',
          targetType: 'tenant',
          targetId: tenantId,
          targetTenantId: tenantId,
          metadata: { status: command.status, reason: command.reason },
        })
      })
    } catch (error) {
      if (this.postgresCode(error) === '42501') {
        throw new ForbiddenException(
          'The tenant containing the active platform owner cannot be deactivated'
        )
      }
      throw error
    }
    return this.readTenant(tenantId)
  }

  async listUsers(
    query: PlatformListQuery
  ): Promise<PlatformPagedResult<PlatformUserSummary>> {
    const conditions = []
    if (query.q) {
      const term = `%${query.q}%`
      const search = or(
        ilike(users.email, term),
        ilike(users.full_name, term),
        ilike(tenants.name, term)
      )
      if (search) conditions.push(search)
    }
    if (query.status) {
      conditions.push(
        eq(
          users.account_status,
          query.status as 'invited' | 'active' | 'suspended' | 'disabled'
        )
      )
    }
    const where = conditions.length ? and(...conditions) : undefined
    const offset = (query.page - 1) * query.limit
    const [rows, totals] = await Promise.all([
      this.database.client
        .select({
          id: users.id,
          tenantId: users.tenant_id,
          tenantName: tenants.name,
          email: users.email,
          fullName: users.full_name,
          role: users.role,
          status: users.account_status,
          statusReason: users.status_reason,
          invitedAt: users.invited_at,
          lastActiveAt: users.last_active_at,
          createdAt: users.created_at,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenant_id))
        .where(where)
        .orderBy(asc(users.email))
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ value: count() })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenant_id))
        .where(where),
    ])
    return pageResult(
      rows.map((row) => ({
        ...row,
        invitedAt: row.invitedAt?.toISOString() ?? null,
        lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      query,
      Number(totals[0]?.value ?? 0)
    )
  }

  async listInvitations(
    query: PlatformListQuery
  ): Promise<PlatformPagedResult<PlatformInvitationSummary>> {
    const conditions = []
    if (query.q) {
      const term = `%${query.q}%`
      const search = or(
        ilike(platformUserInvitations.normalized_email, term),
        ilike(platformUserInvitations.full_name, term),
        ilike(tenants.name, term)
      )
      if (search) conditions.push(search)
    }
    if (query.status) {
      conditions.push(
        eq(
          platformUserInvitations.status,
          query.status as 'pending' | 'sent' | 'accepted' | 'revoked' | 'failed'
        )
      )
    }
    const where = conditions.length ? and(...conditions) : undefined
    const offset = (query.page - 1) * query.limit
    const [rows, totals] = await Promise.all([
      this.database.client
        .select({
          id: platformUserInvitations.id,
          tenantId: platformUserInvitations.tenant_id,
          tenantName: tenants.name,
          email: platformUserInvitations.normalized_email,
          fullName: platformUserInvitations.full_name,
          role: platformUserInvitations.role,
          status: platformUserInvitations.status,
          createdAt: platformUserInvitations.created_at,
          sentAt: platformUserInvitations.sent_at,
          acceptedAt: platformUserInvitations.accepted_at,
          revokedAt: platformUserInvitations.revoked_at,
          failureReason: platformUserInvitations.failure_reason,
        })
        .from(platformUserInvitations)
        .innerJoin(tenants, eq(tenants.id, platformUserInvitations.tenant_id))
        .where(where)
        .orderBy(desc(platformUserInvitations.created_at))
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ value: count() })
        .from(platformUserInvitations)
        .innerJoin(tenants, eq(tenants.id, platformUserInvitations.tenant_id))
        .where(where),
    ])
    return pageResult(
      rows.map((row) => this.invitationResult(row)),
      query,
      Number(totals[0]?.value ?? 0)
    )
  }

  async inviteUser(
    command: InvitePlatformUserCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformInvitationSummary> {
    const invitationId = await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, command.tenantId)
      const [tenant] = await tx
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, command.tenantId))
        .limit(1)
        .for('update')
      if (!tenant) throw new NotFoundException('Tenant not found')
      if (tenant.status !== 'active') {
        throw new ConflictException('Users can be invited only to an active tenant')
      }
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, command.email))
        .limit(1)
      if (existing) throw new ConflictException('A user with this email already exists')
      const [created] = await tx
        .insert(platformUserInvitations)
        .values({
          tenant_id: command.tenantId,
          normalized_email: command.email,
          full_name: command.fullName,
          role: command.role,
          invited_by: principal.userId,
        })
        .returning({ id: platformUserInvitations.id })
      if (!created) throw new InternalServerErrorException('Invitation was not created')
      await this.writeAudit(tx, principal, {
        action: 'platform.user.invitation_intent',
        outcome: 'succeeded',
        targetType: 'user_invitation',
        targetId: created.id,
        targetTenantId: command.tenantId,
        metadata: { role: command.role },
      })
      return created.id
    })

    try {
      const authUserId = await this.identity.invite(command.email)
      const invitation = await this.readInvitation(invitationId)
      if (invitation.status !== 'sent') {
        throw new ServiceUnavailableException(
          'The authentication provider did not bind the invitation'
        )
      }
      await this.database.client.transaction(async (tx) => {
        await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, command.tenantId)
        await this.writeAudit(tx, principal, {
          action: 'platform.user.invite',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: authUserId,
          targetTenantId: command.tenantId,
          metadata: { invitation_id: invitationId, role: command.role },
        })
      })
      return invitation
    } catch (error) {
      await this.recordInvitationFailure(invitationId, command.tenantId, principal)
      throw error
    }
  }

  async resendInvitation(
    invitationId: string,
    principal: PlatformPrincipal
  ): Promise<PlatformInvitationSummary> {
    const invitation = await this.readInvitation(invitationId)
    await this.checkSupportContext(principal, invitation.tenantId)
    if (invitation.status !== 'sent') {
      throw new ConflictException('Only a sent invitation can be resent')
    }
    await this.identity.resendInvitation(invitation.email)
    await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, invitation.tenantId)
      await tx
        .update(platformUserInvitations)
        .set({ sent_at: new Date(), failure_reason: null })
        .where(eq(platformUserInvitations.id, invitationId))
      await this.writeAudit(tx, principal, {
        action: 'platform.user.invitation_resend',
        outcome: 'succeeded',
        targetType: 'user_invitation',
        targetId: invitationId,
        targetTenantId: invitation.tenantId,
      })
    })
    return this.readInvitation(invitationId)
  }

  async revokeInvitation(
    invitationId: string,
    principal: PlatformPrincipal
  ): Promise<PlatformInvitationSummary> {
    const invitation = await this.readInvitationRecord(invitationId)
    await this.checkSupportContext(principal, invitation.tenantId)
    if (!['pending', 'sent'].includes(invitation.status)) {
      throw new ConflictException('Only an open invitation can be revoked')
    }
    if (invitation.authUserId) {
      await this.identity.setSuspended(invitation.authUserId, true)
    }
    try {
      await this.database.client.transaction(async (tx) => {
        await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, invitation.tenantId)
        await tx
          .update(platformUserInvitations)
          .set({ status: 'revoked', revoked_at: new Date() })
          .where(eq(platformUserInvitations.id, invitationId))
        if (invitation.authUserId) {
          await tx
            .update(users)
            .set({
              account_status: 'disabled',
              status_reason: 'Invitation revoked',
              status_changed_at: new Date(),
              status_changed_by: principal.userId,
              updated_at: new Date(),
            })
            .where(eq(users.id, invitation.authUserId))
        }
        await this.writeAudit(tx, principal, {
          action: 'platform.user.invitation_revoke',
          outcome: 'succeeded',
          targetType: 'user_invitation',
          targetId: invitationId,
          targetTenantId: invitation.tenantId,
        })
      })
    } catch (error) {
      if (invitation.authUserId) {
        await this.identity.setSuspended(invitation.authUserId, false).catch(() => undefined)
      }
      throw error
    }
    return this.readInvitation(invitationId)
  }

  async updateUserRole(
    userId: string,
    command: UpdatePlatformUserRoleCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformUserSummary> {
    await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      await this.ensureNotPlatformOwner(tx, userId)
      const [target] = await tx.select({ tenantId: users.tenant_id }).from(users).where(eq(users.id, userId)).limit(1).for('update')
      if (!target) throw new NotFoundException('User not found')
      await this.requireSupportContext(tx, principal, target.tenantId)
      const [updated] = await tx
        .update(users)
        .set({ role: command.role, updated_at: new Date() })
        .where(eq(users.id, userId))
        .returning({ tenantId: users.tenant_id })
      if (!updated) throw new NotFoundException('User not found')
      await this.writeAudit(tx, principal, {
        action: 'platform.user.role',
        outcome: 'succeeded',
        targetType: 'user',
        targetId: userId,
        targetTenantId: updated.tenantId,
        metadata: { role: command.role },
      })
    })
    return this.readUser(userId)
  }

  async updateUserStatus(
    userId: string,
    command: UpdatePlatformUserStatusCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformUserSummary> {
    const user = await this.readUser(userId)
    await this.checkSupportContext(principal, user.tenantId)
    if (user.id === principal.userId) {
      throw new ForbiddenException('The platform owner cannot change their own lifecycle')
    }
    const suspended = command.status !== 'active'
    await this.identity.setSuspended(userId, suspended)
    try {
      await this.database.client.transaction(async (tx) => {
        await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, user.tenantId)
        await this.ensureNotPlatformOwner(tx, userId)
        await tx
          .update(users)
          .set({
            account_status: command.status,
            status_reason: command.status === 'active' ? null : command.reason,
            status_changed_at: command.status === 'active' ? null : new Date(),
            status_changed_by:
              command.status === 'active' ? null : principal.userId,
            updated_at: new Date(),
          })
          .where(eq(users.id, userId))
        await this.writeAudit(tx, principal, {
          action: 'platform.user.status',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: userId,
          targetTenantId: user.tenantId,
          metadata: { status: command.status, reason: command.reason },
        })
      })
    } catch (error) {
      await this.identity.setSuspended(userId, user.status === 'suspended' || user.status === 'disabled').catch(() => undefined)
      throw error
    }
    return this.readUser(userId)
  }

  async sendPasswordReset(
    userId: string,
    principal: PlatformPrincipal
  ): Promise<{ ok: true }> {
    const user = await this.readUser(userId)
    await this.checkSupportContext(principal, user.tenantId)
    await this.identity.sendPasswordReset(user.email)
    await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, user.tenantId)
      await this.writeAudit(tx, principal, {
        action: 'platform.user.password_reset',
        outcome: 'succeeded',
        targetType: 'user',
        targetId: userId,
        targetTenantId: user.tenantId,
      })
    })
    return { ok: true }
  }

  roles(): PlatformRoleSummary[] {
    return ERP_ROLES.map((role) => ({
      role,
      capabilities: ERP_CAPABILITIES.filter((capability) =>
        ERP_CAPABILITY_ROLES[capability].includes(role)
      ),
      platformAccess: false,
    }))
  }

  async analytics(): Promise<PlatformAnalyticsResult> {
    const [tenantRows, userRows, projectRows, opportunityRows] =
      await Promise.all([
        this.database.client.select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${tenants.status} = 'active')::int`,
          suspended: sql<number>`count(*) filter (where ${tenants.status} = 'suspended')::int`,
          disabled: sql<number>`count(*) filter (where ${tenants.status} = 'disabled')::int`,
        }).from(tenants),
        this.database.client.select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${users.account_status} = 'active')::int`,
          invited: sql<number>`count(*) filter (where ${users.account_status} = 'invited')::int`,
          suspended: sql<number>`count(*) filter (where ${users.account_status} = 'suspended')::int`,
          disabled: sql<number>`count(*) filter (where ${users.account_status} = 'disabled')::int`,
        }).from(users),
        this.database.client.select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${projects.deleted_at} is null and ${projects.status} = 'active')::int`,
        }).from(projects),
        this.database.client.select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${opportunities.stage} not in ('won', 'lost', 'closed_won', 'closed_lost'))::int`,
        }).from(opportunities),
      ])
    const tenant = tenantRows[0]
    const user = userRows[0]
    const project = projectRows[0]
    const opportunity = opportunityRows[0]
    return {
      tenants: {
        total: Number(tenant?.total ?? 0),
        active: Number(tenant?.active ?? 0),
        suspended: Number(tenant?.suspended ?? 0),
        disabled: Number(tenant?.disabled ?? 0),
      },
      users: {
        total: Number(user?.total ?? 0),
        active: Number(user?.active ?? 0),
        invited: Number(user?.invited ?? 0),
        suspended: Number(user?.suspended ?? 0),
        disabled: Number(user?.disabled ?? 0),
      },
      projects: {
        total: Number(project?.total ?? 0),
        active: Number(project?.active ?? 0),
      },
      opportunities: {
        total: Number(opportunity?.total ?? 0),
        open: Number(opportunity?.open ?? 0),
      },
      generatedAt: new Date().toISOString(),
    }
  }

  async operationalAnalytics(): Promise<PlatformOperationalAnalyticsResult> {
    const [documentRows, kycRows, documentJobs, generationJobs, indexJobs, privilegedRows] = await Promise.all([
      this.database.client.select({
        total: sql<number>`count(*)::int`,
        bytes: sql<string>`coalesce(sum(${documents.size_bytes}), 0)::text`,
      }).from(documents),
      this.database.client.select({
        pendingTracks: sql<number>`count(*) filter (where ${opportunityKycTracks.status} in ('pending', 'in_review'))::int`,
        overdueTracks: sql<number>`count(*) filter (where ${opportunityKycTracks.status} in ('pending', 'in_review') and ${opportunityKycTracks.due_at} < now())::int`,
        flaggedTracks: sql<number>`count(*) filter (where ${opportunityKycTracks.status} = 'flagged')::int`,
      }).from(opportunityKycTracks),
      this.database.client.select({ total: count() }).from(documentProcessingJobs).where(eq(documentProcessingJobs.status, 'failed')),
      this.database.client.select({ total: count() }).from(cortexAssistantGenerationJobs).where(eq(cortexAssistantGenerationJobs.status, 'failed')),
      this.database.client.select({ total: count() }).from(cortexSemanticIndexJobs).where(eq(cortexSemanticIndexJobs.status, 'failed')),
      this.database.client.select({
        failed: sql<number>`count(*) filter (where ${platformAuditEvents.outcome} = 'failed')::int`,
        denied: sql<number>`count(*) filter (where ${platformAuditEvents.outcome} = 'denied')::int`,
      }).from(platformAuditEvents),
    ])
    return {
      documents: { total: documentRows[0]?.total ?? 0, bytes: documentRows[0]?.bytes ?? '0' },
      kyc: kycRows[0] ?? { pendingTracks: 0, overdueTracks: 0, flaggedTracks: 0 },
      jobs: {
        documentFailed: documentJobs[0]?.total ?? 0,
        generationFailed: generationJobs[0]?.total ?? 0,
        indexFailed: indexJobs[0]?.total ?? 0,
      },
      privileged: privilegedRows[0] ?? { failed: 0, denied: 0 },
      generatedAt: new Date().toISOString(),
    }
  }

  async listAudit(
    query: PlatformListQuery
  ): Promise<PlatformPagedResult<PlatformAuditSummary>> {
    const conditions = []
    if (query.q) {
      const term = `%${query.q}%`
      const search = or(
        ilike(platformAuditEvents.action, term),
        ilike(platformAuditEvents.target_type, term),
        ilike(platformAuditEvents.target_id, term)
      )
      if (search) conditions.push(search)
    }
    if (query.status) conditions.push(eq(platformAuditEvents.outcome, query.status))
    const where = conditions.length ? and(...conditions) : undefined
    const offset = (query.page - 1) * query.limit
    const [rows, totals] = await Promise.all([
      this.database.client
        .select()
        .from(platformAuditEvents)
        .where(where)
        .orderBy(desc(platformAuditEvents.created_at))
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ value: count() })
        .from(platformAuditEvents)
        .where(where),
    ])
    return pageResult(
      rows.map((row) => this.auditResult(row)),
      query,
      Number(totals[0]?.value ?? 0)
    )
  }

  integrations(): PlatformDependencyStatus[] {
    return [
      this.dependency('supabase-auth', 'Supabase Auth administration', this.identity.configured()),
      this.dependency('redis', 'Redis job coordination', Boolean(this.config.get<string>('REDIS_URL'))),
      this.dependency(
        'resend',
        'Resend email delivery',
        Boolean(this.config.get<string>('RESEND_API_KEY')) &&
          Boolean(this.config.get<string>('EMAIL_FROM'))
      ),
      this.dependency('cad-parser', 'Railway CAD parser', Boolean(this.config.get<string>('DXF_PARSER_URL'))),
      this.dependency('ai-worker', 'Railway AI worker', Boolean(this.config.get<string>('AI_WORKER_URL'))),
    ]
  }

  systemHealth(): PlatformSystemHealthResult {
    return {
      api: 'available',
      database: 'available',
      dependencies: this.integrations(),
      generatedAt: new Date().toISOString(),
    }
  }

  async startSupportSession(
    command: CreatePlatformSupportSessionCommand,
    principal: PlatformPrincipal
  ): Promise<PlatformSupportSessionResult> {
    const sessionId = await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      const [tenant] = await tx
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, command.tenantId))
        .limit(1)
      if (!tenant) throw new NotFoundException('Tenant not found')
      await tx
        .update(platformSupportSessions)
        .set({ ended_at: new Date() })
        .where(
          and(
            eq(platformSupportSessions.actor_id, principal.userId),
            isNull(platformSupportSessions.ended_at)
          )
        )
      const expiresAt = new Date(Date.now() + command.durationMinutes * 60_000)
      const [created] = await tx
        .insert(platformSupportSessions)
        .values({
          actor_id: principal.userId,
          tenant_id: command.tenantId,
          reason: command.reason,
          expires_at: expiresAt,
        })
        .returning({ id: platformSupportSessions.id })
      if (!created) throw new InternalServerErrorException('Support context was not created')
      await this.writeAudit(tx, principal, {
        action: 'platform.support_context.start',
        outcome: 'succeeded',
        targetType: 'support_session',
        targetId: created.id,
        targetTenantId: command.tenantId,
        metadata: { duration_minutes: command.durationMinutes, reason: command.reason },
      })
      return created.id
    })
    return this.readSupportSession(sessionId, principal.userId)
  }

  async endSupportSession(
    sessionId: string,
    principal: PlatformPrincipal
  ): Promise<PlatformSupportSessionResult> {
    if (principal.supportSessionId !== sessionId) throw new ForbiddenException('Support context does not match this browser session')
    await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      const [ended] = await tx
        .update(platformSupportSessions)
        .set({ ended_at: new Date() })
        .where(
          and(
            eq(platformSupportSessions.id, sessionId),
            eq(platformSupportSessions.actor_id, principal.userId),
            isNull(platformSupportSessions.ended_at)
          )
        )
        .returning({ tenantId: platformSupportSessions.tenant_id })
      if (!ended) throw new NotFoundException('Active support context not found')
      await this.writeAudit(tx, principal, {
        action: 'platform.support_context.end',
        outcome: 'succeeded',
        targetType: 'support_session',
        targetId: sessionId,
        targetTenantId: ended.tenantId,
      })
    })
    return this.readSupportSession(sessionId, principal.userId)
  }

  private async readTenant(tenantId: string): Promise<PlatformTenantSummary> {
    const [row] = await this.database.client
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        organizationType: tenants.organization_type,
        status: tenants.status,
        statusReason: tenants.status_reason,
        createdAt: tenants.created_at,
        updatedAt: tenants.updated_at,
        userCount: sql<number>`(
          select count(*)::int from public.users as tenant_user
          where tenant_user.tenant_id = "tenants"."id"
        )`,
        activeUserCount: sql<number>`(
          select count(*)::int from public.users as tenant_user
          where tenant_user.tenant_id = "tenants"."id"
            and tenant_user.account_status = 'active'
        )`,
        projectCount: sql<number>`(
          select count(*)::int from public.projects as tenant_project
          where tenant_project.tenant_id = "tenants"."id"
            and tenant_project.deleted_at is null
        )`,
        lastActivityAt: sql<Date | null>`(
          select max(entry.created_at) from public.audit_log as entry
          where entry.tenant_id = "tenants"."id"
        )`,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!row) throw new NotFoundException('Tenant not found')
    return {
      ...row,
      userCount: Number(row.userCount),
      activeUserCount: Number(row.activeUserCount),
      projectCount: Number(row.projectCount),
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private async readUser(userId: string): Promise<PlatformUserSummary> {
    const [row] = await this.database.client
      .select({
        id: users.id,
        tenantId: users.tenant_id,
        tenantName: tenants.name,
        email: users.email,
        fullName: users.full_name,
        role: users.role,
        status: users.account_status,
        statusReason: users.status_reason,
        invitedAt: users.invited_at,
        lastActiveAt: users.last_active_at,
        createdAt: users.created_at,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenant_id))
      .where(eq(users.id, userId))
      .limit(1)
    if (!row) throw new NotFoundException('User not found')
    return {
      ...row,
      invitedAt: row.invitedAt?.toISOString() ?? null,
      lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private async readInvitation(invitationId: string): Promise<PlatformInvitationSummary> {
    const record = await this.readInvitationRecord(invitationId)
    return this.invitationResult(record)
  }

  private async readInvitationRecord(invitationId: string) {
    const [row] = await this.database.client
      .select({
        id: platformUserInvitations.id,
        tenantId: platformUserInvitations.tenant_id,
        tenantName: tenants.name,
        email: platformUserInvitations.normalized_email,
        fullName: platformUserInvitations.full_name,
        role: platformUserInvitations.role,
        status: platformUserInvitations.status,
        authUserId: platformUserInvitations.auth_user_id,
        createdAt: platformUserInvitations.created_at,
        sentAt: platformUserInvitations.sent_at,
        acceptedAt: platformUserInvitations.accepted_at,
        revokedAt: platformUserInvitations.revoked_at,
        failureReason: platformUserInvitations.failure_reason,
      })
      .from(platformUserInvitations)
      .innerJoin(tenants, eq(tenants.id, platformUserInvitations.tenant_id))
      .where(eq(platformUserInvitations.id, invitationId))
      .limit(1)
    if (!row) throw new NotFoundException('Invitation not found')
    return row
  }

  private invitationResult(
    row: InvitationResultRow
  ): PlatformInvitationSummary {
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      failureReason: row.failureReason,
    }
  }

  private async readSupportSession(
    sessionId: string,
    actorId: string
  ): Promise<PlatformSupportSessionResult> {
    const [row] = await this.database.client
      .select({
        id: platformSupportSessions.id,
        tenantId: platformSupportSessions.tenant_id,
        tenantName: tenants.name,
        reason: platformSupportSessions.reason,
        createdAt: platformSupportSessions.created_at,
        expiresAt: platformSupportSessions.expires_at,
        endedAt: platformSupportSessions.ended_at,
      })
      .from(platformSupportSessions)
      .innerJoin(tenants, eq(tenants.id, platformSupportSessions.tenant_id))
      .where(
        and(
          eq(platformSupportSessions.id, sessionId),
          eq(platformSupportSessions.actor_id, actorId)
        )
      )
      .limit(1)
    if (!row) throw new NotFoundException('Support context not found')
    return this.supportResult(row)
  }

  private supportResult(row: {
    id: string
    tenantId: string
    tenantName: string
    reason: string
    createdAt: Date
    expiresAt: Date
    endedAt: Date | null
  }): PlatformSupportSessionResult {
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
    }
  }

  private auditResult(row: typeof platformAuditEvents.$inferSelect): PlatformAuditSummary {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null
    return {
      id: row.id,
      traceId: row.trace_id,
      actorId: row.actor_id,
      action: row.action,
      outcome: row.outcome as 'succeeded' | 'denied' | 'failed',
      targetType: row.target_type,
      targetId: row.target_id,
      targetTenantId: row.target_tenant_id,
      metadata,
      createdAt: row.created_at.toISOString(),
    }
  }

  private dependency(
    key: string,
    label: string,
    configured: boolean
  ): PlatformDependencyStatus {
    return {
      key,
      label,
      status: configured ? 'configured' : 'unavailable',
      detail: configured
        ? 'Configuration is present; live provider telemetry is not instrumented.'
        : 'Configuration is absent or unavailable to this service.',
    }
  }

  private async lockOwner(
    tx: DatabaseTransaction,
    principal: PlatformPrincipal
  ): Promise<void> {
    const [owner] = await tx
      .select({ userId: platformRoleAssignments.user_id })
      .from(platformRoleAssignments)
      .innerJoin(users, eq(users.id, platformRoleAssignments.user_id))
      .where(
        and(
          eq(platformRoleAssignments.user_id, principal.userId),
          eq(platformRoleAssignments.normalized_email, principal.email),
          isNull(platformRoleAssignments.revoked_at),
          eq(users.account_status, 'active')
        )
      )
      .limit(1)
      .for('update')
    if (!owner) throw new ForbiddenException()
  }

  private async requireSupportContext(
    tx: DatabaseTransaction,
    principal: PlatformPrincipal,
    tenantId: string
  ): Promise<void> {
    if (!principal.supportSessionId) {
      throw new ForbiddenException('Enter support context for this tenant before making changes')
    }
    const [session] = await tx.select({ id: platformSupportSessions.id })
      .from(platformSupportSessions)
      .where(and(
        eq(platformSupportSessions.id, principal.supportSessionId),
        eq(platformSupportSessions.actor_id, principal.userId),
        eq(platformSupportSessions.tenant_id, tenantId),
        isNull(platformSupportSessions.ended_at),
        sql`${platformSupportSessions.expires_at} > clock_timestamp()`
      ))
      .limit(1).for('share')
    if (!session) throw new ForbiddenException('Support context is missing, expired, ended, or belongs to another tenant')
  }

  private async checkSupportContext(principal: PlatformPrincipal, tenantId: string): Promise<void> {
    await this.database.client.transaction(async (tx) => {
      await this.lockOwner(tx, principal)
      await this.requireSupportContext(tx, principal, tenantId)
    })
  }

  private async ensureNotPlatformOwner(
    tx: DatabaseTransaction,
    userId: string
  ): Promise<void> {
    const [owner] = await tx
      .select({ userId: platformRoleAssignments.user_id })
      .from(platformRoleAssignments)
      .where(
        and(
          eq(platformRoleAssignments.user_id, userId),
          isNull(platformRoleAssignments.revoked_at)
        )
      )
      .limit(1)
    if (owner) {
      throw new ForbiddenException(
        'The active platform owner cannot be demoted, suspended, or disabled'
      )
    }
  }

  private async writeAudit(
    tx: DatabaseTransaction,
    principal: PlatformPrincipal,
    input: AuditInput
  ): Promise<void> {
    await tx.insert(platformAuditEvents).values({
      trace_id: principal.traceId ?? randomUUID(),
      actor_id: principal.userId,
      action: input.action,
      outcome: input.outcome,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      target_tenant_id: input.targetTenantId ?? null,
      metadata: input.metadata ?? null,
    })
  }

  private async recordInvitationFailure(
    invitationId: string,
    tenantId: string,
    principal: PlatformPrincipal
  ): Promise<void> {
    await this.database.client.transaction(async (tx) => {
      await tx
        .update(platformUserInvitations)
        .set({
          status: 'failed',
          failure_reason: 'Authentication provider invitation failed',
        })
        .where(eq(platformUserInvitations.id, invitationId))
      await this.writeAudit(tx, principal, {
        action: 'platform.user.invite',
        outcome: 'failed',
        targetType: 'user_invitation',
        targetId: invitationId,
        targetTenantId: tenantId,
      })
    })
  }

  private postgresCode(error: unknown): string | undefined {
    return databaseErrorCode(error)
  }
}
