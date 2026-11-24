import 'server-only'

// Readers for the COC page and actions. They take an already-resolved tenant,
// so they must never live in a 'use server' module, where each export becomes
// a callable action (SEC-10).

import { and, desc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  contacts,
  opportunities,
  signatureSessions,
} from '@third-code-erp/database/schema'

export interface CocSignerDefaults {
  name: string
  email: string
}

/**
 * Primary contact of the client account behind the project: the account of
 * the linked opportunity first, else the project's own account (a project
 * created by hand has no opportunity). Null when there is no such contact.
 */
export async function findDefaultCocSigner(
  tenantId: string,
  projectId: string,
  projectAccountId: string | null
): Promise<CocSignerDefaults | null> {
  const [opportunity] = await db
    .select({ account_id: opportunities.account_id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.project_id, projectId),
        eq(opportunities.tenant_id, tenantId)
      )
    )
    .limit(1)

  const accountId = opportunity?.account_id ?? projectAccountId
  if (!accountId) return null

  const [primary] = await db
    .select({ full_name: contacts.full_name, email: contacts.email })
    .from(contacts)
    .where(
      and(
        eq(contacts.account_id, accountId),
        eq(contacts.tenant_id, tenantId),
        eq(contacts.is_primary, true)
      )
    )
    .limit(1)
  if (!primary) return null

  return { name: primary.full_name?.trim() ?? '', email: primary.email?.trim() ?? '' }
}

/** Signer recorded on the most recent signing link of a certificate, for resend prefill. */
export async function findLatestCocSigner(
  tenantId: string,
  cocId: string
): Promise<CocSignerDefaults | null> {
  const [latest] = await db
    .select({
      signer_name: signatureSessions.signer_name,
      signer_email: signatureSessions.signer_email,
    })
    .from(signatureSessions)
    .where(
      and(
        eq(signatureSessions.tenant_id, tenantId),
        eq(signatureSessions.entity_type, 'coc'),
        eq(signatureSessions.entity_id, cocId)
      )
    )
    .orderBy(desc(signatureSessions.created_at))
    .limit(1)
  if (!latest?.signer_email) return null

  return { name: latest.signer_name?.trim() ?? '', email: latest.signer_email }
}
