import type { AppRole } from '@third-code-erp/auth'
import {
  canUniversalSearchEntity,
  universalSearchHitTypes,
  type UniversalSearchHitType,
} from '@third-code-erp/shared-types'

export type SearchHitType = UniversalSearchHitType

export { universalSearchHitTypes }

export const MAX_SEARCH_QUERY_LENGTH = 100

export function normalizeSearchQuery(value: string | null): string {
  return (value ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/**
 * Build a PostgreSQL ILIKE pattern that treats user input as literal text.
 * Backslashes must be escaped before `%` and `_` so input cannot change
 * wildcard semantics.
 */
export function literalSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`
}

/** Shared policy keeps Web compatibility and Core authority aligned. */
export function canSearchEntity(role: AppRole, type: SearchHitType): boolean {
  return canUniversalSearchEntity(role, type)
}
