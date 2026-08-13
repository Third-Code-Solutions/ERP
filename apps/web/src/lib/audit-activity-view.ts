import type { AuditActivityQuery } from '@third-code-erp/shared-types'

export const AUDIT_ACTION_OPTIONS = [
  'create',
  'update',
  'delete',
  'approve',
  'lock',
  'archive',
  'stage_change',
] as const

export const AUDIT_ENTITY_OPTIONS = [
  'project',
  'scope_item',
  'bom',
  'invoice',
  'purchase_order',
  'opportunities',
] as const

type FilterParams = Record<string, string | string[] | undefined>

export type AuditActivityViewFilters = Pick<
  AuditActivityQuery,
  'action' | 'entityType'
> & {
  page: number
}

function firstString(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value
  const normalized = candidate?.trim()
  return normalized || undefined
}

function oneOf<const T extends readonly string[]>(
  value: string | undefined,
  options: T
): T[number] | undefined {
  return value && (options as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined
}

export function parseAuditActivityViewParams(
  params: FilterParams | undefined
): AuditActivityViewFilters {
  const rawPage = Number.parseInt(firstString(params?.page) ?? '1', 10)
  const page = Number.isFinite(rawPage)
    ? Math.min(100_000, Math.max(1, rawPage))
    : 1

  return {
    action: oneOf(
      firstString(params?.action),
      AUDIT_ACTION_OPTIONS
    ),
    entityType: oneOf(
      firstString(params?.entityType),
      AUDIT_ENTITY_OPTIONS
    ),
    page,
  }
}

export function auditActivityHref(
  baseHref: string,
  filters: AuditActivityViewFilters,
  page = filters.page
): string {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.entityType) params.set('entityType', filters.entityType)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `${baseHref}?${query}` : baseHref
}
