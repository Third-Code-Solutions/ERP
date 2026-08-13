import { describe, expect, it } from 'vitest'
import { ProjectListPipe } from './project-list.pipe'

describe('ProjectListPipe', () => {
  it('parses query strings into a bounded typed query', () => {
    expect(
      new ProjectListPipe().transform({
        q: '  office ',
        status: 'active',
        projectType: 'fit_out',
        sort: 'name',
        order: 'asc',
        page: '3',
        limit: '50',
      })
    ).toEqual({
      q: 'office',
      status: 'active',
      projectType: 'fit_out',
      sort: 'name',
      order: 'asc',
      page: 3,
      limit: 50,
    })
  })

  it('rejects unknown query fields', () => {
    expect(() => new ProjectListPipe().transform({ cursor: 'x' })).toThrow(
      'Invalid project list query'
    )
  })
})
