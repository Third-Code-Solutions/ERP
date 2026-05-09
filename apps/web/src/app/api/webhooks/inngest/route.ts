import { serve } from 'inngest/next'
import { inngest, parseDxf } from '@/lib/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseDxf],
})
