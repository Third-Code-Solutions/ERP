import { NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { getOpportunityThroughCoreApi } from '@/lib/erp-core-client'
import { inspectionPhotoTransportSchema, inspectionPhotoUploadUrl } from '@/lib/inspection-photo-upload-contract'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(profile.role, 'site_inspection.submit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = z.string().uuid().safeParse((await context.params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid opportunity' }, { status: 400 })
  const actor = request.headers.get('x-expected-actor-id')?.toLowerCase()
  const tenant = request.headers.get('x-expected-tenant-id')?.toLowerCase()
  if (actor !== profile.user.id.toLowerCase() || tenant !== profile.tenantId.toLowerCase()) {
    return NextResponse.json({ error: 'Inspection session changed. Return to the original account.' }, { status: 403 })
  }
  try {
    const opportunityId = id.data.toLowerCase()
    const opportunity = await getOpportunityThroughCoreApi(opportunityId)
    const checked = z.object({ id: z.string().uuid(), tenantId: z.string().uuid() }).safeParse(opportunity.data)
    if (!opportunity.ok || !checked.success || checked.data.id.toLowerCase() !== opportunityId ||
      checked.data.tenantId.toLowerCase() !== tenant) {
      return NextResponse.json({ error: 'Opportunity could not be verified.' }, { status: 503 })
    }
    const uploadUrl = inspectionPhotoUploadUrl(process.env.ERP_CORE_API_URL ?? '', opportunityId)
    if (process.env.NODE_ENV === 'production' && !uploadUrl.startsWith('https://')) {
      throw new Error('Secure Core transport required')
    }
    return NextResponse.json(inspectionPhotoTransportSchema.parse({
      actorId: actor, tenantId: tenant, opportunityId, uploadUrl,
    }), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Inspection photo transport is unavailable.' }, { status: 503 })
  }
}
