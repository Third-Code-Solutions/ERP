import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { can, getUserProfile } from '@third-code-erp/auth'
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
import {
  cortexGraphRefTableMatchesType,
  cortexGraphRefTableSchema,
  cortexAssistantGenerationAcceptedSchema,
  isCortexGraphRefTable,
  type CortexConversationAssistantTurnClaimResult,
  type CortexConversationAssistantTurnOutcome,
} from '@third-code-erp/shared-types'
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
import {
  appendCortexConversationUserTurnThroughCoreApi,
  claimCortexConversationAssistantTurnThroughCoreApi,
  completeCortexConversationAssistantTurnThroughCoreApi,
  startCortexAssistantGenerationJobThroughCoreApi,
  cortexAssistantGenerationJobsUseCoreApi,
  cortexAssistantTurnIdempotencyKey,
  cortexConversationAssistantTurnWritesUseCoreApi,
  cortexConversationUserTurnWritesUseCoreApi,
} from '@/lib/erp-core-client'

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

type CortexPromptNode = {
  id: string
  node_type: string
  ref_table: string
  ref_id: string
  title: string | null
  summary: string | null
}

/** Only canonical, UUID-backed graph rows may enter an AI prompt. */
function isSafeCortexPromptNode(node: {
  id?: unknown
  node_type?: unknown
  ref_table?: unknown
  ref_id?: unknown
  title?: unknown
  summary?: unknown
}): node is CortexPromptNode {
  if (
    typeof node.id !== 'string' ||
    !z.string().uuid().safeParse(node.id).success ||
    typeof node.node_type !== 'string' ||
    typeof node.ref_table !== 'string' ||
    !isCortexGraphRefTable(node.ref_table) ||
    !cortexGraphRefTableMatchesType(node.ref_table, node.node_type) ||
    typeof node.ref_id !== 'string' ||
    !z.string().uuid().safeParse(node.ref_id).success
  ) {
    return false
  }

  return (
    (node.title === null || typeof node.title === 'string') &&
    (node.summary === null || typeof node.summary === 'string')
  )
}

/**
 * POST /api/cortex/chat — the ABI OPS AI Brain (Cortex).
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
  if (!can(profile.role, 'cortex.assistant.use')) {
    return new Response('Forbidden', {
      status: 403,
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
  const userTurnIdempotencyKey =
    req.headers.get('idempotency-key')?.trim() || randomUUID()
  const redactedUserMessage = redactCortexText(lastUserMessage)
  const redactedMessages = redactCortexMessages(messages)

  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'cortex_chat',
      entityId: profile.user.id,
      action: 'query',
      diff: {
        phase: 'request',
        input_category: 'cortex_chat_message',
        user_message_character_count: lastUserMessage.length,
        message_count: messages.length,
        has_conversation_id: Boolean(incomingConvId),
        has_context: Boolean(incomingContext),
      },
    })
  } catch {
    console.error('[cortex/chat] audit log failed')
    return new Response('Cortex is temporarily unavailable.', {
      status: 503,
      headers: CORTEX_PRIVATE_HEADERS,
    })
  }

  // Resolve the owned thread and persist the incoming user turn. Selected
  // tenants fail closed through ERP Core; legacy tenants retain the existing
  // best-effort direct-write path during the incremental migration.
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

  const useCoreUserTurn =
    cortexConversationUserTurnWritesUseCoreApi(profile.tenantId)
  const useCoreAssistantTurn =
    cortexConversationAssistantTurnWritesUseCoreApi(profile.tenantId)
  const useCoreGenerationJob =
    cortexAssistantGenerationJobsUseCoreApi(profile.tenantId)
  let providerEnabled = Boolean(process.env.OPENAI_API_KEY)
  if (useCoreAssistantTurn && !useCoreUserTurn) {
    return new Response(
      'Cortex assistant authority requires Core user-turn authority.',
      { status: 503, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  if (useCoreGenerationJob && (!useCoreAssistantTurn || !useCoreUserTurn)) {
    return new Response(
      'Cortex generation jobs require Core user-turn and assistant authority.',
      { status: 503, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  // Preserve compatibility ordering. Selected Core assistant generation uses
  // its durable claim first so completed/concurrent retries spend no provider
  // quota and make no duplicate model call.
  if (providerEnabled && !useCoreAssistantTurn) {
    const quota = await consumeProviderQuota(
      'provider-chat',
      profile.tenantId
    )
    if (!quota.ok) {
      return providerQuotaBlockedResponse(quota, CORTEX_PRIVATE_HEADERS)
    }
  }

  let userMessageId: string | null = null
  if (useCoreUserTurn) {
    if (!lastUserMessage) {
      return new Response('Invalid chat request', {
        status: 400,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }
    const coreRefTable = incomingContext
      ? cortexGraphRefTableSchema.safeParse(incomingContext.refTable)
      : null
    if (coreRefTable && !coreRefTable.success) {
      return new Response('Focused record not found', {
        status: 404,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }
    const persisted = await appendCortexConversationUserTurnThroughCoreApi(
      {
        ...(conversationId ? { conversationId } : {}),
        ...(incomingContext && coreRefTable?.success
          ? {
              context: {
                refTable: coreRefTable.data,
                refId: incomingContext.refId,
              },
            }
          : {}),
        content: lastUserMessage,
      },
      userTurnIdempotencyKey
    )
    if (!persisted.ok || !persisted.data) {
      return new Response(
        persisted.error ?? 'Cortex user-turn service is unavailable.',
        {
          status: persisted.status ?? 503,
          headers: CORTEX_PRIVATE_HEADERS,
        }
      )
    }
    conversationId = persisted.data.conversationId
    userMessageId = persisted.data.messageId
  } else {
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
    } catch {
      console.error('[cortex/chat] persist user turn failed')
    }
  }

  type ClaimedAssistantTurn = Extract<
    CortexConversationAssistantTurnClaimResult,
    { status: 'claimed' }
  >
  let assistantClaim: ClaimedAssistantTurn | null = null
  const assistantIdempotencyKey = cortexAssistantTurnIdempotencyKey(
    userTurnIdempotencyKey
  )
  if (useCoreAssistantTurn) {
    if (!conversationId || !userMessageId) {
      return new Response('Official Cortex user turn was not stored.', {
        status: 503,
        headers: CORTEX_PRIVATE_HEADERS,
      })
    }
    const claimed = await claimCortexConversationAssistantTurnThroughCoreApi(
      { conversationId, userMessageId },
      assistantIdempotencyKey,
      { tenantId: profile.tenantId, userId: profile.user.id }
    )
    if (!claimed.ok || !claimed.data) {
      return new Response(
        claimed.error ?? 'Cortex assistant generation is unavailable.',
        {
          status: claimed.status ?? 503,
          headers: CORTEX_PRIVATE_HEADERS,
        }
      )
    }
    if (claimed.data.status === 'in_progress') {
      return new Response('Cortex response generation is already in progress.', {
        status: 409,
        headers: {
          ...CORTEX_PRIVATE_HEADERS,
          'Retry-After': String(claimed.data.retryAfterSeconds),
        },
      })
    }
    if (claimed.data.status === 'succeeded') {
      const replayHeaders: Record<string, string> = {
        ...CORTEX_PRIVATE_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Conversation-Id': claimed.data.conversationId,
      }
      const replayCitationHeader = encodeCortexCitationHeader(
        claimed.data.citations
      )
      if (replayCitationHeader) {
        replayHeaders[CORTEX_CITATIONS_HEADER] = replayCitationHeader
      }
      return new Response(claimed.data.content, { headers: replayHeaders })
    }
    assistantClaim = claimed.data
  }

  if (useCoreGenerationJob && assistantClaim) {
    const principal = {
      tenantId: profile.tenantId,
      userId: profile.user.id,
    }
    const started = await startCortexAssistantGenerationJobThroughCoreApi(
      {
        requestId: assistantClaim.requestId,
        claimToken: assistantClaim.claimToken,
      },
      assistantIdempotencyKey,
      principal
    )
    if (!started.ok || !started.data) {
      return new Response(
        started.error ?? 'Cortex assistant generation job is unavailable.',
        { status: started.status ?? 503, headers: CORTEX_PRIVATE_HEADERS }
      )
    }

    const accepted = cortexAssistantGenerationAcceptedSchema.parse({
      status: 'accepted',
      jobId: started.data.jobId,
      conversationId: assistantClaim.conversationId,
      retryAfterMs: 1_000,
    })
    const location = `/api/cortex/chat/jobs/${accepted.jobId}`
    return new Response(JSON.stringify(accepted), {
      status: 202,
      headers: {
        ...CORTEX_PRIVATE_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        Location: location,
        'Retry-After': '1',
        'X-Conversation-Id': accepted.conversationId,
      },
    })
  }

  if (providerEnabled && useCoreAssistantTurn) {
    const quota = await consumeProviderQuota(
      'provider-chat',
      profile.tenantId
    )
    if (!quota.ok) {
      providerEnabled = false
    }
  }

  // RBAC: Cortex obeys the SAME role permissions as the human. `scope` is the
  // set of node types this role may see (null = unrestricted for admin/owner).
  // It is applied to EVERY retrieval below, so the agent can never surface a
  // record the user couldn't open in the UI (spec §7).
  const scope = cortexNodeTypeScope(profile.role)

  // Ground the agent in the tenant's graph: high-level shape, a recent sample,
  // and records that match the question's keywords.
  const terms = lastUserMessage.toLowerCase().split(/[^a-z0-9₱]+/i).filter(Boolean)
  const [stats, recentRows, matchRows] = await Promise.all([
    getCortexGraphStats(profile.tenantId, scope),
    searchCortexNodes(profile.tenantId, { limit: 40, nodeTypes: scope }),
    searchCortexNodesByTerms(profile.tenantId, terms, 12, scope),
  ])
  const recent = recentRows.filter(isSafeCortexPromptNode)
  const matches = matchRows.filter(isSafeCortexPromptNode)
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
      semantic = hits
        .filter((hit) => isSafeCortexPromptNode(hit.node))
        .map((hit) => fmt(hit.node))
        .join('\n')
    }
  } catch {
    console.error('[cortex/chat] semantic retrieval skipped')
  }

  const systemPrompt = `You are Cortex, the AI Brain for ABI OPS, a construction operations system for Philippine MEP contractors.
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

  // Legacy tenants keep the redacted Next audit. For selected tenants, the
  // authoritative claim and completion audits commit atomically in ERP Core.
  const model = providerEnabled
    ? 'gpt-4o-mini'
    : 'deterministic-grounded'
  const promptHash = hashCortexText(
    `${systemPrompt}\n${JSON.stringify(redactedMessages)}`
  )
  if (!useCoreAssistantTurn) {
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
    } catch {
      console.error('[cortex/chat] started audit log failed')
    }
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
  if (providerEnabled) {
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
    } catch {
      console.error('[cortex/chat] LLM unavailable, using grounded fallback')
      llmFailed = true
      llmStream = null
    }
  }

  const encoder = new TextEncoder()
  const convId = conversationId
  const readable = new ReadableStream({
    async start(controller) {
      let assistant = ''
      let modelStreamProducedText = false
      if (llmStream) {
        try {
          for await (const chunk of llmStream) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) {
              modelStreamProducedText = true
              assistant += text
              controller.enqueue(encoder.encode(text))
            }
          }
        } catch {
          console.error('[cortex/chat] LLM stream failed mid-flight')
          llmFailed = true
        }
      }
      // No LLM (or it failed) → stream the deterministic grounded answer.
      if (!assistant) {
        assistant = grounded.answer
        controller.enqueue(encoder.encode(assistant))
      }
      const responseOutcome: CortexConversationAssistantTurnOutcome = llmFailed
        ? modelStreamProducedText
          ? 'model_stream_failed_partial'
          : 'model_failed_grounded_fallback'
        : llmStream
          ? 'model'
          : 'deterministic_grounded'
      if (!assistantClaim) {
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
              outcome: responseOutcome,
              prompt_hash: promptHash,
              response_hash: hashCortexText(assistant),
              response_preview: redactCortexText(assistant).slice(0, 1000),
              citation_count: grounded.citations.length,
            },
          })
        } catch {
          console.error('[cortex/chat] completion audit failed')
        }
      }
      // Store the assistant turn + the records it cited into the agent's memory.
      if (assistant && convId) {
        if (assistantClaim) {
          const completed =
            await completeCortexConversationAssistantTurnThroughCoreApi(
              {
                requestId: assistantClaim.requestId,
                claimToken: assistantClaim.claimToken,
                content: assistant,
                citationNodeIds: grounded.citations.map(
                  (citation) => citation.nodeId
                ),
                outcome: responseOutcome,
                model,
              },
              assistantIdempotencyKey,
              { tenantId: profile.tenantId, userId: profile.user.id }
            )
          if (!completed.ok) {
            console.error('[cortex/chat] Core assistant completion failed')
          }
        } else {
          try {
            await appendCortexMessage(
              profile.tenantId,
              profile.user.id,
              convId,
              'assistant',
              assistant,
              grounded.citations
            )
          } catch {
            console.error('[cortex/chat] persist assistant turn failed')
          }
        }
      }
      controller.close()
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
