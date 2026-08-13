import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { opportunities } from '@third-code-erp/database/schema'
import { opportunityKycTrackCommandSchema } from '@third-code-erp/shared-types'
import {
  applyOpportunityKycTrackAction,
  getOpportunityKycTracks,
  opportunityKycGateMessage,
  opportunityKycTrackLabel,
} from '@/lib/operations/opportunity-kyc'
import { notifyRoles } from '@/lib/operations/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const [opportunity] = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)
  if (!opportunity) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  const tracks = await getOpportunityKycTracks(profile.tenantId, id)
  return NextResponse.json({
    opportunityId: id,
    tracks,
    gate: opportunityKycGateMessage(tracks),
  })
}

export async function POST(request: Request, context: RouteContext) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const parsed = opportunityKycTrackCommandSchema.safeParse({
    ...(typeof body === 'object' && body !== null ? body : {}),
    opportunity_id: id,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return NextResponse.json(
      { error: `${first?.path.join('.') || 'command'}: ${first?.message || 'invalid input'}` },
      { status: 400 }
    )
  }

  const result = await applyOpportunityKycTrackAction({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    actorRole: profile.role,
    input: parsed.data,
  })
  if (!result.ok) {
    const status = result.error.startsWith('Forbidden:')
      ? 403
      : result.error === 'Opportunity not found'
        ? 404
        : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: parsed.data.action === 'approve' ? ['sales', 'finance'] : ['owner', 'admin'],
    subject: `${opportunityKycTrackLabel(parsed.data.track_type)} ${result.status.replace('_', ' ')}`,
    body: `Opportunity ${id} review track is now ${result.status.replace('_', ' ')}.`,
    linkUrl: `/crm/opportunities/${id}/proposal/pprf`,
  })

  return NextResponse.json({
    opportunityId: id,
    trackId: result.trackId,
    status: result.status,
  })
}
