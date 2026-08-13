import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { listCortexConversations } from '@third-code-erp/database'
import { authorizeCortexRecordContext } from '@/lib/cortex/record-context'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  cortexConversationReadsUseCoreApi,
  listCortexConversationsThroughCoreApi,
} from '@/lib/erp-core-client'

/**
 * GET /api/cortex/conversations — the signed-in user's Cortex conversation
 * history (tenant + user scoped). The agent's persistent memory index.
 */
export async function GET(_req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  if (cortexConversationReadsUseCoreApi(profile.tenantId)) {
    const result = await listCortexConversationsThroughCoreApi()
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Cortex conversation service is unavailable.' },
        { status: result.status ?? 503, headers: CORTEX_PRIVATE_HEADERS }
      )
    }
    return NextResponse.json(result.data, { headers: CORTEX_PRIVATE_HEADERS })
  }

  const stored = await listCortexConversations(
    profile.tenantId,
    profile.user.id,
    30
  )
  const conversations = (
    await Promise.all(
      stored.map(async (conversation) => {
        const {
          context_ref_table,
          context_ref_id,
          ...summary
        } = conversation
        if (!context_ref_table && !context_ref_id) {
          return { ...summary, context: null }
        }
        if (!context_ref_table || !context_ref_id) return null

        const context = await authorizeCortexRecordContext(
          profile.tenantId,
          profile.role,
          {
            refTable: context_ref_table,
            refId: context_ref_id,
          }
        )
        return context ? { ...summary, context } : null
      })
    )
  ).filter((conversation) => conversation !== null)

  return NextResponse.json(
    { conversations },
    { headers: CORTEX_PRIVATE_HEADERS }
  )
}
