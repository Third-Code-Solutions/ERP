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

  it('uses Vercel deployment identity when Git metadata is unavailable', () => {
    expect(
      deploymentRevision({ VERCEL_DEPLOYMENT_ID: 'dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3' })
    ).toBe('dpl_7Gw5ZMBp')
  })

  it('prefers Vercel deployment identity for dirty-tree releases', () => {
    expect(
      deploymentRevision({
        VERCEL_DEPLOYMENT_ID: 'dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3',
        VERCEL_GIT_COMMIT_SHA: 'stale-git-sha',
      })
    ).toBe('dpl_7Gw5ZMBp')
  })

  it('uses Vercel deployment URL when deployment ID is not exposed', () => {
    expect(
      deploymentRevision({ VERCEL_URL: 'thirdcode-43uvo011b-pavi-2e9809a4.vercel.app' })
    ).toBe('thirdcode-43')
  })
})
