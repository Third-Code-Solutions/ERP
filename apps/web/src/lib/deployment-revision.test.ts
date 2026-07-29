import { describe, expect, it } from 'vitest'

import { deploymentRevision } from './deployment-revision'

describe('deploymentRevision', () => {
  it('prefers an explicit provider-neutral revision', () => {
    expect(
      deploymentRevision({
        APP_REVISION: '41890ca31f3fb0f32a5541d524d13c4a6e38b6e2',
        RAILWAY_GIT_COMMIT_SHA: 'railway-revision',
        VERCEL_GIT_COMMIT_SHA: 'vercel-revision',
      })
    ).toBe('41890ca31f3f')
  })

  it('supports Railway and Vercel revision metadata during migration', () => {
    expect(
      deploymentRevision({
        RAILWAY_GIT_COMMIT_SHA: 'railway-revision',
        VERCEL_GIT_COMMIT_SHA: 'vercel-revision',
      })
    ).toBe('railway-revi')

    expect(
      deploymentRevision({
        VERCEL_GIT_COMMIT_SHA: 'vercel-revision',
      })
    ).toBe('vercel-revis')
  })

  it('returns local when no usable revision exists', () => {
    expect(deploymentRevision({})).toBe('local')
    expect(deploymentRevision({ APP_REVISION: '   ' })).toBe('local')
  })
})
