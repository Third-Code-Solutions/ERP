import { createHash } from 'node:crypto'

/**
 * Cortex prompt inputs are tenant-scoped, but tenant scope is not a privacy
 * boundary for an external model. Keep model context useful while removing
 * common direct identifiers before anything leaves the ERP runtime.
 */
const REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[email redacted]',
  ],
  [
    /\b(?:TIN|tax identification number)\s*[:#-]?\s*\d{3}[- ]?\d{3}[- ]?\d{3}(?:[- ]?\d{3})?\b/gi,
    '[tax id redacted]',
  ],
  [
    /\b\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3})?\b/g,
    '[tax id redacted]',
  ],
  [/(?:\+63|0)9\d{9}\b/g, '[phone redacted]'],
]

export function redactCortexText(value: string): string {
  return REDACTION_RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  )
}

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

export function hashCortexText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
