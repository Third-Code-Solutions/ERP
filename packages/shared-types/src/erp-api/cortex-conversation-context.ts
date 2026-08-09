import { z } from 'zod'
import {
  cortexConversationContextSchema,
  cortexConversationIdSchema,
} from './cortex-conversations'

/** The browser may request only a source-table/UUID pair. Core canonicalizes it. */
export const cortexConversationContextRefSchema = z
  .object({
    // Keep the transport as permissive as the existing chat request. Core
    // maps unsupported tables to the same non-enumerating 404 as legacy chat.
    refTable: z.string().trim().min(1).max(100),
    refId: z.string().uuid(),
  })
  .strict()

function parseJsonQueryValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Read-only owner/context resolution input. Tenant, actor, and role are never
 * accepted here; Nest derives them from the authenticated principal.
 */
export const cortexConversationContextResolveQuerySchema = z
  .object({
    conversationId: cortexConversationIdSchema.optional(),
    context: z.preprocess(
      parseJsonQueryValue,
      cortexConversationContextRefSchema.optional()
    ),
  })
  .strict()

/**
 * The result deliberately contains no messages or retrieval material. This
 * keeps ownership/context parity independent from chat history and grounding.
 */
export const cortexConversationContextResolveResponseSchema = z
  .object({
    conversationId: cortexConversationIdSchema.nullable(),
    context: cortexConversationContextSchema.nullable(),
  })
  .strict()

export type CortexConversationContextRef = z.infer<
  typeof cortexConversationContextRefSchema
>
export type CortexConversationContextResolveQuery = z.infer<
  typeof cortexConversationContextResolveQuerySchema
>
export type CortexConversationContextResolveResponse = z.infer<
  typeof cortexConversationContextResolveResponseSchema
>
