import 'server-only'

import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { signatureSessions } from '@third-code-erp/database/schema'
import { hashToken, type SignableEntityType } from './integrations/canvas-sign'

/**
 * Invalidate every unsigned signing link for one entity, so a reissued or
 * cancelled request can never be signed through an older link. Tenant-scoped;
 * already-signed and already-revoked sessions are left untouched.
 *
 * `keepToken` is the plaintext token of the freshly issued link, which must
 * stay valid. For DocuSeal no session row exists, so nothing matches it.
 */
export async function revokeOpenSigningSessions(
  tenantId: string,
  entityType: SignableEntityType,
  entityId: string,
  keepToken?: string
): Promise<void> {
  await db
    .update(signatureSessions)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(signatureSessions.tenant_id, tenantId),
        eq(signatureSessions.entity_type, entityType),
        eq(signatureSessions.entity_id, entityId),
        isNull(signatureSessions.signed_at),
        isNull(signatureSessions.revoked_at),
        keepToken
          ? ne(signatureSessions.token_hash, hashToken(keepToken))
          : undefined
      )
    )
}
