import { describe, expect, it } from 'vitest'
import {
  createProjectCommandSchema,
  projectCreationResultSchema,
} from './projects'

describe('project core API contract', () => {
  it('normalizes omitted create fields to safe defaults', () => {
    expect(
      createProjectCommandSchema.parse({
        name: '  Site Alpha  ',
        client: '  Acme  ',
      })
    ).toEqual({
      name: 'Site Alpha',
      client: 'Acme',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    })
  })

  it('rejects snake_case or unknown create fields at the API boundary', () => {
    expect(
      createProjectCommandSchema.safeParse({
        name: 'Site Alpha',
        client: 'Acme',
        project_type: 'mep',
      }).success
    ).toBe(false)
  })

  it('requires server timestamps in creation responses', () => {
    const result = projectCreationResultSchema.safeParse({
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: '22222222-2222-4222-8222-222222222222',
      name: 'Site Alpha',
      client: 'Acme',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })
})
