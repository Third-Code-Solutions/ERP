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

export function hashCortexText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
