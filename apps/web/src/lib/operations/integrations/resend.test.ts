import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail, templates } from './resend'

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

  it('renders a branded transactional email with accessible copy and a text alternative', () => {
    const message = templates['po-issued']({
      po_number: 'PO-0042',
      total_php: '1,234.05',
      supplier_name: 'Concrete <Co>',
      po_pdf_url: 'https://thirdcode-erp.example.test/purchase-orders/42?download=1&format=pdf',
    })

    expect(message.subject).toBe('[ABI OPS] Purchase order PO-0042 issued')
    expect(message.html).toContain('ABI OPS')
    expect(message.html).toContain('Concrete &lt;Co&gt;')
    expect(message.html).toContain('download=1&amp;format=pdf')
    expect(message.html).not.toContain('Concrete <Co>')
    expect(message.html).not.toMatch(/[—–→]/)
    expect(message.text).toContain('Actuate Builders Inc.')
    expect(message.text).toContain('Download the purchase order: https://thirdcode-erp.example.test/purchase-orders/42?download=1&format=pdf')
  })

  it('keeps review notes escaped while retaining a useful plain-text message', () => {
    const message = templates['kyc-result']({
      account_name: 'Acme <Holdings>',
      decision: 'flagged',
      notes: 'Please provide the <missing> certificate.',
      account_url: 'https://thirdcode-erp.example.test/accounts/42',
    })

    expect(message.html).toContain('Please provide the &lt;missing&gt; certificate.')
    expect(message.html).not.toContain('Please provide the <missing> certificate.')
    expect(message.text).toContain('Notes: Please provide the <missing> certificate.')
  })
})
