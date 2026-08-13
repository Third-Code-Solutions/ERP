import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './resend'

const envelope = {
  to: 'client@example.test',
  subject: 'Test message',
  html: '<p>Test</p>',
  text: 'Test',
}

describe('Resend integration', () => {
  beforeEach(() => vi.unstubAllEnvs())

  it('uses explicit development stub outside production', async () => {
    await expect(sendEmail(envelope)).resolves.toMatchObject({
      is_dev_stub: true,
    })
  })

  it('fails closed when production email configuration is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(sendEmail(envelope)).rejects.toThrow(
      'Email integration is not configured for production'
    )
  })
})
