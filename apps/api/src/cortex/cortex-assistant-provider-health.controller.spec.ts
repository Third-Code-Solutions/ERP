import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { CortexAssistantProviderHealthController } from './cortex-assistant-provider-health.controller'
import { CortexAssistantProviderHealthPipe } from './cortex-assistant-provider-health.pipe'
import type { CortexAssistantProviderHealthService } from './cortex-assistant-provider-health.service'

const PRINCIPAL = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  role: 'admin' as const,
  email: 'admin@example.test',
}

describe('Cortex assistant provider health HTTP contract', () => {
  it('passes only strict provider/model scope and verified principal', async () => {
    const read = vi.fn().mockResolvedValue({ provider: 'openai' })
    const controller = new CortexAssistantProviderHealthController({
      read,
    } as unknown as CortexAssistantProviderHealthService)
    const query = new CortexAssistantProviderHealthPipe().transform({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })
    await expect(controller.read(query, PRINCIPAL)).resolves.toEqual({
      provider: 'openai',
    })
    expect(read).toHaveBeenCalledWith(query, PRINCIPAL)
  })

  it('rejects tenant scope and unsupported fields before service access', () => {
    const pipe = new CortexAssistantProviderHealthPipe()
    expect(() =>
      pipe.transform({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        tenantId: PRINCIPAL.tenantId,
      })
    ).toThrow(BadRequestException)
  })
})
