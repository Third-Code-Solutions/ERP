import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import type { VendorConfirmationResult } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import { PublicVendorConfirmationController } from './public-vendor-confirmation.controller'
import { PublicVendorConfirmationPipe } from './public-vendor-confirmation.pipe'
import type { PublicVendorConfirmationService } from './public-vendor-confirmation.service'

const TOKEN = 'b'.repeat(64)
const BODY = {
  decision: 'accepted' as const,
  responderName: 'Ana Reyes',
  responderEmail: 'ana@example.com',
}
const RESULT = {} as VendorConfirmationResult

describe('public supplier confirmation controller contract', () => {
  it('rejects missing and oversized idempotency keys', () => {
    const controller = new PublicVendorConfirmationController(
      {} as PublicVendorConfirmationService
    )
    expect(() => controller.confirm(TOKEN, BODY, undefined)).toThrow(
      BadRequestException
    )
    expect(() => controller.confirm(TOKEN, BODY, 'x'.repeat(257))).toThrow(
      'Idempotency-Key header is too long'
    )
  })

  it('forwards token, strict body, and opaque retry key', async () => {
    const confirm = vi.fn().mockResolvedValue(RESULT)
    const controller = new PublicVendorConfirmationController({
      confirm,
    } as unknown as PublicVendorConfirmationService)

    await expect(
      controller.confirm(TOKEN, BODY, 'vendor-confirm-1')
    ).resolves.toBe(RESULT)
    expect(confirm).toHaveBeenCalledWith(TOKEN, BODY, 'vendor-confirm-1')
  })

  it('accepts the strict body and rejects unknown fields', () => {
    const pipe = new PublicVendorConfirmationPipe()
    expect(pipe.transform(BODY)).toEqual(BODY)
    expect(() =>
      pipe.transform({ ...BODY, tenantId: 'not-client-authority' })
    ).toThrow('Invalid supplier confirmation command')
  })
})
