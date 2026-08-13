/**
 * ABI OPS Agent memory store (tenant-scoped). Persists every conversation in
 * the user's DB so the AI Brain remembers. Drizzle runs as `postgres` (RLS
 * bypassed), so every query filters tenant_id explicitly, and reads also check
 * user ownership — a user only ever sees their own threads.
 */
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import {
  cortexConversations,
  cortexMessages,
  type CortexConversation,
  type CortexMessage,
} from '../schema/cortex-chat'

type Role = CortexMessage['role']

export interface CortexConversationRecordContext {
  refTable: string
  refId: string
}

export type CortexConversationSummary = Pick<
  CortexConversation,
  | 'id'
  | 'title'
  | 'context_ref_table'
  | 'context_ref_id'
  | 'created_at'
  | 'updated_at'
>

export async function createCortexConversation(
  tenantId: string,
  userId: string,
  title: string | null,
  context: CortexConversationRecordContext | null = null
): Promise<string> {
  const [row] = await db
    .insert(cortexConversations)
    .values({
      tenant_id: tenantId,
      user_id: userId,
      title,
      context_ref_table: context?.refTable ?? null,
      context_ref_id: context?.refId ?? null,
    })
    .returning({ id: cortexConversations.id })
  return row!.id
}

export async function appendCortexMessage(
  tenantId: string,
  userId: string,
  conversationId: string,
  role: Role,
  content: string,
  citations?: unknown
): Promise<void> {
  await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: cortexConversations.id })
      .from(cortexConversations)
      .where(
        and(
          eq(cortexConversations.tenant_id, tenantId),
          eq(cortexConversations.id, conversationId),
          eq(cortexConversations.user_id, userId)
        )
      )
      .limit(1)

    if (!owned) throw new Error('Cortex conversation not found')

    await tx.insert(cortexMessages).values({
      tenant_id: tenantId,
      conversation_id: conversationId,
      role,
      content,
      citations: (citations as object) ?? null,
    })
    await tx
      .update(cortexConversations)
      .set({ updated_at: new Date() })
      .where(
        and(
          eq(cortexConversations.id, owned.id),
          eq(cortexConversations.tenant_id, tenantId)
        )
      )
  })
}

export async function ownsCortexConversation(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<boolean> {
  return Boolean(
    await getCortexConversation(tenantId, userId, conversationId)
  )
}

export async function getCortexConversation(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<CortexConversationSummary | null> {
  const [conversation] = await db
    .select({
      id: cortexConversations.id,
      title: cortexConversations.title,
      context_ref_table: cortexConversations.context_ref_table,
      context_ref_id: cortexConversations.context_ref_id,
      created_at: cortexConversations.created_at,
      updated_at: cortexConversations.updated_at,
    })
    .from(cortexConversations)
    .where(
      and(
        eq(cortexConversations.tenant_id, tenantId),
        eq(cortexConversations.id, conversationId),
        eq(cortexConversations.user_id, userId)
      )
    )
    .limit(1)
  return conversation ?? null
}

export async function listCortexConversations(
  tenantId: string,
  userId: string,
  limit = 20
): Promise<CortexConversationSummary[]> {
  return db
    .select({
      id: cortexConversations.id,
      title: cortexConversations.title,
      context_ref_table: cortexConversations.context_ref_table,
      context_ref_id: cortexConversations.context_ref_id,
      created_at: cortexConversations.created_at,
      updated_at: cortexConversations.updated_at,
    })
    .from(cortexConversations)
    .where(and(eq(cortexConversations.tenant_id, tenantId), eq(cortexConversations.user_id, userId)))
    .orderBy(desc(cortexConversations.updated_at))
    .limit(limit)
}

/** Messages for a conversation the user owns, oldest first; null if not owned. */
export async function getCortexConversationMessages(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<Pick<CortexMessage, 'role' | 'content' | 'citations' | 'created_at'>[] | null> {
  const [owned] = await db
    .select({ id: cortexConversations.id })
    .from(cortexConversations)
    .where(
      and(
        eq(cortexConversations.tenant_id, tenantId),
        eq(cortexConversations.id, conversationId),
        eq(cortexConversations.user_id, userId)
      )
    )
  if (!owned) return null

  return db
    .select({
      role: cortexMessages.role,
      content: cortexMessages.content,
      citations: cortexMessages.citations,
      created_at: cortexMessages.created_at,
    })
    .from(cortexMessages)
    .where(
      and(eq(cortexMessages.tenant_id, tenantId), eq(cortexMessages.conversation_id, conversationId))
    )
    .orderBy(asc(cortexMessages.created_at))
}
