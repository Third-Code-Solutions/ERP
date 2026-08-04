import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import {
  getCortexCitationsByNodeIds,
  getCortexConversation,
  getCortexConversationMessages,
} from '@third-code-erp/database'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'
import { authorizeCortexRecordContext } from '@/lib/cortex/record-context'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'

const storedCitationSchema = z.object({
  nodeId: z.string().uuid(),
})

function storedCitationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const parsed = storedCitationSchema.safeParse(candidate)
    return parsed.success ? [parsed.data.nodeId] : []
  })
}

/**
 * GET /api/cortex/conversations/:id — messages for one of the user's threads.
 * Ownership is enforced in the store (tenant + user); a foreign id is a 404.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const parsed = z.string().uuid().safeParse((await params).id)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id' },
      { status: 400, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const conversation = await getCortexConversation(
    profile.tenantId,
    profile.user.id,
    parsed.data
  )
  if (!conversation) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  const { context_ref_table, context_ref_id } = conversation
  if (Boolean(context_ref_table) !== Boolean(context_ref_id)) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  const context =
    context_ref_table && context_ref_id
      ? await authorizeCortexRecordContext(
          profile.tenantId,
          profile.role,
          {
            refTable: context_ref_table,
            refId: context_ref_id,
          }
        )
      : null
  if (context_ref_table && !context) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const messages = await getCortexConversationMessages(profile.tenantId, profile.user.id, parsed.data)
  if (!messages) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const nodeIds = [
    ...new Set(messages.flatMap((message) => storedCitationIds(message.citations))),
  ].slice(0, 200)
  const visibleCitations = await getCortexCitationsByNodeIds(
    profile.tenantId,
    nodeIds,
    cortexNodeTypeScope(profile.role)
  )
  const visibleById = new Map(
    visibleCitations.map((citation) => [citation.nodeId, citation])
  )
  const safeMessages = messages.map(({ citations, ...message }) => ({
    ...message,
    citations: storedCitationIds(citations).flatMap((nodeId) => {
      const citation = visibleById.get(nodeId)
      return citation ? [citation] : []
    }),
  }))

  return NextResponse.json(
    { context, messages: safeMessages },
    { headers: CORTEX_PRIVATE_HEADERS }
  )
}
