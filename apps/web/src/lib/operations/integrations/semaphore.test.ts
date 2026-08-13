import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendSms } from './semaphore'

const envelope = {
  to: '+639171234567',
  body: 'Test message',
}

describe('Semaphore integration', () => {
  beforeEach(() => vi.unstubAllEnvs())

  it('uses explicit development stub outside production', async () => {
    await expect(sendSms(envelope)).resolves.toEqual({
      ok: true,
      is_dev_stub: true,
    })
  })

  it('fails closed when production SMS configuration is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(sendSms(envelope)).rejects.toThrow(
      'SMS integration is not configured for production'
    )
  })
})
