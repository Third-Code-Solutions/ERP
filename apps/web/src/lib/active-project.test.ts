import { PgDialect } from 'drizzle-orm/pg-core'
import { boms } from '@third-code-erp/database/schema'
import { describe, expect, it } from 'vitest'
import { activeProjectCondition } from './active-project'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('activeProjectCondition', () => {
  it('requires a live project of the tenant', () => {
    const query = new PgDialect().sqlToQuery(activeProjectCondition(PROJECT_ID, TENANT_ID))

    expect(query.sql).toBe(
      'exists (select "id" from "projects" where ("projects"."id" = $1 and "projects"."tenant_id" = $2 and "projects"."deleted_at" is null))'
    )
    expect(query.params).toEqual([PROJECT_ID, TENANT_ID])
  })

  it('can correlate with the outer row', () => {
    const query = new PgDialect().sqlToQuery(activeProjectCondition(boms.project_id, TENANT_ID))

    expect(query.sql).toContain('"projects"."id" = "boms"."project_id"')
    expect(query.params).toEqual([TENANT_ID])
  })
})
