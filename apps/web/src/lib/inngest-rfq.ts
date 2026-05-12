/**
 * RFQ auto-dispatch Inngest wiring (REFACTOR.md M3 US-013).
 *
 * When Commercial internally approves a BOM, we want Procurement to start
 * sourcing immediately. The BOM-approval server action emits a
 * `bom/internal_approved` event with `{bomId, tenantId}`; this function
 * picks it up and calls `createRfqFromBom` with `systemTenantId` so the
 * action doesn't require a logged-in actor (no user session in Inngest).
 *
 * Wiring: the main thread registers `onBomInternalApproved` in the existing
 * inngest webhook route alongside the other declared functions.
 */

import { inngest } from './inngest'
import { createRfqFromBom } from '@/app/(dashboard)/procurement/rfqs/actions'

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

interface BomInternalApprovedEventData {
  bomId: string
  tenantId: string
}

export const onBomInternalApproved = inngest.createFunction(
  {
    id: 'on-bom-internal-approved-create-rfq',
    name: 'Auto-create RFQ when BOM is internally approved',
    triggers: [{ event: 'bom/internal_approved' as const }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: BomInternalApprovedEventData }
    step: Step
  }) => {
    const { bomId, tenantId } = event.data

    if (!bomId || !tenantId) {
      return { skipped: true, reason: 'bomId or tenantId missing' }
    }

    const result = await step.run('create-rfq', async () => {
      return createRfqFromBom(bomId, { systemTenantId: tenantId })
    })

    if ('error' in result) {
      // Non-fatal: log the reason and exit. Common case: BOM had no
      // non-contracted lines, so no RFQ was needed.
      return { skipped: true, reason: result.error, bomId, tenantId }
    }

    return { created: true, rfqId: result.rfqId, bomId, tenantId }
  }
)
