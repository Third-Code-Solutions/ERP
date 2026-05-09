import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'buildops' })

// Triggered when a document is uploaded to Supabase Storage.
// The DXF parser worker picks this up and writes scope_items rows.
export const parseDxf = inngest.createFunction(
  {
    id: 'parse-dxf',
    name: 'Parse DXF Drawing',
    triggers: [{ event: 'document/dxf.uploaded' as const }],
  },
  async ({ event, step }: { event: { data: { documentId: string; projectId: string; tenantId: string; storagePath: string } }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { documentId, projectId, tenantId, storagePath } = event.data as {
      documentId: string
      projectId: string
      tenantId: string
      storagePath: string
    }

    // Step 1: Call the Railway DXF parser service
    const parserUrl = process.env.DXF_PARSER_URL
    if (!parserUrl) {
      return { skipped: true, reason: 'DXF_PARSER_URL not configured' }
    }

    const result = await step.run('call-dxf-parser', async () => {
      const res = await fetch(`${parserUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, projectId, tenantId, storagePath }),
      })
      if (!res.ok) throw new Error(`DXF parser returned ${res.status}`)
      return res.json()
    })

    return { parsed: true, scopeItemsCreated: (result as { count?: number }).count ?? 0 }
  }
)
