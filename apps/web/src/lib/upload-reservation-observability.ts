import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const TraceIdSchema = z.string().uuid()

export function resolveUploadReservationTraceId(headers: Headers): string {
  const requestedTraceId = TraceIdSchema.safeParse(headers.get('x-request-id'))
  return requestedTraceId.success ? requestedTraceId.data : randomUUID()
}

type UploadReservationOutcome = Readonly<{
  traceId: string
  tenantId: string
  actorId: string
  action: 'reserve' | 'complete' | 'release'
  outcome: 'succeeded' | 'gate_mismatch' | 'core_failed' | 'invalid_core_result'
  status: number
}>

export function logUploadReservationOutcome(
  outcome: UploadReservationOutcome
): void {
  console.info(
    '[document-upload-reservation]',
    JSON.stringify({
      trace_id: outcome.traceId,
      tenant_id: outcome.tenantId,
      actor_id: outcome.actorId,
      action: outcome.action,
      outcome: outcome.outcome,
      status: outcome.status,
    })
  )
}
