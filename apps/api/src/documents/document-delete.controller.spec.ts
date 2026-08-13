import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DocumentDeleteController } from './document-delete.controller'
import { DocumentDeletePipe } from './document-delete.pipe'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

describe('document deletion controller contract', () => {
  it('requires a retry key and rejects caller-supplied body fields', () => {
    const service = { delete: vi.fn() }
    const controller = new DocumentDeleteController(service as never)
    const pipe = new DocumentDeletePipe()

    expect(() =>
      controller.delete(DOCUMENT_ID, pipe.transform({}), undefined, PRINCIPAL)
    ).toThrow('Idempotency-Key header is required')
    expect(service.delete).not.toHaveBeenCalled()
    expect(() => pipe.transform({ projectId: 'bad' })).toThrow(
      'Invalid document deletion command'
    )
  })

  it('forwards the validated document and server principal', async () => {
    const service = {
      delete: vi.fn().mockResolvedValue({
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: '33333333-3333-4333-8333-333333333333',
        storagePath: `${TENANT_ID}/project/drawing.dwg`,
        status: 'deleted',
        derivedScopeItemsRemoved: 0,
      }),
    }
    const controller = new DocumentDeleteController(service as never)
    const body = new DocumentDeletePipe().transform({})

    await expect(
      controller.delete(DOCUMENT_ID, body, ' document-delete-1 ', PRINCIPAL)
    ).resolves.toMatchObject({ status: 'deleted' })
    expect(service.delete).toHaveBeenCalledWith(
      DOCUMENT_ID,
      PRINCIPAL,
      'document-delete-1'
    )
  })
})
