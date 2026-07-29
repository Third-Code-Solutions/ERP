import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import {
  getCortexCitationsByNodeIds,
  getCortexConversationMessages,
} from '@third-code-erp/database'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'

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
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = z.string().uuid().safeParse((await params).id)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const messages = await getCortexConversationMessages(profile.tenantId, profile.user.id, parsed.data)
  if (!messages) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  return NextResponse.json({ messages: safeMessages })
}
