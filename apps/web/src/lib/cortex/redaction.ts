import { createHash } from 'node:crypto'
import { redactCortexText } from '@third-code-erp/shared-types'

/**
 * Cortex prompt inputs are tenant-scoped, but tenant scope is not a privacy
 * boundary for an external model. Keep model context useful while removing
 * common direct identifiers before anything leaves the ERP runtime.
 */
export { redactCortexText }

export interface CortexPromptMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function redactCortexMessages<T extends CortexPromptMessage>(
  messages: readonly T[]
): T[] {
  return messages.map((message) => ({
    ...message,
    content: redactCortexText(message.content),
  }))
}

// Angle brackets, their look-alikes NFKC leaves alone, and their HTML entities:
// any of them could read as the end of a <records> fence.
const FENCE_CHARACTERS =
  /[<>‹›〈〉❮❯⟨⟩〈〉]|&(?:lt|gt|#0*6[02]|#x0*3[ce]);?/gi

/**
 * Record text that users and outside parties typed, made safe to place inside a
 * fenced block of a model prompt: normalized, stripped of anything that could
 * close the fence, then redacted and capped. Stripping comes first so a removed
 * bracket cannot rejoin an identifier the redaction already passed over.
 */
export function untrustedPromptText(value: string, maxChars: number): string {
  let text = value.normalize('NFKC')
  let previous: string
  // Repeat until stable: removing "&lt;" from "&l&lt;t;" once leaves a new "&lt;".
  do {
    previous = text
    text = text.replace(FENCE_CHARACTERS, '')
  } while (text !== previous)
  return redactCortexText(text).slice(0, maxChars)
}

/** Single-line variant so a record title cannot start a prompt line of its own. */
export function untrustedPromptLine(value: string, maxChars: number): string {
  return untrustedPromptText(value.replace(/\s+/g, ' ').trim(), maxChars)
}

export function hashCortexText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
