import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { getCortexConversationMessages } from '@third-code-erp/database'

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

  return NextResponse.json({ messages })
}
