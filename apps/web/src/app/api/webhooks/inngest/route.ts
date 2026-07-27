import { serve } from 'inngest/next'
import {
  inngest,
  parseCadDrawing,
  calcDraftBomFromScope,
  embedBomLineItems,
} from '@/lib/inngest'
import {
  generateDailyCadenceTasks,
  generateOnDemand,
} from '@/lib/inngest-cadence'
import {
  dispatchCnpsSurveys,
  onCnpsSurveyScheduled,
} from '@/lib/inngest-warranty'
import { slaChecker } from '@/lib/inngest-sla'
import { permitStalenessChecker } from '@/lib/inngest-permits'
import { onBomInternalApproved } from '@/lib/inngest-rfq'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // CAD parse pipeline
    parseCadDrawing,
    calcDraftBomFromScope,
    embedBomLineItems,
    // Third Code ERP M5 — daily cadence task generator
    generateDailyCadenceTasks,
    generateOnDemand,
    // Third Code ERP M7 — CNPS survey dispatch
    dispatchCnpsSurveys,
    onCnpsSurveyScheduled,
    // Third Code ERP cross-cutting — SLA breach detector + permit staleness
    // (replaces the Deno edge functions; both paths kept for ops flexibility)
    slaChecker,
    permitStalenessChecker,
    // Third Code ERP M3 — auto-create RFQ on BOM internal approval
    onBomInternalApproved,
  ],
})
