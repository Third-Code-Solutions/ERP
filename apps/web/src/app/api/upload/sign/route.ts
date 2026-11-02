import { NextRequest, NextResponse } from 'next/server'
import { can, getUserProfile } from '@third-code-erp/auth'
import { documentUploadReserveSchema, documentUploadReservationResultSchema } from '@third-code-erp/shared-types'
import { getCoreApiAccess } from '@/lib/erp-core-client'

// Compatibility route: reserve capacity, never expose provider write tokens.
export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.tenantId || !can(profile.role, 'document.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = documentUploadReserveSchema.safeParse(await req.json().catch(() => null))
  const key = req.headers.get('idempotency-key')?.trim()
  if (!parsed.success || !key || key.length > 256) return NextResponse.json({ error: 'Invalid upload reservation request' }, { status: 400 })
  const access = await getCoreApiAccess()
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: 503 })
  try {
    const response = await fetch(`${access.baseUrl}/v1/document-uploads`, {
      method: 'POST', headers: { authorization: `Bearer ${access.accessToken}`, 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(parsed.data), cache: 'no-store', signal: AbortSignal.timeout(30_000),
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) return NextResponse.json({ error: response.status === 413 ? 'Project storage quota exceeded' : 'Upload reservation was not authorized or could not be created' }, { status: response.status })
    const reservation = documentUploadReservationResultSchema.safeParse(body)
    if (!reservation.success) return NextResponse.json({ error: 'Invalid Core upload reservation response' }, { status: 502 })
    return NextResponse.json({ ...reservation.data, uploadUrl: `${access.baseUrl}/v1/document-uploads/${reservation.data.reservationId}/content`, originalFileName: parsed.data.fileName })
  } catch { return NextResponse.json({ error: 'Upload reservation service is unavailable' }, { status: 503 }) }
}
