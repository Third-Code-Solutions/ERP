import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
  documents,
  documentUploadReservations,
  documentUploadReservationStateEnum,
} from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260824110438_document_upload_reservations.sql',
  ),
  'utf8',
).toLowerCase()
const drizzleSchemaSource = readFileSync(
  resolve(__dirname, '../schema/document-upload-reservations.ts'),
  'utf8',
)

describe('ADR-027 document upload reservation foundation', () => {
  it('uses the exact four-state terminal model and two-hour reservation window', () => {
    expect(documentUploadReservationStateEnum.enumValues).toEqual([
      'active',
      'completed',
      'released',
      'expired',
    ])
    expect(migrationSql).toContain(
      'constraint document_upload_reservations_state_payload',
    )
    expect(migrationSql).toContain(
      "expires_at = created_at + interval '2 hours'",
    )
    expect(migrationSql).toMatch(
      /if old\.state <> 'active'[\s\S]*?terminal document upload reservations are immutable/,
    )
    expect(migrationSql).toContain(
      'document upload reservations must be created active',
    )
    expect(migrationSql).toMatch(
      /elsif new\.state = 'completed' and new\.document_id is null then[\s\S]*?completed document upload reservations require a document/,
    )
    expect(migrationSql).toMatch(
      /old\.state = 'completed'[\s\S]*?old\.document_id is not null[\s\S]*?new\.document_id is null/,
    )
  })

  it('binds reservation, project, actor, and completion document to one tenant', () => {
    expect(migrationSql).toMatch(
      /document_upload_reservations_project_tenant_fk[\s\S]*?foreign key \(tenant_id, project_id\)[\s\S]*?references public\.projects \(tenant_id, id\)/,
    )
    expect(migrationSql).toMatch(
      /document_upload_reservations_actor_tenant_fk[\s\S]*?foreign key \(tenant_id, actor_id\)[\s\S]*?references public\.users \(tenant_id, id\)/,
    )
    expect(migrationSql).toMatch(
      /document_upload_reservations_document_tenant_fk[\s\S]*?foreign key \(tenant_id, project_id, document_id\)[\s\S]*?references public\.documents \(tenant_id, project_id, id\)/,
    )
    expect(migrationSql).toMatch(
      /document_upload_reservations_document_tenant_fk[\s\S]*?on delete set null \(document_id\)/,
    )
    expect(migrationSql).toContain(
      'ux_document_upload_reservations_completed_document',
    )
    expect(migrationSql).toContain('ux_documents_tenant_project_id')

    const documentIndexNames = getTableConfig(documents).indexes.map(
      (index) => index.config.name,
    )
    expect(documentIndexNames).toContain('ux_documents_tenant_project_id')

    const reservationForeignKeys = getTableConfig(
      documentUploadReservations,
    ).foreignKeys.map((foreignKey) => foreignKey.getName())
    expect(reservationForeignKeys).toContain(
      'document_upload_reservations_document_tenant_fk',
    )
    expect(drizzleSchemaSource).toMatch(
      /Drizzle cannot express PostgreSQL's column-list action[\s\S]*?\.onDelete\('no action'\)/,
    )
  })

  it('constrains immutable path, upload metadata, hash, and actor idempotency', () => {
    expect(migrationSql).toContain(
      'ux_document_upload_reservations_tenant_actor_key',
    )
    expect(migrationSql).toContain(
      'constraint document_upload_reservations_storage_path_format',
    )
    expect(migrationSql).toContain(
      "concat(tenant_id::text, '/', project_id::text, '/', id::text, '-')",
    )
    expect(migrationSql).toContain(
      'declared_size_bytes between 1 and 104857600',
    )
    expect(migrationSql).toContain(
      'constraint document_upload_reservations_declared_content_type_normalized',
    )
    expect(migrationSql).toContain(
      'constraint document_upload_reservations_description_bounded',
    )
    expect(migrationSql).toContain("position('..' in storage_path) = 0")
    expect(migrationSql).toContain(
      "request_hash ~ '^[0-9a-f]{64}$'",
    )
    expect(migrationSql).toContain(
      'document upload reservation authority fields are immutable',
    )
  })

  it('has the quota and expiry lookup indexes in both SQL and Drizzle', () => {
    const config = getTableConfig(documentUploadReservations)
    const indexNames = config.indexes.map((index) => index.config.name)

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'ux_document_upload_reservations_tenant_actor_key',
        'ux_document_upload_reservations_storage_path',
        'idx_document_upload_reservations_project',
        'idx_document_upload_reservations_active_project',
        'idx_document_upload_reservations_due_active',
        'idx_document_upload_reservations_terminal_cleanup',
      ]),
    )
    expect(migrationSql).toContain(
      'idx_document_upload_reservations_active_project',
    )
    expect(migrationSql).toContain(
      'idx_document_upload_reservations_due_active',
    )
    expect(migrationSql).toContain(
      'idx_document_upload_reservations_terminal_cleanup',
    )
  })

  it('records bounded, ordered cleanup and reconciliation evidence', () => {
    expect(migrationSql).toContain(
      'cleanup_attempt_count integer not null default 0',
    )
    expect(migrationSql).toContain('cleanup_claimed_at timestamptz')
    expect(migrationSql).toContain('cleanup_completed_at timestamptz')
    expect(migrationSql).toContain(
      'cleanup_last_error_code varchar(64)',
    )
    expect(migrationSql).toContain(
      'constraint document_upload_reservations_cleanup_evidence',
    )
    expect(migrationSql).toContain("state in ('released', 'expired')")
    expect(migrationSql).toMatch(
      /new\.cleanup_attempt_count < old\.cleanup_attempt_count[\s\S]*?cleanup attempt count cannot decrease/,
    )
    expect(migrationSql).toMatch(
      /old\.cleanup_claimed_at is not null[\s\S]*?new\.cleanup_claimed_at is null[\s\S]*?new\.cleanup_claimed_at < old\.cleanup_claimed_at[\s\S]*?cleanup claim cannot be cleared or moved backwards/,
    )
    expect(migrationSql).toMatch(
      /old\.cleanup_completed_at is not null[\s\S]*?new\.cleanup_attempt_count is distinct from old\.cleanup_attempt_count[\s\S]*?new\.cleanup_last_error_code is distinct from old\.cleanup_last_error_code[\s\S]*?completed cleanup evidence is immutable/,
    )
  })

  it('is forced-RLS and unavailable to direct Data API roles', () => {
    expect(migrationSql).toContain(
      'alter table public.document_upload_reservations enable row level security',
    )
    expect(migrationSql).toContain(
      'alter table public.document_upload_reservations force row level security',
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.document_upload_reservations[\s\S]*?from public, anon, authenticated/,
    )
    expect(migrationSql).toMatch(
      /grant select, insert, update on table public\.document_upload_reservations[\s\S]*?to service_role/,
    )
    expect(migrationSql).toMatch(
      /create policy deny_direct_client_access[\s\S]*?for all to anon, authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/,
    )
  })

  it('is additive and creates application objects only in public', () => {
    expect(migrationSql).not.toMatch(
      /\b(drop|truncate)\s+(table|column|index|constraint|trigger|function)\b/,
    )
    expect(migrationSql).not.toMatch(
      /\b(create|alter)\s+(table|index)\s+storage\./,
    )
    expect(migrationSql.trimEnd().endsWith('commit;')).toBe(true)
  })
})
