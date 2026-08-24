import 'reflect-metadata'

import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { DocuSealWebhookController } from './docuseal-webhook.controller'
import { DocuSealWebhookPipe } from './docuseal-webhook.pipe'
import { DocuSealWebhookService } from './docuseal-webhook.service'

const COMMAND = new DocuSealWebhookPipe().transform({
  event: 'submission.completed',
  submissionId: 'submission-123',
  documents: [{ url: 'https://sign.example.test/signed.pdf' }],
})

describe('DocuSeal webhook HTTP contract', () => {
  it('rejects missing or incorrect internal tokens', async () => {
    const service = { handle: vi.fn() }
    const moduleRef = await Test.createTestingModule({
      controllers: [DocuSealWebhookController],
      providers: [
        { provide: DocuSealWebhookService, useValue: service },
        { provide: ConfigService, useValue: { get: () => 'x'.repeat(32) } },
      ],
    }).compile()
    const controller = moduleRef.get(DocuSealWebhookController)

    expect(() => controller.receive(COMMAND, undefined)).toThrow('Unauthorized')
    expect(() => controller.receive(COMMAND, 'wrong')).toThrow('Unauthorized')
    expect(service.handle).not.toHaveBeenCalled()
    await moduleRef.close()
  })

  it('forwards a validated command only with the configured token', async () => {
    const service = {
      handle: vi.fn().mockResolvedValue({
        received: true,
        handled: false,
        duplicate: false,
        tenantId: null,
        bomId: null,
        projectId: null,
        projectName: null,
        tcvCents: null,
        signedDocument: null,
      }),
    }
    const token = 'x'.repeat(32)
    const moduleRef = await Test.createTestingModule({
      controllers: [DocuSealWebhookController],
      providers: [
        { provide: DocuSealWebhookService, useValue: service },
        { provide: ConfigService, useValue: { get: () => token } },
      ],
    }).compile()
    const controller = moduleRef.get(DocuSealWebhookController)

    await expect(controller.receive(COMMAND, token)).resolves.toMatchObject({
      received: true,
    })
    expect(service.handle).toHaveBeenCalledWith(COMMAND)
    await moduleRef.close()
  })
})
