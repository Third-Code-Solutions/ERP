import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { CreateChangeRequestCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ChangeRequestCreationService } from './change-request-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'sales',
  email: 'sales@example.test',
}

const COMMAND: CreateChangeRequestCommand = {
  requestedByName: 'Client PM',
  description: 'Move the reception wall.',
  priority: 'minor',
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_CHANGE_REQUEST_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  return new ChangeRequestCreationService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

describe('ChangeRequestCreationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().create(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'change-request-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when the tenant allowlist is empty', async () => {
    await expect(
      service(true).create(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'change-request-1'
      )
    ).rejects.toThrow(
      'Change Request command is not enabled for this tenant; no Change Request was created.'
    )
  })
})
