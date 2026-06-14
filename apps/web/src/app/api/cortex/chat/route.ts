import { NextRequest } from 'next/server'
import { getUserProfile } from '@buildops/auth'
import {
  searchCortexNodes,
  getCortexGraphStats,
  createCortexConversation,
  appendCortexMessage,
  cortexKeywordAnswer,
} from '@buildops/database'
import { getOpenAI } from '@buildops/ai'
import { writeAuditLog } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/cortex/chat — the BuildOps AI Brain (Atlas).
 *
 * A tenant-scoped, graph-grounded agent. It is fed the caller's Cortex graph
 * (tenant-scoped at the source — it can never see another tenant's records),
 * answers ONLY from that context, cites the records it used, and falls back to
 * "not in the graph" when retrieval is weak. Every query is audit-logged.
 */
export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return new Response('Unauthorized', { status: 401 })

  const { messages, conversationId: incomingConvId } = (await req.json()) as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    conversationId?: string
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // Persist into the user's DB (the agent's memory). Resolve/create the thread,
  // store the incoming user turn now; the assistant turn is stored once the
  // stream completes. Best-effort — never block the chat on a write.
  let conversationId = incomingConvId ?? null
  try {
    if (!conversationId) {
      conversationId = await createCortexConversation(
        profile.tenantId,
        profile.user.id,
        lastUserMessage.slice(0, 80) || 'New conversation'
      )
    }
    if (lastUserMessage) {
      await appendCortexMessage(profile.tenantId, conversationId, 'user', lastUserMessage)
    }
  } catch (err) {
    console.error('[cortex/chat] persist user turn failed:', err)
  }

  // Ground the agent in the tenant's graph: high-level shape + a recent sample.
  const [stats, recent] = await Promise.all([
    getCortexGraphStats(profile.tenantId),
    searchCortexNodes(profile.tenantId, { limit: 60 }),
  ])

  const shape = stats.byType.map((t) => `${t.nodeType}:${t.count}`).join(', ')
  const records = recent
    .map((n) => `- [${n.node_type}] ${n.title ?? '(untitled)'}${n.summary ? ` — ${n.summary}` : ''}`)
    .join('\n')

  const systemPrompt = `You are Cortex, the AI Brain for BuildOps, a construction ERP for Philippine MEP contractors.
You can see the user's company knowledge graph (a permissioned mirror of every ERP record). You must answer ONLY from the GRAPH CONTEXT below.

Rules:
- Cite the specific records you used, by [type] and title, e.g. "(BOM A, Project Acme)".
- Money is in Philippine Pesos (₱).
- If the answer is not supported by the graph context, say "I don't have that in the graph yet" — do not guess.
- Be concise and specific.

GRAPH SHAPE (counts by record type): ${shape || 'empty'}

GRAPH CONTEXT (most recent records):
${records || '(no records visible)'}`

  // Audit every AI query (PRD §11 / F4). Best-effort — never block the user.
  try {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'cortex_chat',
      entityId: profile.user.id,
      action: 'query',
      diff: {
        message_count: messages.length,
        graph_records_in_context: recent.length,
        last_user_message: lastUser.slice(0, 1000),
      },
    })
  } catch (err) {
    console.error('[cortex/chat] audit log failed:', err)
  }

  // Deterministic, always-available grounded answer (keyword match over the
  // graph). The agent's fallback when no LLM is configured or it fails — and
  // its cited records are persisted with the assistant turn either way.
  const grounded = await cortexKeywordAnswer(profile.tenantId, lastUserMessage)

  type ChatChunk = { choices: { delta?: { content?: string | null } }[] }
  let llmStream: AsyncIterable<ChatChunk> | null = null
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = getOpenAI()
      llmStream = (await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
        max_tokens: 800,
      })) as AsyncIterable<ChatChunk>
    } catch (err) {
      console.error('[cortex/chat] LLM unavailable, using grounded fallback:', err)
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
        }
      }
      // No LLM (or it failed) → stream the deterministic grounded answer.
      if (!assistant) {
        assistant = grounded.answer
        controller.enqueue(encoder.encode(assistant))
      }
      controller.close()
      // Store the assistant turn + the records it cited into the agent's memory.
      if (assistant && convId) {
        try {
          await appendCortexMessage(
            profile.tenantId,
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

  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' }
  if (convId) headers['X-Conversation-Id'] = convId
  return new Response(readable, { headers })
}
