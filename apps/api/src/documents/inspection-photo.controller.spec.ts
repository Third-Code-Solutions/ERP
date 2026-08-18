import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { InspectionPhotoPipe } from './inspection-photo.pipe'
import { InspectionPhotoController } from './inspection-photo.controller'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
}
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

describe('inspection photo controller contract', () => {
  it('rejects a body opportunity id that differs from the route id', () => {
    const create = vi.fn()
    const controller = new InspectionPhotoController({ create } as never)
    const command = new InspectionPhotoPipe().transform({
      opportunityId: '44444444-4444-4444-8444-444444444444',
      storagePath: `${PRINCIPAL.tenantId}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    })

    expect(() => controller.create(OPPORTUNITY_ID, command, PRINCIPAL)).toThrow(
      BadRequestException
    )
    expect(create).not.toHaveBeenCalled()
  })
})
