import { describe, expect, it } from 'vitest'
import { getIntegrationStatus } from './integration-status'

describe('server integration configuration status', () => {
  it('reports missing configuration without pretending the provider is connected', () => {
    const email = getIntegrationStatus({}).find((item) => item.name === 'Resend')
    expect(email?.configured).toBe(false)
    expect(email?.missing).toEqual(['RESEND_API_KEY', 'EMAIL_FROM'])
  })
  it('requires both email fields and rejects whitespace-only values', () => {
    expect(getIntegrationStatus({ RESEND_API_KEY: 'secret', EMAIL_FROM: '  ' }).find((item) => item.name === 'Resend')?.configured).toBe(false)
  })
  it('never returns environment values or claims verified delivery', () => {
    const result = getIntegrationStatus({ RESEND_API_KEY: 'secret-test-token', EMAIL_FROM: 'private@example.test', DATABASE_URL: 'private-database' })
    expect(result.find((item) => item.name === 'Resend')?.configured).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/secret-test-token|private@example|private-database/)
    expect(result.find((item) => item.name === 'Resend')?.guidance).toContain('verified separately')
  })
})
