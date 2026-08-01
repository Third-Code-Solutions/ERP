import 'reflect-metadata'

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type {
  CadEvidenceCommitCommand,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'

const COMMAND: CadEvidenceCommitCommand = {
  projectId: '44444444-4444-4444-8444-444444444444',
  workerResponse: {
    document_id: DOCUMENT_ID,
    scope_items: [
      {
        code: null,
        description: 'Concrete slab',
        unit: 'sqm',
        quantity: 2,
        unit_cost_cents: 10_000,
        notes: null,
      },
    ],
    count: 1,
    warnings: [],
    parsed_format: 'dxf',
    source_format: 'dxf',
  },
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  return new CadEvidenceCommitService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

describe('CadEvidenceCommitService migration boundary', () => {
  it('fails closed without touching the database', async () => {
    await expect(
      service().commit(DOCUMENT_ID, COMMAND, PRINCIPAL, 'cad-commit-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when the tenant allowlist is empty', async () => {
    await expect(
      service(true).commit(DOCUMENT_ID, COMMAND, PRINCIPAL, 'cad-commit-1')
    ).rejects.toThrow(
      'CAD evidence commit is not enabled for this tenant; no scope items were created.'
    )
  })

  it('rejects worker evidence for another document before database access', async () => {
    const mismatched = {
      ...COMMAND,
      workerResponse: {
        ...COMMAND.workerResponse,
        document_id: '55555555-5555-4555-8555-555555555555',
      },
    }
    await expect(
      service().commit(
        DOCUMENT_ID,
        mismatched,
        PRINCIPAL,
        'cad-commit-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
