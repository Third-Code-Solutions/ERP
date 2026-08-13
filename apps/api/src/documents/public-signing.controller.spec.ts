import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { PublicSigningResult } from '@third-code-erp/shared-types'
import { PublicSigningController } from './public-signing.controller'
import { PublicSigningPipe } from './public-signing.pipe'
import type { PublicSigningService } from './public-signing.service'

const TOKEN = 'a'.repeat(64)
const BODY = {
  signerName: 'Ana Reyes',
  signerEmail: 'ana@example.com',
  signatureDataUrl: 'data:image/png;base64,abc=',
}
const RESULT = {} as PublicSigningResult

describe('public signing command controller contract', () => {
  it('rejects missing and oversized idempotency keys', () => {
    const controller = new PublicSigningController({} as PublicSigningService)
    expect(() => controller.sign(TOKEN, BODY, undefined)).toThrow(
      BadRequestException
    )
    expect(() => controller.sign(TOKEN, BODY, 'x'.repeat(257))).toThrow(
      'Idempotency-Key header is too long'
    )
  })

  it('forwards token, strict body, and opaque retry key', async () => {
    const sign = vi.fn().mockResolvedValue(RESULT)
    const controller = new PublicSigningController({ sign } as unknown as PublicSigningService)

    await expect(controller.sign(TOKEN, BODY, 'public-sign-1')).resolves.toBe(RESULT)
    expect(sign).toHaveBeenCalledWith(TOKEN, BODY, 'public-sign-1')
  })

  it('accepts the strict body and rejects unknown fields', () => {
    const pipe = new PublicSigningPipe()
    expect(pipe.transform(BODY)).toEqual(BODY)
    expect(() => pipe.transform({ ...BODY, tenantId: 'not-client-authority' })).toThrow(
      'Invalid public signing command'
    )
  })
})
