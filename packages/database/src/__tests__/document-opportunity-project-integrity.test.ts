import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { documents, opportunities } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260824144430_document_opportunity_project_integrity.sql',
  ),
  'utf8',
).toLowerCase()
const documentSchemaSource = readFileSync(
  resolve(__dirname, '../schema/documents.ts'),
  'utf8',
)

describe('document opportunity/project integrity', () => {
  it('models both the existing tenant binding and the nullable project binding', () => {
    const opportunityIndex = getTableConfig(opportunities).indexes.find(
      (index) => index.config.name === 'ux_opportunities_tenant_id_id_project_id',
    )
    const documentConfig = getTableConfig(documents)
    const documentIndex = documentConfig.indexes.find(
      (index) => index.config.name === 'idx_documents_tenant_opportunity_project',
    )
    const tenantForeignKey = documentConfig.foreignKeys.find(
      (foreignKey) => foreignKey.getName() === 'documents_opportunity_tenant_fk',
    )
    const projectForeignKey = documentConfig.foreignKeys.find(
      (foreignKey) =>
        foreignKey.getName() === 'documents_opportunity_project_tenant_fk',
    )

    expect(opportunityIndex?.config.unique).toBe(true)
    expect(
      opportunityIndex?.config.columns.map((column) =>
        'name' in column ? column.name : undefined,
      ),
    ).toEqual(['tenant_id', 'id', 'project_id'])
    expect(documentIndex?.config.unique).toBe(false)
    expect(
      documentIndex?.config.columns.map((column) =>
        'name' in column ? column.name : undefined,
      ),
    ).toEqual(['tenant_id', 'opportunity_id', 'project_id'])

    const tenantReference = tenantForeignKey?.reference()
    expect(tenantReference?.columns.map((column) => column.name)).toEqual([
      'tenant_id',
      'opportunity_id',
    ])
    expect(
      tenantReference?.foreignColumns.map((column) => column.name),
    ).toEqual(['tenant_id', 'id'])
    expect(tenantForeignKey?.onDelete).toBe('cascade')
    expect(tenantForeignKey?.onUpdate).toBe('no action')

    const projectReference = projectForeignKey?.reference()
    expect(projectReference?.columns.map((column) => column.name)).toEqual([
      'tenant_id',
      'opportunity_id',
      'project_id',
    ])
    expect(
      projectReference?.foreignColumns.map((column) => column.name),
    ).toEqual(['tenant_id', 'id', 'project_id'])
    expect(projectForeignKey?.onDelete).toBe('cascade')
    expect(projectForeignKey?.onUpdate).toBe('no action')

    expect(documentConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        'documents_opportunity_tenant_fk',
        'documents_opportunity_project_tenant_fk',
      ]),
    )
    expect(documentSchemaSource).toMatch(
      /opportunity_id: uuid\('opportunity_id'\),/,
    )
    expect(documentSchemaSource).not.toMatch(
      /opportunity_id: uuid\('opportunity_id'\)\.references/,
    )
  })

  it('preflights legacy mismatches before validating the additive constraint', () => {
    expect(migrationSql).toMatch(
      /documents_opportunity_tenant_fk is missing, invalid, or malformed/,
    )
    expect(migrationSql).toMatch(
      /array\['tenant_id', 'opportunity_id'\]::name\[\][\s\S]*?array\['tenant_id', 'id'\]::name\[\]/,
    )
    expect(migrationSql).toMatch(
      /from public\.documents as document[\s\S]*?document\.project_id is not null[\s\S]*?not exists \([\s\S]*?from public\.opportunities as opportunity[\s\S]*?opportunity\.project_id is not distinct from document\.project_id/,
    )
    expect(migrationSql).toContain(
      'ux_opportunities_tenant_id_id_project_id',
    )
    expect(migrationSql).toContain(
      'idx_documents_tenant_opportunity_project',
    )
    expect(migrationSql).toMatch(
      /constraint documents_opportunity_project_tenant_fk[\s\S]*?foreign key \(tenant_id, opportunity_id, project_id\)[\s\S]*?references public\.opportunities \(tenant_id, id, project_id\)[\s\S]*?match simple[\s\S]*?on delete cascade[\s\S]*?on update no action[\s\S]*?not valid/,
    )
    expect(migrationSql).toContain(
      'validate constraint documents_opportunity_project_tenant_fk',
    )
    expect(migrationSql).not.toContain(
      'create unique index if not exists ux_opportunities_tenant_id_id_project_id',
    )
    expect(migrationSql).not.toContain(
      'create index if not exists idx_documents_tenant_opportunity_project',
    )
  })

  it('documents a narrow rollback and contains no destructive executable DDL', () => {
    expect(migrationSql).toContain('-- rollback guidance')
    expect(migrationSql).toContain(
      'alter table public.documents drop constraint documents_opportunity_project_tenant_fk',
    )

    const executableSql = migrationSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(executableSql).not.toMatch(
      /\b(drop|truncate)\s+(table|column|index|constraint)\b/,
    )
  })
})
