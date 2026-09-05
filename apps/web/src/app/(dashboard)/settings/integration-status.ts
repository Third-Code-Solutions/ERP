import 'server-only'

const INTEGRATIONS = [
  { name: 'Inngest', purpose: 'Background workflow scheduling', keys: ['INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'], fallback: 'Background workflows require configuration and an app sync.' },
  { name: 'Resend', purpose: 'Transactional email', keys: ['RESEND_API_KEY', 'EMAIL_FROM'], fallback: 'Email delivery is unavailable until a sender and API key are configured.' },
  { name: 'DocuSeal', purpose: 'External document signing', keys: ['DOCUSEAL_API_URL', 'DOCUSEAL_API_TOKEN'], fallback: 'Built-in canvas signing remains available without DocuSeal.' },
  { name: 'Semaphore', purpose: 'SMS delivery', keys: ['SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME'], fallback: 'SMS delivery requires a configured provider account and sender name.' },
] as const

// Only names and presence indicators leave the server. Do not include tokens,
// sender addresses, provider responses or URLs from environment variables.
export function getIntegrationStatus(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return INTEGRATIONS.map((integration) => {
    const missing = integration.keys.filter((key) => !environment[key]?.trim())
    return {
      name: integration.name,
      purpose: integration.purpose,
      configured: missing.length === 0,
      missing,
      guidance: missing.length ? integration.fallback : 'Configuration present; provider connectivity and delivery must be verified separately.',
    }
  })
}
