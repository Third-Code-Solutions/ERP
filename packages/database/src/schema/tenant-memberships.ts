import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { approvalRules } from './process-sla'
import { roleEnum } from './enums'
import { tenants } from './tenants'
import { users } from './users'

/** Dormant lifecycle state; membership authority stays on users in ADR-022 Phase 0. */
export const tenantMembershipStatusEnum = pgEnum('tenant_membership_status', [
  'active',
  'suspended',
  'revoked',
])

/**
 * Additive Phase 0 membership projection. Do not use this table for session or
 * authorization decisions until ADR-022 Phase 2/3 gates have closed.
 */
export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    status: tenantMembershipStatusEnum('status').notNull().default('active'),
    is_default: boolean('is_default').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_tenant_memberships_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantUserUniqueIdx: uniqueIndex('ux_tenant_memberships_tenant_user').on(
      table.tenant_id,
      table.user_id
    ),
    userDefaultUniqueIdx: uniqueIndex(
      'ux_tenant_memberships_user_default'
    )
      .on(table.user_id)
      .where(sql`${table.is_default}`),
    tenantStatusIdx: index('idx_tenant_memberships_tenant_status').on(
      table.tenant_id,
      table.status,
      table.role
    ),
    userStatusIdx: index('idx_tenant_memberships_user_status').on(
      table.user_id,
      table.status
    ),
    defaultRequiresActiveCheck: check(
      'tenant_memberships_default_requires_active',
      sql`not ${table.is_default} or ${table.status} = 'active'`
    ),
  })
)

/**
 * A rule-scoped, time-bounded delegation record. Its presence is not approval
 * authority until the Core evaluator defined by ADR-022 is implemented.
 */
export const approvalDelegations = pgTable(
  'approval_delegations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    delegator_membership_id: uuid('delegator_membership_id').notNull(),
    delegate_membership_id: uuid('delegate_membership_id').notNull(),
    approval_rule_id: uuid('approval_rule_id').notNull(),
    delegation_reason: text('delegation_reason').notNull(),
    effective_from: timestamp('effective_from', { withTimezone: true })
      .notNull()
      .defaultNow(),
    effective_until: timestamp('effective_until', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revocation_reason: text('revocation_reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_approval_delegations_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    delegatorIdx: index('idx_approval_delegations_tenant_delegator').on(
      table.tenant_id,
      table.delegator_membership_id,
      table.effective_from,
      table.effective_until
    ),
    delegateIdx: index('idx_approval_delegations_tenant_delegate').on(
      table.tenant_id,
      table.delegate_membership_id,
      table.effective_from,
      table.effective_until
    ),
    ruleIdx: index('idx_approval_delegations_tenant_rule').on(
      table.tenant_id,
      table.approval_rule_id,
      table.effective_from,
      table.effective_until
    ),
    delegatorMembershipTenantFk: foreignKey({
      name: 'approval_delegations_delegator_membership_tenant_fk',
      columns: [table.tenant_id, table.delegator_membership_id],
      foreignColumns: [tenantMemberships.tenant_id, tenantMemberships.id],
    }).onDelete('restrict'),
    delegateMembershipTenantFk: foreignKey({
      name: 'approval_delegations_delegate_membership_tenant_fk',
      columns: [table.tenant_id, table.delegate_membership_id],
      foreignColumns: [tenantMemberships.tenant_id, tenantMemberships.id],
    }).onDelete('restrict'),
    approvalRuleTenantFk: foreignKey({
      name: 'approval_delegations_rule_tenant_fk',
      columns: [table.tenant_id, table.approval_rule_id],
      foreignColumns: [approvalRules.tenant_id, approvalRules.id],
    }).onDelete('restrict'),
    notSelfCheck: check(
      'approval_delegations_not_self',
      sql`${table.delegator_membership_id} <> ${table.delegate_membership_id}`
    ),
    effectiveWindowCheck: check(
      'approval_delegations_effective_window',
      sql`${table.effective_until} > ${table.effective_from}`
    ),
    reasonNonemptyCheck: check(
      'approval_delegations_reason_nonempty',
      sql`${table.delegation_reason} = btrim(${table.delegation_reason})
        and length(${table.delegation_reason}) > 0`
    ),
    revocationReasonCheck: check(
      'approval_delegations_revocation_reason',
      sql`(
        (${table.revoked_at} is null and ${table.revocation_reason} is null)
        or (
          ${table.revoked_at} is not null
          and ${table.revocation_reason} = btrim(${table.revocation_reason})
          and length(${table.revocation_reason}) > 0
        )
      )`
    ),
  })
)

export type TenantMembership = typeof tenantMemberships.$inferSelect
export type TenantMembershipInsert = typeof tenantMemberships.$inferInsert
export type ApprovalDelegation = typeof approvalDelegations.$inferSelect
export type ApprovalDelegationInsert = typeof approvalDelegations.$inferInsert
