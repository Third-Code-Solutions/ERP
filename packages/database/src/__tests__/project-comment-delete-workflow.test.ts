import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { projectCommentCreateRequests, projectCommentDeleteRequests } from '../schema'

const deleteMigration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260810110000_project_comment_delete_workflow.sql'
  ),
  'utf8'
).toLowerCase()
const tenantPreservationMigration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260810120000_project_comment_delete_fk_tenant_preservation.sql'
  ),
  'utf8'
).toLowerCase()

describe('project comment delete workflow migration', () => {
  it('retains create evidence while allowing the comment target to disappear', () => {
    expect(deleteMigration).toContain(
      'project_comment_create_requests_comment_tenant_fk'
    )
    expect(
      tenantPreservationMigration.match(
        /foreign key \(tenant_id, comment_id\)[\s\S]*?on delete set null \(comment_id\)/g
      )
    ).toHaveLength(2)
  })

  it('keeps tenant-scoped ledger constraints represented in Drizzle', () => {
    expect(
      getTableConfig(projectCommentCreateRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'project_comment_create_requests_comment_tenant_fk',
        'project_comment_create_requests_created_by_tenant_fk',
      ])
    )
    expect(
      getTableConfig(projectCommentDeleteRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'project_comment_delete_requests_comment_tenant_fk',
        'project_comment_delete_requests_created_by_tenant_fk',
      ])
    )
  })
})
