import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentDeleteService } from './document-delete.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_DOCUMENT_DELETE_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    service: new DocumentDeleteService(config, database, {} as AuditService),
    transaction,
  }
}

describe('DocumentDeleteService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = service()
    await expect(
      probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'document-delete-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)
    await expect(
      probe.service.delete(DOCUMENT_ID, PRINCIPAL, 'document-delete-1')
    ).rejects.toThrow(
      'Document deletion workflow is not enabled for this tenant; no document was deleted.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
