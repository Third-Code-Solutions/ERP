import type { AppRole } from '@third-code-erp/auth'
import { describe, expect, it } from 'vitest'

import { profileMenuShowsAdminConsole } from './profile-menu'

const EXPECTED_ADMIN_VISIBILITY = {
  owner: true,
  estimator: false,
  pm: false,
  admin: true,
  sales: false,
  commercial: false,
  design: false,
  sd_pm_pe: false,
  finance: false,
  procurement: false,
  safety: false,
  cx: false,
  viewer: false,
} as const satisfies Record<AppRole, boolean>

const PERSISTED_ROLES = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const satisfies readonly AppRole[]

describe('ProfileMenu admin visibility', () => {
  it.each(PERSISTED_ROLES)(
    'keeps the admin-console entry policy for %s',
    (role) => {
      expect(profileMenuShowsAdminConsole(role)).toBe(
        EXPECTED_ADMIN_VISIBILITY[role]
      )
    }
  )
})
