import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  changeLogs,
  changeRequestCreateRequests,
  changeRequests,
  designFileVersions,
} from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260813220000_change_request_change_log.sql'),
  'utf8',
).toLowerCase()

describe('client change-request change-log contract', () => {
  it('creates tenant-safe append-only history with audit coverage', () => {
    expect(migrationSql).toContain('create table if not exists public.change_logs')
    expect(migrationSql).toContain('alter table public.change_logs enable row level security')
    expect(migrationSql).toContain('alter table public.change_logs force row level security')
    expect(migrationSql).toContain('create policy change_logs_tenant_read')
    expect(migrationSql).toContain('create trigger audit_change_logs')
    expect(migrationSql).toContain('after insert on public.change_logs')
    expect(migrationSql).toContain('foreign key (tenant_id, change_request_id)')
    expect(migrationSql).toContain('foreign key (tenant_id, design_file_version_id)')
    expect(migrationSql).toContain('foreign key (tenant_id, created_by)')
  })

  it('keeps the Drizzle model aligned with the runtime contract', () => {
    const changeLogConfig = getTableConfig(changeLogs)
    const changeRequestConfig = getTableConfig(changeRequests)
    const versionConfig = getTableConfig(designFileVersions)
    const requestLedgerConfig = getTableConfig(changeRequestCreateRequests)

    expect(changeLogConfig.name).toBe('change_logs')
    expect(changeLogs.tenant_id.notNull).toBe(true)
    expect(changeLogs.change_request_id.notNull).toBe(true)
    expect(changeLogs.created_by.notNull).toBe(true)
    expect(changeLogConfig.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        'idx_change_logs_tenant_id',
        'idx_change_logs_change_request_id',
        'idx_change_logs_design_file_version_id',
      ]),
    )
    expect(changeRequestConfig.indexes.map((entry) => entry.config.name)).toContain(
      'ux_change_requests_tenant_id_id',
    )
    expect(versionConfig.indexes.map((entry) => entry.config.name)).toContain(
      'ux_design_file_versions_tenant_id_id',
    )
    expect(requestLedgerConfig.indexes.map((entry) => entry.config.name)).toContain(
      'ux_change_request_create_requests_tenant_key',
    )
  })
})
