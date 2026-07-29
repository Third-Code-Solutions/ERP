export const CORTEX_DRAFT_MAX_LENGTH = 100
export const CORTEX_DRAFT_TTL_MS = 5 * 60 * 1000

const CORTEX_DRAFT_KEY_PREFIX = 'third-code-erp:cortex-draft:'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface StoredCortexDraft {
  draft: string
  createdAt: number
}

export function normalizeCortexDraft(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, CORTEX_DRAFT_MAX_LENGTH)
}

export function isCortexDraftHandoffId(
  value: string | null | undefined
): value is string {
  return Boolean(value && UUID_PATTERN.test(value))
}

function cortexDraftKey(handoffId: string): string {
  return `${CORTEX_DRAFT_KEY_PREFIX}${handoffId}`
}

export function stageCortexDraft(
  storage: DraftStorage,
  handoffId: string,
  value: string,
  now = Date.now()
): string | null {
  if (!isCortexDraftHandoffId(handoffId)) return null
  const draft = normalizeCortexDraft(value)
  if (draft.length < 2) return null

  const payload: StoredCortexDraft = { draft, createdAt: now }
  try {
    storage.setItem(cortexDraftKey(handoffId), JSON.stringify(payload))
    return draft
  } catch {
    return null
  }
}

export function consumeCortexDraft(
  storage: DraftStorage,
  handoffId: string,
  now = Date.now()
): string | null {
  if (!isCortexDraftHandoffId(handoffId)) return null

  let raw: string | null
  try {
    const key = cortexDraftKey(handoffId)
    raw = storage.getItem(key)
    storage.removeItem(key)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const payload = JSON.parse(raw) as Partial<StoredCortexDraft>
    if (
      typeof payload.draft !== 'string' ||
      typeof payload.createdAt !== 'number' ||
      !Number.isFinite(payload.createdAt) ||
      payload.createdAt > now ||
      now - payload.createdAt > CORTEX_DRAFT_TTL_MS
    ) {
      return null
    }
    const draft = normalizeCortexDraft(payload.draft)
    return draft.length >= 2 ? draft : null
  } catch {
    return null
  }
}
