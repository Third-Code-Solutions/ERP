import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { roleEnum } from './enums'
import { tenants } from './tenants'
import { users } from './users'

/**
 * ADR-030 server-only, short-lived invitation authority. The opaque token is
 * intentionally absent: only its SHA-256 hash is persisted and it must never
 * be included in logs, audit diffs, or a browser response.
 */
export const tenantInvitationIntents = pgTable(
  'tenant_invitation_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invited_email: varchar('invited_email', { length: 255 }).notNull(),
    invited_role: roleEnum('invited_role').notNull(),
    invited_by: uuid('invited_by').notNull(),
    created_by: uuid('created_by').notNull(),
    token_hash: varchar('token_hash', { length: 64 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    consumed_by_user_id: uuid('consumed_by_user_id'),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_by: uuid('revoked_by'),
    revocation_reason: text('revocation_reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_tenant_invitation_intents_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantStateIdx: index('idx_tenant_invitation_intents_tenant_state').on(
      table.tenant_id,
      table.invited_email,
      table.expires_at,
      table.created_at
    ),
    inviterIdx: index('idx_tenant_invitation_intents_invited_by').on(
      table.tenant_id,
      table.invited_by,
      table.created_at
    ),
    creatorIdx: index('idx_tenant_invitation_intents_created_by').on(
      table.tenant_id,
      table.created_by,
      table.created_at
    ),
    revokerIdx: index('idx_tenant_invitation_intents_revoked_by')
      .on(table.tenant_id, table.revoked_by)
      .where(sql`${table.revoked_by} is not null`),
    inviterTenantFk: foreignKey({
      name: 'tenant_invitation_intents_tenant_invited_by_fk',
      columns: [table.tenant_id, table.invited_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    creatorTenantFk: foreignKey({
      name: 'tenant_invitation_intents_tenant_created_by_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    revokerTenantFk: foreignKey({
      name: 'tenant_invitation_intents_tenant_revoked_by_fk',
      columns: [table.tenant_id, table.revoked_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    tokenHashUniqueIdx: uniqueIndex(
      'ux_tenant_invitation_intents_token_hash'
    ).on(table.token_hash),
    consumedAuthUserUniqueIdx: uniqueIndex(
      'ux_tenant_invitation_intents_consumed_auth_user'
    )
      .on(table.consumed_by_user_id)
      .where(sql`${table.consumed_by_user_id} is not null`),
    activeEmailUniqueIdx: uniqueIndex(
      'ux_tenant_invitation_intents_active_email'
    )
      .on(table.invited_email)
      .where(sql`${table.consumed_at} is null and ${table.revoked_at} is null`),
    inviterIsCreatorCheck: check(
      'tenant_invitation_intents_inviter_is_creator',
      sql`${table.invited_by} = ${table.created_by}`
    ),
    emailNormalizedCheck: check(
      'tenant_invitation_intents_email_normalized',
      sql`${table.invited_email} = lower(btrim(${table.invited_email}))
        and length(${table.invited_email}) between 3 and 255
        and position('@' in ${table.invited_email}) > 1`
    ),
    tokenHashHexCheck: check(
      'tenant_invitation_intents_token_hash_hex',
      sql`${table.token_hash} ~ '^[0-9a-f]{64}$'`
    ),
    expiryWindowCheck: check(
      'tenant_invitation_intents_expiry_window',
      sql`${table.expires_at} > ${table.created_at}
        and ${table.expires_at} <= ${table.created_at} + interval '24 hours'`
    ),
    consumptionPairCheck: check(
      'tenant_invitation_intents_consumption_pair',
      sql`(${table.consumed_at} is null and ${table.consumed_by_user_id} is null)
        or (${table.consumed_at} is not null and ${table.consumed_by_user_id} is not null)`
    ),
    terminalStateCheck: check(
      'tenant_invitation_intents_terminal_state',
      sql`not (${table.consumed_at} is not null and ${table.revoked_at} is not null)`
    ),
    revocationActorCheck: check(
      'tenant_invitation_intents_revocation_actor',
      sql`(${table.revoked_at} is null and ${table.revoked_by} is null and ${table.revocation_reason} is null)
        or (${table.revoked_at} is not null and ${table.revoked_by} is not null
          and ${table.revocation_reason} = btrim(${table.revocation_reason})
          and length(${table.revocation_reason}) > 0)`
    ),
  })
)

export type TenantInvitationIntent = typeof tenantInvitationIntents.$inferSelect
export type TenantInvitationIntentInsert =
  typeof tenantInvitationIntents.$inferInsert
