import { NextRequest } from 'next/server'
import { getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, bomLineItems, invoices, projects, purchaseOrders, users } from '@third-code-erp/database/schema'
import { and, eq, desc } from 'drizzle-orm'
import { getOpenAI } from '@third-code-erp/ai'
import { writeAuditLog } from '@/lib/audit'
import {
  consumeProviderQuota,
  providerQuotaBlockedResponse,
} from '@/lib/provider-quota'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return new Response('Forbidden', { status: 403 })

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }

  const quota = await consumeProviderQuota(
    'provider-chat',
    userRow.tenant_id
  )
  if (!quota.ok) {
    return providerQuotaBlockedResponse(quota)
  }

  const { messages, projectId } = (await req.json()) as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    projectId?: string
  }

  // Build context from the project's data
  let context = ''

  if (projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenant_id, userRow.tenant_id)))

    if (project) {
      context += `PROJECT: ${project.name}\nClient: ${project.client}\nStatus: ${project.status}\nLocation: ${project.location ?? 'N/A'}\nType: ${project.project_type ?? 'N/A'}\n\n`

      // Latest BOM
      const [latestBom] = await db
        .select()
        .from(boms)
        .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, userRow.tenant_id)))
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
          .where(and(eq(bomLineItems.bom_id, latestBom.id), eq(bomLineItems.tenant_id, userRow.tenant_id)))

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
        .where(and(eq(invoices.project_id, projectId), eq(invoices.tenant_id, userRow.tenant_id)))

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
        .where(and(eq(purchaseOrders.project_id, projectId), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

      if (poRows.length > 0) {
        context += `Purchase Orders (${poRows.length}):\n`
        for (const po of poRows) {
          context += `  - ${po.po_number} (${po.status}): ₱${(po.total_cents / 100).toFixed(2)}\n`
        }
      }
    }
  }

  const systemPrompt = `You are a helpful assistant for Third Code ERP, a construction ERP system for Philippine MEP contractors.
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
      tenantId: userRow.tenant_id,
      actorId: user.id,
      entityType: 'ai_chat',
      entityId: projectId ?? user.id,
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
