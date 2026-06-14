import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@buildops/auth'
import { listCortexConversations } from '@buildops/database'

/**
 * GET /api/cortex/conversations — the signed-in user's Cortex conversation
 * history (tenant + user scoped). The agent's persistent memory index.
 */
export async function GET(_req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversations = await listCortexConversations(profile.tenantId, profile.user.id, 30)
  return NextResponse.json({ conversations })
}
