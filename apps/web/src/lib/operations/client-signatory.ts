import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@third-code-erp/database'
import { contacts, projects } from '@third-code-erp/database/schema'

export type ClientSignatory = {
  email: string
  name: string
}

const signerEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase())

/** Resolves only the tenant-scoped primary contact of the project's account. */
export async function resolvePrimaryClientSignatory(
  tenantId: string,
  projectId: string
): Promise<ClientSignatory | null> {
  const [project] = await db
    .select({ accountId: projects.account_id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId)))
    .limit(1)
  if (!project?.accountId) return null

  const [contact] = await db
    .select({ name: contacts.full_name, email: contacts.email })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenant_id, tenantId),
        eq(contacts.account_id, project.accountId),
        eq(contacts.is_primary, true)
      )
    )
    .limit(1)
  const email = signerEmailSchema.safeParse(contact?.email)
  if (!contact || !email.success) return null

  return { email: email.data, name: contact.name }
}
