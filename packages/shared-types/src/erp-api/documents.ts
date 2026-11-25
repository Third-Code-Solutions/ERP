import { z } from 'zod'

/** DELETE /v1/documents/:documentId has no mutable body. */
export const documentDeleteBodySchema = z.object({}).strict()

export const documentDeleteCommandSchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict()

export const documentDeleteResultSchema = z
  .object({
    documentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    storagePath: z.string().trim().min(1).max(2_000),
    status: z.literal('deleted'),
    derivedScopeItemsRemoved: z.number().int().min(0).max(5_000),
  })
  .strict()

export type DocumentDeleteBody = z.infer<typeof documentDeleteBodySchema>
export type DocumentDeleteCommand = z.infer<
  typeof documentDeleteCommandSchema
>
export type DocumentDeleteResult = z.infer<typeof documentDeleteResultSchema>

/** Known foreign keys that keep a document; any other gets the generic refusal. */
const DOCUMENT_REFERENCE_LABELS = new Map<string, string>([
  ['drawing_revisions_document_tenant_fk', 'a drawing revision'],
  ['quality_hold_point_punchlist_handoffs_plan_document_tenant_fk', 'a punchlist handoff plan'],
])

/** Refusal for a document delete that a foreign key blocked (SQLSTATE 23503). */
export function documentStillReferencedMessage(constraintName: string | undefined): string {
  const label = constraintName ? DOCUMENT_REFERENCE_LABELS.get(constraintName) : undefined
  return label
    ? `Document is still referenced by ${label} and cannot be deleted`
    : 'Document is still referenced and cannot be deleted'
}

// WHATWG URL parsing strips tab/LF/CR (so `.<TAB>.` becomes `..`) and trailing
// spaces, treats `\` as `/`, and `%`, `?`, `#` change how the key is decoded. Every first-party writer
// limits file names to [a-zA-Z0-9._-], so rejecting these loses no real file.
const UNSAFE_STORAGE_PATH_CHARACTER = /[\s\\%?#]/

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * True when a storage object key stays under `${tenantId}/` after a URL parser
 * normalises it. Service-role signing/downloading must check this first because
 * `documents.storage_path` is tenant-writable. Allow-list: the tenant prefix,
 * then non-empty segments that are not `.` or `..`, with no unsafe character.
 */
export function isTenantScopedStoragePath(
  storagePath: string,
  tenantId: string
): boolean {
  if (!tenantId || !storagePath.startsWith(`${tenantId}/`)) return false
  if (UNSAFE_STORAGE_PATH_CHARACTER.test(storagePath) || hasControlCharacter(storagePath)) {
    return false
  }
  return storagePath
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}
