import { describe, expect, it } from 'vitest'
import {
  CORTEX_DRAFT_MAX_LENGTH,
  CORTEX_DRAFT_TTL_MS,
  consumeCortexDraft,
  isCortexDraftHandoffId,
  normalizeCortexDraft,
  stageCortexDraft,
} from './draft-handoff'

const HANDOFF_ID = '11111111-1111-4111-8111-111111111111'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    size: () => values.size,
    setRaw: (key: string, value: string) => values.set(key, value),
  }
}

describe('Cortex draft handoff', () => {
  it('normalizes whitespace and caps browser input', () => {
    expect(normalizeCortexDraft('  Which   project\nneeds attention?  ')).toBe(
      'Which project needs attention?'
    )
    expect(normalizeCortexDraft('x'.repeat(150))).toHaveLength(
      CORTEX_DRAFT_MAX_LENGTH
    )
  })

  it('accepts only opaque UUID handoff identifiers', () => {
    expect(isCortexDraftHandoffId(HANDOFF_ID)).toBe(true)
    expect(isCortexDraftHandoffId('draft=show-payroll')).toBe(false)
    expect(isCortexDraftHandoffId(null)).toBe(false)
  })

  it('stages and consumes a draft exactly once', () => {
    const storage = memoryStorage()

    expect(
      stageCortexDraft(storage, HANDOFF_ID, '  Show project risks  ', 1_000)
    ).toBe('Show project risks')
    expect(storage.size()).toBe(1)
    expect(consumeCortexDraft(storage, HANDOFF_ID, 1_001)).toBe(
      'Show project risks'
    )
    expect(storage.size()).toBe(0)
    expect(consumeCortexDraft(storage, HANDOFF_ID, 1_002)).toBeNull()
  })

  it('removes and rejects expired drafts', () => {
    const storage = memoryStorage()
    stageCortexDraft(storage, HANDOFF_ID, 'Show project risks', 1_000)

    expect(
      consumeCortexDraft(
        storage,
        HANDOFF_ID,
        1_000 + CORTEX_DRAFT_TTL_MS + 1
      )
    ).toBeNull()
    expect(storage.size()).toBe(0)
  })

  it('removes and rejects malformed payloads', () => {
    const storage = memoryStorage()
    storage.setRaw(
      `third-code-erp:cortex-draft:${HANDOFF_ID}`,
      '{"draft":42,"createdAt":"today"}'
    )

    expect(consumeCortexDraft(storage, HANDOFF_ID, 1_000)).toBeNull()
    expect(storage.size()).toBe(0)
  })
})
