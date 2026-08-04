import { NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import {
  searchCortexNodes,
  searchCortexNodesByTerms,
  cortexSemanticSearch,
  getCortexGraphStats,
  createCortexConversation,
  appendCortexMessage,
  getCortexConversation,
  cortexKeywordAnswer,
  cortexDescribeEntity,
} from '@third-code-erp/database'
import { getOpenAI, embedText } from '@third-code-erp/ai'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'
import {
  hashCortexText,
  redactCortexMessages,
  redactCortexText,
} from '@/lib/cortex/redaction'
import { authorizeCortexRecordContext } from '@/lib/cortex/record-context'
import {
  CORTEX_CITATIONS_HEADER,
  encodeCortexCitationHeader,
} from '@/lib/cortex/citation-header'
import { roleLabel } from '@/lib/operations/nav-config'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  consumeProviderQuota,
  providerQuotaBlockedResponse,
} from '@/lib/provider-quota'

export const runtime = 'nodejs'
export const maxDuration = 30

const recordContextSchema = z.object({
  refTable: z.string().trim().min(1).max(100),
  refId: z.string().uuid(),
})

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(20_000),
      })
    )
    .min(1)
    .max(100),
  conversationId: z.string().uuid().optional(),
  context: recordContextSchema.optional(),
})

/**
 * POST /api/cortex/chat — the Third Code ERP AI Brain (Cortex).
 *
 * A tenant-scoped, graph-grounded agent. It is fed the caller's Cortex graph
 * (tenant-scoped at the source — it can never see another tenant's records),
 * answers ONLY from that context, cites the records it used, and falls back to
 * "not in the graph" when retrieval is weak. Every query is audit-logged.
 */
export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return new Response('Unauthorized', {
      status: 401,
      headers: CORTEX_PRIVATE_HEADERS,
    })
  }

  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return new Response('Invalid chat request', {
      status: 400,
      headers: CORTEX_PRIVATE_HEADERS,
    })
  }
  const {
    messages,
    conversationId: incomingConvId,
    context: incomingContext,
  } = parsed.data

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const redactedUserMessage = redactCortexText(lastUserMessage)
  const redactedMessages = redactCortexMessages(messages)

  // Persist into the user's DB (the agent's memory). Resolve/create the thread,
  // store the incoming user turn now; the assistant turn is stored once the
  // stream completes. Best-effort — never block the chat on a write.
  let conversationId = incomingConvId ?? null
  let authorizedContext: Awaited<
    ReturnType<typeof authorizeCortexRecordContext>
  > = null
  if (conversationId) {
    const conversation = await getCortexConversation(
      profile.tenantId,
      profile.user.id,
      conversationId
    )
    if (!conversation) {
      return new Response('Conversation not found', {
        status: 404,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }

    const storedContext =
      conversation.context_ref_table && conversation.context_ref_id
        ? {
            refTable: conversation.context_ref_table,
            refId: conversation.context_ref_id,
          }
        : null
    if (
      incomingContext &&
      (!storedContext ||
        incomingContext.refTable !== storedContext.refTable ||
        incomingContext.refId !== storedContext.refId)
    ) {
      return new Response('Conversation context mismatch', {
        status: 409,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }
    if (
      Boolean(conversation.context_ref_table) !==
      Boolean(conversation.context_ref_id)
    ) {
      return new Response('Conversation not found', {
        status: 404,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }
    if (storedContext) {
      authorizedContext = await authorizeCortexRecordContext(
        profile.tenantId,
        profile.role,
        storedContext
      )
      if (!authorizedContext) {
        return new Response('Conversation not found', {
          status: 404,
          headers: CORTEX_PRIVATE_HEADERS,
        })
      }
    }
  } else if (incomingContext) {
    authorizedContext = await authorizeCortexRecordContext(
      profile.tenantId,
      profile.role,
      incomingContext
    )
    if (!authorizedContext) {
      return new Response('Focused record not found', {
        status: 404,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }
  }

  // Shared Redis quota is optional per tenant. When enabled, fail closed
  // before any external model/embedding work if NestJS cannot account it.
  if (process.env.OPENAI_API_KEY) {
    const quota = await consumeProviderQuota(
      'provider-chat',
      profile.tenantId
    )
    if (!quota.ok) {
      return providerQuotaBlockedResponse(quota, CORTEX_PRIVATE_HEADERS)
    }
  }

  try {
    if (!conversationId) {
      conversationId = await createCortexConversation(
        profile.tenantId,
        profile.user.id,
        redactCortexText(lastUserMessage.slice(0, 80)) || 'New conversation',
        authorizedContext
          ? {
              refTable: authorizedContext.refTable,
              refId: authorizedContext.refId,
            }
          : null
      )
    }
    if (lastUserMessage) {
      await appendCortexMessage(
        profile.tenantId,
        profile.user.id,
        conversationId,
        'user',
        lastUserMessage
      )
    }
  } catch (err) {
    console.error('[cortex/chat] persist user turn failed:', err)
  }

  // RBAC: Cortex obeys the SAME role permissions as the human. `scope` is the
  // set of node types this role may see (null = unrestricted for admin/owner).
  // It is applied to EVERY retrieval below, so the agent can never surface a
  // record the user couldn't open in the UI (spec §7).
  const scope = cortexNodeTypeScope(profile.role)

  // Ground the agent in the tenant's graph: high-level shape, a recent sample,
  // and records that match the question's keywords.
  const terms = lastUserMessage.toLowerCase().split(/[^a-z0-9₱]+/i).filter(Boolean)
  const [stats, recent, matches] = await Promise.all([
    getCortexGraphStats(profile.tenantId, scope),
    searchCortexNodes(profile.tenantId, { limit: 40, nodeTypes: scope }),
    searchCortexNodesByTerms(profile.tenantId, terms, 12, scope),
  ])
  const focused = authorizedContext
    ? await cortexDescribeEntity(
        profile.tenantId,
        authorizedContext.refTable,
        authorizedContext.refId,
        scope
      )
    : null

  const shape = stats.byType.map((t) => `${t.nodeType}:${t.count}`).join(', ')
  const fmt = (n: { node_type: string; title: string | null; summary: string | null }) =>
    `- [${n.node_type}] ${redactCortexText(n.title ?? '(untitled)')}${n.summary ? ` — ${redactCortexText(n.summary)}` : ''}`
  const relevant = matches.map(fmt).join('\n')
  const records = recent.map(fmt).join('\n')

  // Semantic retrieval — only contributes once nodes are embedded. Guarded so a
  // missing key / unindexed graph never breaks the chat.
  let semantic = ''
  try {
    if (process.env.OPENAI_API_KEY && redactedUserMessage) {
      const qEmbedding = await embedText(redactedUserMessage)
      const hits = await cortexSemanticSearch(profile.tenantId, qEmbedding, { limit: 8, nodeTypes: scope })
      semantic = hits.map((h) => fmt(h.node)).join('\n')
    }
  } catch (err) {
    console.error('[cortex/chat] semantic retrieval skipped:', err)
  }

  const systemPrompt = `You are Cortex, the AI Brain for Third Code ERP, a construction ERP for Philippine MEP contractors.
You see the user's company knowledge graph — a permissioned, live mirror of ERP records. Answer using the records below.

ACCESS: You are answering a "${roleLabel(profile.role)}" user. ${
    scope
      ? `Their role may ONLY see these record types: ${scope.join(', ')}. The records below are already filtered to that permission — never invent, infer, or reference any record or record type outside the lists below. If asked about something their role cannot access (e.g. a Sales user asking about invoices), say you don't have access to that.`
      : 'This is an admin/owner with full access to every record type.'
  }

How to answer:
- Be genuinely helpful. For broad questions like "what changed recently", "what's new", "give me an overview", "what's active" — summarise the MOST RECENTLY UPDATED RECORDS below (they are ordered newest-first).
- For specific questions, use the RELEVANT RECORDS that match the question.
- Always cite the records you used by [type] and title, e.g. "(BOM A · Acme Tower)".
- Money is in Philippine Pesos (₱). Be concise and specific.
- Only say "I don't have that in the graph yet" if NONE of the records below are relevant — never guess beyond them.

GRAPH SHAPE (counts by record type): ${shape || 'empty'}

CONVERSATION FOCUS (the canonical ERP record this thread is bound to):
${focused?.found ? redactCortexText(focused.summary) : '(whole-company conversation)'}

SEMANTICALLY RELATED RECORDS (closest in meaning):
${semantic || '(semantic index not built yet)'}

RELEVANT RECORDS (match the question keywords):
${relevant || '(none matched by keyword)'}

MOST RECENTLY UPDATED RECORDS (newest first):
${records || '(no records visible)'}`

  // Audit every AI query (PRD §11 / F4). Store only a redacted preview plus a
  // stable hash; raw user text must not be copied into the audit chain.
  const model = process.env.OPENAI_API_KEY
    ? 'gpt-4o-mini'
    : 'deterministic-grounded'
  const promptHash = hashCortexText(
    `${systemPrompt}\n${JSON.stringify(redactedMessages)}`
  )
  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'cortex_chat',
      entityId: profile.user.id,
      action: 'query',
      diff: {
        phase: 'started',
        model,
        prompt_hash: promptHash,
        prompt_char_count: systemPrompt.length,
        message_count: messages.length,
        graph_records_in_context: recent.length,
        prompt_preview: redactedUserMessage.slice(0, 1000),
        context_ref_table: authorizedContext?.refTable ?? null,
        context_ref_id: authorizedContext?.refId ?? null,
      },
    })
  } catch (err) {
    console.error('[cortex/chat] audit log failed:', err)
  }

  // Deterministic, always-available grounded answer (keyword match over the
  // graph). The agent's fallback when no LLM is configured or it fails — and
  // its cited records are persisted with the assistant turn either way.
  const keywordGrounded = await cortexKeywordAnswer(
    profile.tenantId,
    lastUserMessage,
    scope
  )
  const grounded =
    focused?.found && keywordGrounded.citations.length === 0
      ? {
          answer: focused.summary,
          citations: focused.citations,
        }
      : keywordGrounded

  type ChatChunk = { choices: { delta?: { content?: string | null } }[] }
  let llmStream: AsyncIterable<ChatChunk> | null = null
  let llmFailed = false
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = getOpenAI()
      llmStream = (await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...redactedMessages,
        ],
        stream: true,
        max_tokens: 800,
      })) as AsyncIterable<ChatChunk>
    } catch (err) {
      console.error('[cortex/chat] LLM unavailable, using grounded fallback:', err)
      llmFailed = true
      llmStream = null
    }
  }

  const encoder = new TextEncoder()
  const convId = conversationId
  const readable = new ReadableStream({
    async start(controller) {
      let assistant = ''
      if (llmStream) {
        try {
          for await (const chunk of llmStream) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) {
              assistant += text
              controller.enqueue(encoder.encode(text))
            }
          }
        } catch (err) {
          console.error('[cortex/chat] LLM stream failed mid-flight:', err)
          llmFailed = true
        }
      }
      // No LLM (or it failed) → stream the deterministic grounded answer.
      if (!assistant) {
        assistant = grounded.answer
        controller.enqueue(encoder.encode(assistant))
      }
      try {
        await writeAuditLog({
          tenantId: profile.tenantId,
          actorId: profile.user.id,
          entityType: 'cortex_chat',
          entityId: profile.user.id,
          action: 'query',
          diff: {
            phase: 'completed',
            model,
            outcome: llmFailed
              ? 'model_failed_grounded_fallback'
              : llmStream
                ? 'model'
                : 'deterministic_grounded',
            prompt_hash: promptHash,
            response_hash: hashCortexText(assistant),
            response_preview: redactCortexText(assistant).slice(0, 1000),
            citation_count: grounded.citations.length,
          },
        })
      } catch (err) {
        console.error('[cortex/chat] completion audit failed:', err)
      }
      controller.close()
      // Store the assistant turn + the records it cited into the agent's memory.
      if (assistant && convId) {
        try {
          await appendCortexMessage(
            profile.tenantId,
            profile.user.id,
            convId,
            'assistant',
            assistant,
            grounded.citations
          )
        } catch (err) {
          console.error('[cortex/chat] persist assistant turn failed:', err)
        }
      }
    },
  })

  const headers: Record<string, string> = {
    ...CORTEX_PRIVATE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
  }
  if (convId) headers['X-Conversation-Id'] = convId
  const citationHeader = encodeCortexCitationHeader(grounded.citations)
  if (citationHeader) headers[CORTEX_CITATIONS_HEADER] = citationHeader
  return new Response(readable, { headers })
}
