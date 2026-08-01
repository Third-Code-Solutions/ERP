import 'reflect-metadata'

import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { DocumentProcessingRequest } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentProcessingService } from './document-processing.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST: DocumentProcessingRequest = {
  mode: 'cad',
  requestedFormat: 'auto',
  createDraftBom: true,
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const database = { client: { transaction: vi.fn() } } as unknown as DatabaseService
  return new DocumentProcessingService(
    config,
    database,
    {} as AuditService
  )
}

describe('DocumentProcessingService migration boundary', () => {
  it('fails closed without touching the database', async () => {
    const candidate = service()
    await expect(
      candidate.create(DOCUMENT_ID, REQUEST, PRINCIPAL, 'job-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(
      (candidate as unknown as { database: DatabaseService }).database.client
        .transaction
    ).not.toHaveBeenCalled()
  })

  it('stays disabled when the tenant allowlist is empty', async () => {
    await expect(
      service(true).create(DOCUMENT_ID, REQUEST, PRINCIPAL, 'job-1')
    ).rejects.toThrow(
      'Document processing is not enabled for this tenant; no job was created.'
    )
  })

  it('rejects malformed document ids before database access', async () => {
    await expect(
      service(true, [PRINCIPAL.tenantId]).create(
        'not-a-uuid',
        REQUEST,
        PRINCIPAL,
        'job-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects browser authority fields through the shared command schema', async () => {
    await expect(
      service(true, [PRINCIPAL.tenantId]).create(
        DOCUMENT_ID,
        {
          ...REQUEST,
          tenantId: PRINCIPAL.tenantId,
        } as unknown as DocumentProcessingRequest,
        PRINCIPAL,
        'job-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
