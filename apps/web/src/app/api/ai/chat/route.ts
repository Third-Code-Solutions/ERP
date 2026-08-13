import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, bomLineItems, invoices, projects, purchaseOrders } from '@third-code-erp/database/schema'
import { and, eq, desc } from 'drizzle-orm'
import { getOpenAI } from '@third-code-erp/ai'
import { writeAuditLog } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 30

const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(50),
  projectId: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return new Response('Unauthorized', { status: 401 })

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const { messages, projectId } = parsed.data

  // Build context from the project's data
  let context = ''

  if (projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))

    if (project) {
      context += `PROJECT: ${project.name}\nClient: ${project.client}\nStatus: ${project.status}\nLocation: ${project.location ?? 'N/A'}\nType: ${project.project_type ?? 'N/A'}\n\n`

      // Latest BOM
      const [latestBom] = await db
        .select()
        .from(boms)
        .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, profile.tenantId)))
        .orderBy(desc(boms.version))
        .limit(1)

      if (latestBom) {
        context += `BOM v${latestBom.version} (${latestBom.status}):\n`
        context += `  Total Cost: ₱${(latestBom.total_cost_cents / 100).toFixed(2)}\n`
        context += `  TCV: ₱${(latestBom.tcv_cents / 100).toFixed(2)}\n`
        context += `  GP: ₱${(latestBom.gp_cents / 100).toFixed(2)} (${(latestBom.gp_margin_bps / 100).toFixed(1)}%)\n\n`

        const lines = await db
          .select()
          .from(bomLineItems)
          .where(and(eq(bomLineItems.bom_id, latestBom.id), eq(bomLineItems.tenant_id, profile.tenantId)))

        if (lines.length > 0) {
          context += 'BOM Line Items:\n'
          for (const l of lines.slice(0, 20)) {
            context += `  - ${l.description}: qty ${l.quantity} ${l.unit ?? ''} @ ₱${(l.unit_cost_cents / 100).toFixed(2)} = ₱${(l.line_total_cents / 100).toFixed(2)}\n`
          }
          if (lines.length > 20) context += `  ... and ${lines.length - 20} more items\n`
          context += '\n'
        }
      }

      // Invoice summary
      const invRows = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.project_id, projectId), eq(invoices.tenant_id, profile.tenantId)))

      if (invRows.length > 0) {
        context += `Invoices (${invRows.length}):\n`
        for (const inv of invRows) {
          context += `  - ${inv.invoice_number} (${inv.status}): ${(inv.billing_percent_bps / 100).toFixed(0)}% billing, net ₱${(inv.net_amount_cents / 100).toFixed(2)}\n`
        }
        context += '\n'
      }

      // PO summary
      const poRows = await db
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.project_id, projectId), eq(purchaseOrders.tenant_id, profile.tenantId)))

      if (poRows.length > 0) {
        context += `Purchase Orders (${poRows.length}):\n`
        for (const po of poRows) {
          context += `  - ${po.po_number} (${po.status}): ₱${(po.total_cents / 100).toFixed(2)}\n`
        }
      }
    }
  }

  const systemPrompt = `You are a helpful assistant for ABI OPS, a construction operations system for Philippine MEP contractors.
You have access to project data and help users understand costs, margins, billing, and procurement.
All monetary values are in Philippine Pesos (₱).
Be concise and specific. When referencing numbers, always include the currency symbol.

${context ? `CURRENT PROJECT CONTEXT:\n${context}` : 'No specific project context provided.'}`

  // PRD F4 requires audit logging on every AI query. Capture the latest user
  // turn (truncated) and the project context so compliance can reconstruct
  // what the model was asked. Best-effort — never fail the user request.
  try {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'ai_chat',
      entityId: projectId ?? profile.user.id,
      action: 'query',
      diff: {
        project_id: projectId ?? null,
        message_count: messages.length,
        last_user_message: lastUser.slice(0, 1000),
      },
    })
  } catch (err) {
    console.error('[ai/chat] audit log failed:', err)
  }

  const openai = getOpenAI()

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    max_tokens: 800,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) {
          controller.enqueue(encoder.encode(text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
