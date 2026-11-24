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

  it('renders a transactional email in the issuing company name with a text alternative', () => {
    const message = templates['po-issued']({
      po_number: 'PO-0042',
      total_php: '1,234.05',
      supplier_name: 'Concrete <Co>',
      po_pdf_url: 'https://thirdcode-erp.example.test/purchase-orders/42?download=1&format=pdf',
      company_name: 'Northwind Builders <NB>',
    })

    expect(message.subject).toBe('[Northwind Builders <NB>] Purchase order PO-0042 issued')
    expect(message.html).toContain('Northwind Builders &lt;NB&gt;')
    expect(message.html).toContain('Concrete &lt;Co&gt;')
    expect(message.html).toContain('download=1&amp;format=pdf')
    expect(message.html).not.toContain('Concrete <Co>')
    expect(message.html).not.toMatch(/[—–→]/)
    expect(message.html).not.toMatch(/ABI OPS|Actuate/)
    expect(message.text).toContain('Northwind Builders <NB>')
    expect(message.text).not.toMatch(/ABI OPS|Actuate/)
    expect(message.text).toContain('Download the purchase order: https://thirdcode-erp.example.test/purchase-orders/42?download=1&format=pdf')
  })

  it('keeps a tenant name with line breaks from adding header lines to the subject', () => {
    const message = templates['po-issued']({
      po_number: 'PO-0042',
      total_php: '1.00',
      supplier_name: 'Concrete Co',
      company_name: 'Northwind\r\nBcc: attacker@example.test',
    })

    expect(message.subject).not.toMatch(/[\r\n]/)
    expect(message.subject).toBe('[Northwind Bcc: attacker@example.test] Purchase order PO-0042 issued')
  })

  it('never falls back to another company when the tenant name is missing', () => {
    const message = templates['po-issued']({
      po_number: 'PO-0042',
      total_php: '1.00',
      supplier_name: 'Concrete Co',
    })

    expect(message.subject).toBe('[Your contractor] Purchase order PO-0042 issued')
    expect(message.html).not.toMatch(/ABI OPS|Actuate/)
    expect(message.text).not.toMatch(/ABI OPS|Actuate/)
  })

  it('acknowledges a warranty request without a schedule placeholder or a staff-only link', () => {
    const message = templates['ticket-acknowledged']({ ticket_number: 'WT-000007', company_name: 'Northwind' })

    expect(message.subject).toBe('[Northwind] Warranty request acknowledged: WT-000007')
    expect(message.html).not.toMatch(/TBD|href=|scheduled/i)
    expect(message.text).not.toMatch(/TBD|https?:/i)
  })

  it('sends a staff reply as an update that quotes the reply, not as a request-received message', () => {
    const message = templates['ticket-update']({
      ticket_number: 'WT-000007',
      message: 'We will visit <Tuesday>.',
      company_name: 'Northwind',
    })

    expect(message.subject).toBe('[Northwind] Update on your warranty request: WT-000007')
    expect(message.html).toContain('We will visit &lt;Tuesday&gt;.')
    expect(message.html).not.toMatch(/request received|We received/i)
    expect(message.text).toContain('We will visit <Tuesday>.')
  })

  it('omits the confirm link from a repair appointment when none is given', () => {
    const without = templates['ticket-schedule']({
      ticket_number: 'WT-000007',
      scheduled_for: 'Nov 20, 2026, 9:00 AM',
    })
    expect(without.html).not.toContain('href=')
    expect(without.html).toContain('contact your project team')

    const withLink = templates['ticket-schedule']({
      ticket_number: 'WT-000007',
      scheduled_for: 'Nov 20, 2026, 9:00 AM',
      confirm_url: 'https://erp.example.test/confirm',
    })
    expect(withLink.html).toContain('href="https://erp.example.test/confirm"')
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
