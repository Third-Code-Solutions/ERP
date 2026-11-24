import { describe, expect, it } from 'vitest'
import { templates } from './resend'

describe('coc-signing-link email template', () => {
  it('carries the signing link in both versions and escapes project text', () => {
    const message = templates['coc-signing-link']({
      project_name: 'Tower <Phase 2>',
      portal_url: 'https://erp.example.test/portal/sign/abc?x=1&y=2',
      valid_until: 'Nov 19, 2026, 10:00 AM',
    })

    expect(message.subject).toContain('Certificate of Completion ready for signature')
    expect(message.html).toContain('Tower &lt;Phase 2&gt;')
    expect(message.html).not.toContain('Tower <Phase 2>')
    expect(message.html).toContain('href="https://erp.example.test/portal/sign/abc?x=1&amp;y=2"')
    expect(message.text).toContain('https://erp.example.test/portal/sign/abc?x=1&y=2')
    expect(message.text).toContain('Nov 19, 2026, 10:00 AM')
  })
})
