import { serve } from 'inngest/next'
import {
  inngest,
  parseCadDrawing,
  calcDraftBomFromScope,
  embedBomLineItems,
} from '@/lib/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseCadDrawing, calcDraftBomFromScope, embedBomLineItems],
})
