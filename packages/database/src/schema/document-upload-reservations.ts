import { bigint, boolean, char, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// Constraints, composite foreign keys and transition guards are maintained by
// 20260824110438 and the controlled-upload migration.
export const documentUploadReservationState = pgEnum('document_upload_reservation_state', ['active', 'completed', 'released', 'expired'])
export const documentUploadReservations = pgTable('document_upload_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  project_id: uuid('project_id').notNull(),
  actor_id: uuid('actor_id').notNull(),
  storage_path: text('storage_path').notNull(),
  original_file_name: varchar('original_file_name', { length: 255 }).notNull(),
  description: varchar('description', { length: 2000 }),
  declared_size_bytes: bigint('declared_size_bytes', { mode: 'number' }).notNull(),
  declared_content_type: varchar('declared_content_type', { length: 127 }).notNull(),
  idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
  request_hash: char('request_hash', { length: 64 }).notNull(),
  state: documentUploadReservationState('state').notNull().default('active'),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  document_id: uuid('document_id'),
  terminal_at: timestamp('terminal_at', { withTimezone: true }),
  cleanup_attempt_count: integer('cleanup_attempt_count').notNull().default(0),
  cleanup_claimed_at: timestamp('cleanup_claimed_at', { withTimezone: true }),
  cleanup_completed_at: timestamp('cleanup_completed_at', { withTimezone: true }),
  cleanup_last_error_code: varchar('cleanup_last_error_code', { length: 64 }),
  upload_sha256: char('upload_sha256', { length: 64 }),
  core_controlled: boolean('core_controlled').notNull().default(false),
  upload_started_at: timestamp('upload_started_at', { withTimezone: true }),
  upload_settled_at: timestamp('upload_settled_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
export type DocumentUploadReservation = typeof documentUploadReservations.$inferSelect
