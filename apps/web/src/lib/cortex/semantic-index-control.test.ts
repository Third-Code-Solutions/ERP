import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppRole } from '@third-code-erp/auth'
import { cortexSemanticIndexControlAccess } from './semantic-index-control'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Cortex semantic index control access', () => {
  it('hides the provider-spending control from every non-admin role', () => {
    const roles: AppRole[] = [
      'sales',
      'commercial',
      'design',
      'sd_pm_pe',
      'finance',
      'procurement',
      'safety',
      'cx',
      'viewer',
      'estimator',
      'pm',
    ]
    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS',
      TENANT_ID
    )

    for (const role of roles) {
      expect(cortexSemanticIndexControlAccess(role, TENANT_ID)).toEqual({
        visible: false,
        enabled: false,
      })
    }
  })

  it('shows owner/admin a paused control while rollout remains closed', () => {
    expect(cortexSemanticIndexControlAccess('owner', TENANT_ID)).toEqual({
      visible: true,
      enabled: false,
    })
    expect(cortexSemanticIndexControlAccess('admin', TENANT_ID)).toEqual({
      visible: true,
      enabled: false,
    })
  })

  it('enables owner/admin only for one exact selected tenant', () => {
    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS',
      TENANT_ID
    )

    expect(cortexSemanticIndexControlAccess('owner', TENANT_ID)).toEqual({
      visible: true,
      enabled: true,
    })
    expect(cortexSemanticIndexControlAccess('admin', TENANT_ID)).toEqual({
      visible: true,
      enabled: true,
    })
    expect(
      cortexSemanticIndexControlAccess(
        'admin',
        '22222222-2222-4222-8222-222222222222'
      )
    ).toEqual({ visible: true, enabled: false })
  })

  it('keeps wildcard selection paused', () => {
    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS', '*')

    expect(cortexSemanticIndexControlAccess('admin', TENANT_ID)).toEqual({
      visible: true,
      enabled: false,
    })
  })
})
