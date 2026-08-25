import { describe, expect, it } from 'vitest'
import { apiDeploymentRevision } from './health.controller'

describe('API deployment revision', () => {
  it('prefers the explicit release identity and bounds its public value', () => {
    expect(
      apiDeploymentRevision({
        APP_REVISION: '0123456789abcdef0123456789abcdef01234567',
        RAILWAY_GIT_COMMIT_SHA: 'unused',
      })
    ).toBe('0123456789ab')
  })

  it('falls back to Railway metadata and never exposes an empty value', () => {
    expect(apiDeploymentRevision({ RAILWAY_GIT_COMMIT_SHA: 'railway-release' })).toBe(
      'railway-rele'
    )
    expect(apiDeploymentRevision({})).toBe('local')
  })
})
