import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DocumentIntakeController } from './document-intake.controller'
import { DocumentIntakePipe } from './document-intake.pipe'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

const COMMAND = {
  storagePath: `${TENANT_ID}/${PROJECT_ID}/drawing.dwg`,
  projectId: PROJECT_ID,
  fileName: 'drawing.dwg',
  mimeType: 'application/octet-stream',
  sizeBytes: 1024,
  description: 'Approved drawing',
}

describe('document intake controller contract', () => {
  it('requires an idempotency key and rejects browser authority fields', async () => {
    const service = { create: vi.fn() }
    const controller = new DocumentIntakeController(service as never)
    const pipe = new DocumentIntakePipe()

    await expect(
      controller.create(
        pipe.transform(COMMAND),
        undefined,
        PRINCIPAL,
        { status: vi.fn() } as never
      )
    ).rejects.toThrow('Idempotency-Key header is required')
    expect(service.create).not.toHaveBeenCalled()

    expect(() =>
      pipe.transform({ ...COMMAND, tenantId: TENANT_ID, uploadedBy: USER_ID })
    ).toThrow('Invalid document intake command')
  })

  it('returns 201 for a new row and 200 for an idempotent replay', async () => {
    const service = {
      create: vi
        .fn()
        .mockResolvedValueOnce({
          documentId: DOCUMENT_ID,
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
          storagePath: COMMAND.storagePath,
          documentType: 'dxf',
          status: 'created',
          created: true,
        })
        .mockResolvedValueOnce({
          documentId: DOCUMENT_ID,
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
          storagePath: COMMAND.storagePath,
          documentType: 'dxf',
          status: 'created',
          created: false,
        }),
    }
    const controller = new DocumentIntakeController(service as never)
    const request = new DocumentIntakePipe().transform(COMMAND)
    const status = vi.fn()

    await expect(
      controller.create(request, ' intake-1 ', PRINCIPAL, { status } as never)
    ).resolves.toMatchObject({ created: true })
    await expect(
      controller.create(request, ' intake-1 ', PRINCIPAL, { status } as never)
    ).resolves.toMatchObject({ created: false })
    expect(status).toHaveBeenNthCalledWith(1, 201)
    expect(status).toHaveBeenNthCalledWith(2, 200)
    expect(service.create).toHaveBeenNthCalledWith(
      1,
      request,
      PRINCIPAL,
      'intake-1'
    )
  })
})
