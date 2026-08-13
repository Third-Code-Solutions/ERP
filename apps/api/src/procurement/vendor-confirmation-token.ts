import { createHash, createHmac } from 'node:crypto'

const TOKEN_CONTEXT = 'third-code-erp/vendor-confirmation/v1'

export function hashVendorConfirmationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Derive the one-time URL token from a random session id and a server-only
 * secret. The raw token is reproducible for email-link delivery but is never
 * persisted in PostgreSQL, audit metadata, or the notification outbox.
 */
export function deriveVendorConfirmationToken(
  secret: string,
  tenantId: string,
  sessionId: string
): string {
  return createHmac('sha256', secret)
    .update(`${TOKEN_CONTEXT}:${tenantId}:${sessionId}`)
    .digest('hex')
}
