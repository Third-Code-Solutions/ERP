import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { documentUploadReservationStateEnum } from './enums'
import { documents } from './documents'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

/** Server-only quota ledger for immutable-path signed document uploads. */
export const documentUploadReservations = pgTable(
  'document_upload_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    actor_id: uuid('actor_id').notNull(),
    storage_path: text('storage_path').notNull(),
    original_file_name: varchar('original_file_name', { length: 255 }).notNull(),
    description: varchar('description', { length: 2000 }),
    declared_size_bytes: bigint('declared_size_bytes', { mode: 'number' }).notNull(),
    declared_content_type: varchar('declared_content_type', { length: 127 }).notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: documentUploadReservationStateEnum('state')
      .notNull()
      .default('active'),
    expires_at: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '2 hours'`),
    document_id: uuid('document_id'),
    terminal_at: timestamp('terminal_at', { withTimezone: true }),
    cleanup_attempt_count: integer('cleanup_attempt_count').notNull().default(0),
    cleanup_claimed_at: timestamp('cleanup_claimed_at', { withTimezone: true }),
    cleanup_completed_at: timestamp('cleanup_completed_at', { withTimezone: true }),
    cleanup_last_error_code: varchar('cleanup_last_error_code', { length: 64 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_document_upload_reservations_tenant_id_id',
    ).on(table.tenant_id, table.id),
    storagePathUniqueIdx: uniqueIndex(
      'ux_document_upload_reservations_storage_path',
    ).on(table.storage_path),
    tenantActorKeyUniqueIdx: uniqueIndex(
      'ux_document_upload_reservations_tenant_actor_key',
    ).on(table.tenant_id, table.actor_id, table.idempotency_key),
    completedDocumentUniqueIdx: uniqueIndex(
      'ux_document_upload_reservations_completed_document',
    )
      .on(table.tenant_id, table.project_id, table.document_id)
      .where(sql`${table.document_id} is not null`),
    projectIdx: index('idx_document_upload_reservations_project').on(
      table.tenant_id,
      table.project_id,
    ),
    activeProjectIdx: index(
      'idx_document_upload_reservations_active_project',
    )
      .on(table.tenant_id, table.project_id, table.expires_at)
      .where(sql`${table.state} = 'active'`),
    dueActiveIdx: index('idx_document_upload_reservations_due_active')
      .on(table.expires_at, table.id)
      .where(sql`${table.state} = 'active'`),
    terminalCleanupIdx: index(
      'idx_document_upload_reservations_terminal_cleanup',
    )
      .on(table.state, table.terminal_at, table.id)
      .where(
        sql`${table.state} in ('released', 'expired')
          and ${table.cleanup_completed_at} is null`,
      ),
    terminalReconciliationIdx: index(
      'idx_document_upload_reservations_reconcile_terminal',
    )
      .on(table.tenant_id, table.id)
      .where(
        sql`${table.state} in ('released', 'expired')
          and ${table.cleanup_completed_at} is null`,
      ),
    completedReconciliationIdx: index(
      'idx_document_upload_reservations_reconcile_completed',
    )
      .on(table.tenant_id, table.id)
      .where(sql`${table.state} = 'completed'`),
    projectTenantFk: foreignKey({
      name: 'document_upload_reservations_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    actorTenantFk: foreignKey({
      name: 'document_upload_reservations_actor_tenant_fk',
      columns: [table.tenant_id, table.actor_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    documentTenantFk: foreignKey({
      name: 'document_upload_reservations_document_tenant_fk',
      columns: [table.tenant_id, table.project_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.project_id, documents.id],
      // Drizzle cannot express PostgreSQL's column-list action
      // `ON DELETE SET NULL (document_id)`. NO ACTION is the safe model here;
      // the migration is authoritative and preserves tenant_id/project_id while unlinking.
    }).onDelete('no action'),
    storagePathCheck: check(
      'document_upload_reservations_storage_path_format',
      sql`${table.storage_path} = btrim(${table.storage_path})
        and length(${table.storage_path}) between 1 and 2000
        and left(
          ${table.storage_path},
          length(concat(${table.tenant_id}::text, '/', ${table.project_id}::text, '/', ${table.id}::text, '-'))
        ) = concat(${table.tenant_id}::text, '/', ${table.project_id}::text, '/', ${table.id}::text, '-')
        and length(${table.storage_path}) > length(concat(${table.tenant_id}::text, '/', ${table.project_id}::text, '/', ${table.id}::text, '-'))
        and position('/' in substring(
          ${table.storage_path}
          from length(concat(${table.tenant_id}::text, '/', ${table.project_id}::text, '/', ${table.id}::text, '-')) + 1
        )) = 0
        and position(chr(92) in ${table.storage_path}) = 0
        and position('..' in ${table.storage_path}) = 0`,
    ),
    originalFileNameCheck: check(
      'document_upload_reservations_original_file_name_nonempty',
      sql`${table.original_file_name} = btrim(${table.original_file_name})
        and length(${table.original_file_name}) between 1 and 255`,
    ),
    descriptionCheck: check(
      'document_upload_reservations_description_bounded',
      sql`${table.description} is null or (
        ${table.description} = btrim(${table.description})
        and length(${table.description}) between 1 and 2000
      )`,
    ),
    declaredSizeCheck: check(
      'document_upload_reservations_declared_size_limit',
      sql`${table.declared_size_bytes} between 1 and 104857600`,
    ),
    declaredContentTypeCheck: check(
      'document_upload_reservations_declared_content_type_normalized',
      sql`${table.declared_content_type} = lower(btrim(${table.declared_content_type}))
        and ${table.declared_content_type} ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'`,
    ),
    keyCheck: check(
      'document_upload_reservations_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`,
    ),
    hashCheck: check(
      'document_upload_reservations_request_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`,
    ),
    expiryWindowCheck: check(
      'document_upload_reservations_expiry_window',
      sql`${table.expires_at} = ${table.created_at} + interval '2 hours'`,
    ),
    timestampOrderCheck: check(
      'document_upload_reservations_timestamp_order',
      sql`${table.updated_at} >= ${table.created_at}
        and (${table.terminal_at} is null or (
          ${table.terminal_at} >= ${table.created_at}
          and ${table.updated_at} >= ${table.terminal_at}
        ))
        and (${table.cleanup_claimed_at} is null or (
          ${table.terminal_at} is not null
          and ${table.cleanup_claimed_at} >= ${table.terminal_at}
          and ${table.updated_at} >= ${table.cleanup_claimed_at}
        ))
        and (${table.cleanup_completed_at} is null or (
          ${table.cleanup_claimed_at} is not null
          and ${table.cleanup_completed_at} >= ${table.cleanup_claimed_at}
          and ${table.updated_at} >= ${table.cleanup_completed_at}
        ))`,
    ),
    statePayloadCheck: check(
      'document_upload_reservations_state_payload',
      sql`(
        (${table.state} = 'active'
          and ${table.document_id} is null
          and ${table.terminal_at} is null)
        or
        (${table.state} = 'completed'
          and ${table.terminal_at} is not null
          and ${table.terminal_at} < ${table.expires_at})
        or
        (${table.state} = 'released'
          and ${table.document_id} is null
          and ${table.terminal_at} is not null
          and ${table.terminal_at} < ${table.expires_at})
        or
        (${table.state} = 'expired'
          and ${table.document_id} is null
          and ${table.terminal_at} is not null
          and ${table.terminal_at} >= ${table.expires_at})
      )`,
    ),
    cleanupEvidenceCheck: check(
      'document_upload_reservations_cleanup_evidence',
      sql`${table.cleanup_attempt_count} >= 0
        and (${table.cleanup_last_error_code} is null or (
          ${table.cleanup_last_error_code} = btrim(${table.cleanup_last_error_code})
          and length(${table.cleanup_last_error_code}) between 1 and 64
          and ${table.cleanup_last_error_code} ~ '^[A-Z0-9_]+$'
        ))
        and (
          (${table.cleanup_attempt_count} = 0
            and ${table.cleanup_claimed_at} is null
            and ${table.cleanup_completed_at} is null
            and ${table.cleanup_last_error_code} is null)
          or
          (${table.cleanup_attempt_count} > 0
            and ${table.state} in ('released', 'expired')
            and ${table.cleanup_claimed_at} is not null
            and (${table.cleanup_completed_at} is null
              or ${table.cleanup_last_error_code} is null))
        )`,
    ),
  }),
)

export type DocumentUploadReservation =
  typeof documentUploadReservations.$inferSelect
export type DocumentUploadReservationInsert =
  typeof documentUploadReservations.$inferInsert
