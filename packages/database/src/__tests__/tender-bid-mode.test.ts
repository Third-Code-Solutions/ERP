import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260910190000_tender_bid_mode.sql'),
  'utf8',
).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

describe('tender bid mode migration', () => {
  it('creates the tenant-scoped opportunity tender spine without a duplicate BOM model', () => {
    expect(migration).toContain('create table if not exists tender_packages')
    expect(migration).toContain('create table if not exists tender_deviations')
    expect(migration).toContain('create table if not exists tender_evaluation_criteria')
    expect(migration).toContain('create table if not exists tender_vendor_profiles')
    expect(migration).toContain('create table if not exists tender_evaluation_scores')
    expect(migration).toContain('unique index if not exists ux_tender_packages_tenant_client_request')
    expect(migration).not.toContain('bom_line_items')
  })

  it('keeps composite tenant references safe while allowing nullable reference cleanup', () => {
    expect(migration).toContain('tender_packages_tor_document_tenant_fk foreign key (tenant_id, tor_document_id) references documents(tenant_id, id) on delete set null (tor_document_id)')
    expect(migration).toContain('tender_packages_created_by_tenant_fk foreign key (tenant_id, created_by) references users(tenant_id, id) on delete set null (created_by)')
    expect(migration).toContain('tender_deviations_owner_tenant_fk foreign key (tenant_id, owner_id) references users(tenant_id, id) on delete set null (owner_id)')
    expect(migration).toContain('tender_evaluation_scores_reviewed_by_tenant_fk foreign key (tenant_id, reviewed_by) references users(tenant_id, id) on delete set null (reviewed_by)')
    expect(migration).not.toMatch(/foreign key \(tenant_id, (?:tor_document_id|boq_document_id|bound_bom_id|created_by|owner_id|reviewed_by)\)[^,;]+on delete set null\s*[,;]/)
  })

  it('enables tenant RLS and append-only audit coverage for every tender table', () => {
    for (const table of ['tender_packages', 'tender_deviations', 'tender_evaluation_criteria', 'tender_vendor_profiles', 'tender_evaluation_scores']) {
      expect(migration).toContain(`'${table}'`)
    }
    expect(migration).toContain("execute format('alter table %i enable row level security', t)")
    expect(migration).toContain("execute format('create trigger audit_%s after insert or update or delete on %i for each row execute function audit_log_trigger()', t, t)")
    expect(migration).toContain('execute function audit_log_trigger()')
    expect(migration).not.toMatch(/drop\s+(?:table|column|type)|delete\s+from/)
  })
})
