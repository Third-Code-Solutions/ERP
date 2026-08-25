import { NextRequest, NextResponse } from 'next/server'
import { can, getUserProfile } from '@third-code-erp/auth'
import { z } from 'zod'
import { documentUploadReservationMutationBodySchema } from '@third-code-erp/shared-types'

import {
  documentUploadReservationWritesUseCoreApi,
  releaseDocumentUploadReservationThroughCoreApi,
} from '@/lib/erp-core-client'
import { isExactDocumentUploadReservationPath } from '@/lib/document-upload-reservation-path'
import {
  logUploadReservationOutcome,
  resolveUploadReservationTraceId,
} from '@/lib/upload-reservation-observability'

const ReservationIdSchema = z.string().uuid()

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> }
) {
  const traceId = resolveUploadReservationTraceId(request.headers)
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.tenantId) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
  }
  if (!can(profile.role, 'document.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!documentUploadReservationWritesUseCoreApi(profile.tenantId)) {
    logUploadReservationOutcome({
      traceId,
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      action: 'release',
      outcome: 'gate_mismatch',
      status: 503,
    })
    return NextResponse.json(
      { error: 'Upload reservation lifecycle is not enabled.' },
      { status: 503 }
    )
  }

  const params = await context.params
  const reservationId = ReservationIdSchema.safeParse(params.reservationId)
  if (!reservationId.success) {
    return NextResponse.json({ error: 'Invalid reservation ID' }, { status: 400 })
  }

  let body: unknown = {}
  try {
    const rawBody = await request.text()
    body = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!documentUploadReservationMutationBodySchema.safeParse(body).success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const coreResult = await releaseDocumentUploadReservationThroughCoreApi(
    reservationId.data,
    traceId
  )
  if (!coreResult.ok || !coreResult.data) {
    logUploadReservationOutcome({
      traceId,
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      action: 'release',
      outcome: 'core_failed',
      status: coreResult.status ?? 503,
    })
    return NextResponse.json(
      { error: coreResult.error ?? 'Upload reservation was not released.' },
      { status: coreResult.status ?? 503 }
    )
  }
  if (
    coreResult.data.reservationId !== reservationId.data ||
    !isExactDocumentUploadReservationPath({
      tenantId: profile.tenantId,
      projectId: coreResult.data.projectId,
      reservationId: reservationId.data,
      storagePath: coreResult.data.storagePath,
    })
  ) {
    logUploadReservationOutcome({
      traceId,
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      action: 'release',
      outcome: 'invalid_core_result',
      status: 503,
    })
    return NextResponse.json(
      { error: 'ERP Core returned an invalid upload release result.' },
      { status: 503 }
    )
  }
  logUploadReservationOutcome({
    traceId,
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    action: 'release',
    outcome: 'succeeded',
    status: 200,
  })
  return NextResponse.json(coreResult.data)
}
