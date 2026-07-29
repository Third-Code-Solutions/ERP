/**
 * RFQ auto-dispatch Inngest wiring (REFACTOR.md M3 US-013).
 *
 * The current producer emits `bom/approved`; the historical
 * `bom/internal_approved` name remains accepted during migration. Both paths
 * call the internal server-only transaction service, never the browser-facing
 * Server Action.
 *
 * Wiring: the main thread registers `onBomInternalApproved` in the existing
 * inngest webhook route alongside the other declared functions.
 */

import { inngest } from './inngest'
import {
  createRfqFromBomRecord,
  notifyRfqCreated,
  type RfqCreationSource,
} from '@/lib/procurement/rfq-service'

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

interface BomInternalApprovedEventData {
  bomId: string
  tenantId: string
  actorId?: string
}

interface BomApprovedEvent {
  name: 'bom/approved' | 'bom/internal_approved'
  data: BomInternalApprovedEventData
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sourceForEvent(name: BomApprovedEvent['name']): RfqCreationSource {
  return name === 'bom/approved'
    ? 'bom_approved_event'
    : 'bom_internal_approved_event'
}

export async function handleBomApprovedForRfq({
  event,
  step,
}: {
  event: BomApprovedEvent
  step: Step
}) {
  const { bomId, tenantId, actorId } = event.data

  if (
    !UUID_PATTERN.test(bomId ?? '') ||
    !UUID_PATTERN.test(tenantId ?? '') ||
    (actorId !== undefined && !UUID_PATTERN.test(actorId))
  ) {
    return {
      skipped: true,
      reason: 'bomId, tenantId, or actorId invalid',
    }
  }

  const result = await step.run('create-rfq', async () => {
    return createRfqFromBomRecord({
      bomId,
      tenantId,
      actorId: actorId ?? null,
      source: sourceForEvent(event.name),
    })
  })

  if ('error' in result) {
    return {
      skipped: true,
      reason: result.error,
      bomId,
      tenantId,
    }
  }

  if (result.created) {
    await step.run('notify-procurement', async () => {
      await notifyRfqCreated(result)
    })
  }

  return {
    created: result.created,
    rfqId: result.rfqId,
    bomId,
    tenantId,
  }
}

export const onBomInternalApproved = inngest.createFunction(
  {
    id: 'on-bom-internal-approved-create-rfq',
    name: 'Auto-create RFQ when BOM is internally approved',
    triggers: [
      { event: 'bom/approved' as const },
      { event: 'bom/internal_approved' as const },
    ],
  },
  handleBomApprovedForRfq
)
