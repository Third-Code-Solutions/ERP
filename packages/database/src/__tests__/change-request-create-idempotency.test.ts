import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { changeRequestCreateRequests, changeRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260802090000_change_request_create_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Change Request idempotency foundation', () => {
  it('creates tenant-scoped idempotency state and composite request parent', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.change_request_create_requests'
    )
    expect(migrationSql).toContain(
      'ux_change_request_create_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'change_request_create_requests_state_payload'
    )
    expect(migrationSql).toContain('ux_change_requests_tenant_id_id')
  })

  it('keeps browser writes revoked and tenant foreign keys explicit', () => {
    expect(migrationSql).toMatch(
      /change_request_create_requests_change_request_tenant_fk[\s\S]*?foreign key \(tenant_id, change_request_id\)[\s\S]*?references public\.change_requests \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /change_request_create_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.change_request_create_requests enable row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.change_request_create_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned', () => {
    expect(
      getTableConfig(changeRequestCreateRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_change_request_create_requests_tenant_key',
        'idx_change_request_create_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(changeRequestCreateRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'change_request_create_requests_change_request_tenant_fk',
        'change_request_create_requests_created_by_tenant_fk',
      ])
    )
    expect(
      getTableConfig(changeRequests).indexes.map((index) => index.config.name)
    ).toContain('ux_change_requests_tenant_id_id')
  })
})
