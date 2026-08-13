import { describe, expect, it, vi } from 'vitest'

import {
  createTenantBusinessDayService,
  isPersistedBusinessCalendarEnabled,
  resolveTenantBusinessDayService,
} from './business-calendar'

describe('tenant business calendar rollout', () => {
  it('merges tenant rows over the national calendar', () => {
    const service = createTenantBusinessDayService([
      {
        date: '2026-01-01',
        name: 'Company working day',
        kind: 'local',
        source: 'tenant calendar',
        is_enabled: false,
      },
    ])

    expect(service.isBusinessDay('2026-01-01')).toBe(true)
  })

  it('keeps the national seed explicit until the persisted rollout flag is enabled', async () => {
    vi.stubEnv('BUSINESS_CALENDAR_DB_ENABLED', '0')

    expect(isPersistedBusinessCalendarEnabled()).toBe(false)
    const service = await resolveTenantBusinessDayService(
      '00000000-0000-4000-8000-000000000000'
    )
    expect(service.isBusinessDay('2026-01-01')).toBe(false)
  })
})
