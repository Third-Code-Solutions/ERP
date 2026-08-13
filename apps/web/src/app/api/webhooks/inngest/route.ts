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
import { processSlaChecker } from '@/lib/inngest-process-sla'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // CAD parse pipeline
    parseCadDrawing,
    calcDraftBomFromScope,
    embedBomLineItems,
    // ABI OPS M5 — daily cadence task generator
    generateDailyCadenceTasks,
    generateOnDemand,
    // ABI OPS M7 — CNPS survey dispatch
    dispatchCnpsSurveys,
    onCnpsSurveyScheduled,
    // ABI OPS cross-cutting — SLA breach detector + permit staleness
    // (replaces the Deno edge functions; both paths kept for ops flexibility)
    slaChecker,
    permitStalenessChecker,
    // ABI OPS M3 — auto-create RFQ on BOM internal approval
    onBomInternalApproved,
    processSlaChecker,
  ],
})
