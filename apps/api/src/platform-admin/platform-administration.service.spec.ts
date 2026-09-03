import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'

import { DatabaseService } from '../database/database.service'
import { PlatformAdministrationService } from './platform-administration.service'
import { PlatformIdentityAdminService } from './platform-identity-admin.service'

describe('platform integration configuration', () => {
  it.each([
    { key: undefined, sender: undefined, status: 'unavailable' },
    { key: 're_fixture_not_a_real_secret', sender: undefined, status: 'unavailable' },
    { key: undefined, sender: 'ERP <mail@example.invalid>', status: 'unavailable' },
    { key: 're_fixture_not_a_real_secret', sender: 'ERP <mail@example.invalid>', status: 'configured' },
  ])('reports email as $status for key=$key sender=$sender', async ({ key, sender, status }) => {
    const module = await Test.createTestingModule({
      providers: [
        PlatformAdministrationService,
        { provide: ConfigService, useValue: new ConfigService({ RESEND_API_KEY: key, EMAIL_FROM: sender }) },
        { provide: DatabaseService, useValue: {} },
        { provide: PlatformIdentityAdminService, useValue: { configured: () => false } },
      ],
    }).compile()
    try {
      const service = module.get(PlatformAdministrationService)
      const result = service.integrations().find((dependency) => dependency.key === 'resend')
      expect(result?.status).toBe(status)
      expect(service.systemHealth().dependencies).toContainEqual(result)
      expect(JSON.stringify(result)).not.toContain('re_fixture_not_a_real_secret')
      expect(JSON.stringify(result)).not.toContain('mail@example.invalid')
      if (status === 'configured') {
        expect(result?.detail).toContain('live provider telemetry is not instrumented')
      }
    } finally {
      await module.close()
    }
  })
})
