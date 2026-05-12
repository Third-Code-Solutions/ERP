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

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // CAD parse pipeline
    parseCadDrawing,
    calcDraftBomFromScope,
    embedBomLineItems,
    // ABI Ops M5 — daily cadence task generator
    generateDailyCadenceTasks,
    generateOnDemand,
    // ABI Ops M7 — CNPS survey dispatch
    dispatchCnpsSurveys,
    onCnpsSurveyScheduled,
  ],
})
