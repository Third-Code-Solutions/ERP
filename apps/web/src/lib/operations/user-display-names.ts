import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { users } from '@third-code-erp/database/schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const UNKNOWN_USER_LABEL = 'a team member'

/** Replace user-id fields with display names; ids not found show a neutral label. */
export function applyUserDisplayNames<T extends object, K extends keyof T>(
  rows: readonly T[],
  fields: readonly K[],
  names: ReadonlyMap<string, string>,
): T[] {
  return rows.map((row) => {
    const next = { ...row }
    for (const field of fields) {
      const id = row[field]
      if (typeof id === 'string') next[field] = (names.get(id) ?? UNKNOWN_USER_LABEL) as T[K]
    }
    return next
  })
}

/** Display-only: resolves ids to names within the caller's tenant. */
export async function withUserDisplayNames<T extends object, K extends keyof T>(
  tenantId: string,
  rows: readonly T[],
  fields: readonly K[],
): Promise<T[]> {
  const ids = [
    ...new Set(
      rows.flatMap((row) => fields.map((field) => row[field])).filter((id): id is T[K] & string => typeof id === 'string' && UUID.test(id)),
    ),
  ]
  const found = ids.length
    ? await db
        .select({ id: users.id, fullName: users.full_name })
        .from(users)
        .where(and(eq(users.tenant_id, tenantId), inArray(users.id, ids)))
    : []
  return applyUserDisplayNames(rows, fields, new Map(found.map((user) => [user.id, user.fullName])))
}
