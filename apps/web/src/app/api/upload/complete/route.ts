import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { documents, users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'
import { inngest } from '@/lib/inngest'
import { parseAndStoreCad } from '@/lib/cad/parse-and-store'

const CompleteSchema = z.object({
  storagePath: z.string().min(1),
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  // documents.mime_type column is varchar(127); cap at the column limit
  mimeType: z.string().max(127).default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative(),
  description: z.string().max(2000).optional(),
})

const MAX_SIZE_BYTES = 100 * 1024 * 1024

type DocumentType = 'dxf' | 'pdf' | 'image' | 'contract' | 'bom' | 'invoice' | 'po' | 'other'
type CadFormat = 'dxf' | 'dwg'

function classify(
  fileName: string,
  mimeType: string
): { docType: DocumentType; cadFormat: CadFormat | null } {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'dxf') return { docType: 'dxf', cadFormat: 'dxf' }
  if (ext === 'dwg') return { docType: 'dxf', cadFormat: 'dwg' }
  if (ext === 'pdf' || mimeType === 'application/pdf') return { docType: 'pdf', cadFormat: null }
  if (mimeType.startsWith('image/')) return { docType: 'image', cadFormat: null }
  return { docType: 'other', cadFormat: null }
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CompleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { storagePath, projectId, fileName, mimeType, sizeBytes, description } = parsed.data

  const expectedPrefix = `${userRow.tenant_id}/${projectId}/`
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Storage path not in tenant scope' }, { status: 403 })
  }

  if (sizeBytes > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 413 })
  }

  const { docType, cadFormat } = classify(fileName, mimeType)

  let docId: string
  try {
    const [doc] = await db
      .insert(documents)
      .values({
        tenant_id: userRow.tenant_id,
        project_id: projectId,
        uploaded_by: user.id,
        document_type: docType,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        description: description ?? null,
      })
      .returning({ id: documents.id })

    if (!doc) {
      return NextResponse.json({ error: 'Failed to record document' }, { status: 500 })
    }
    docId = doc.id
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown DB error'
    console.error('[upload/complete] documents insert failed:', err)
    return NextResponse.json(
      { error: `Failed to record document: ${message}` },
      { status: 500 }
    )
  }

  // Unified CAD parsing pipeline. Both .dxf and .dwg flow through the inline
  // parser first — magic-byte detection determines the actual format on disk
  // (filename extensions can lie). For real binary DWG files the inline path
  // returns a "binary-dwg-pending" status and we additionally queue the
  // background Python-worker pipeline if Inngest is wired up.
  let cadParseQueued = false
  let cadParseWarning: string | undefined
  let cadResult:
    | {
        status: string
        scopeItemsCreated: number
        warnings: string[]
        layerCount: number
        entityCount: number
        detectedFormat: 'dxf' | 'dwg' | 'unknown'
        dwgVersion: string | null
        extensionMismatch: boolean
        message: string
        bomId: string | null
        bomTcvCents: number
        bomCostCents: number
        bomGpMarginBps: number
        ragMatches: number
      }
    | undefined

  if (cadFormat) {
    try {
      const result = await parseAndStoreCad({
        tenantId: userRow.tenant_id,
        projectId,
        documentId: docId,
        storagePath,
        fileName,
      })
      cadParseQueued = result.status === 'extracted'
      cadResult = {
        status: result.status,
        scopeItemsCreated: result.scopeItemsCreated,
        warnings: result.warnings,
        layerCount: result.layerCount,
        entityCount: result.entityCount,
        detectedFormat: result.detectedFormat,
        dwgVersion: result.dwgVersion,
        extensionMismatch: result.extensionMismatch,
        message: result.message,
        bomId: result.bom?.bomId ?? null,
        bomTcvCents: result.bom?.totalTcvCents ?? 0,
        bomCostCents: result.bom?.totalCostCents ?? 0,
        bomGpMarginBps: result.bom?.gpMarginBps ?? 0,
        ragMatches: result.bom?.ragMatches ?? 0,
      }

      // Real binary DWG with no inline worker reachable: best-effort fan-out
      // to Inngest so a deployed worker picks it up later. We do NOT surface
      // this as an error to the user — parse-and-store has already returned a
      // clear, actionable cadResult.message.
      if (result.status === 'binary-dwg-pending' && process.env.INNGEST_EVENT_KEY) {
        try {
          await inngest.send({
            name: 'document/cad.uploaded',
            data: {
              documentId: docId,
              projectId,
              tenantId: userRow.tenant_id,
              storagePath,
              format: 'dwg',
              fileName,
            },
          })
          cadParseQueued = true
        } catch (err) {
          // Logged for ops; intentionally not propagated to UI.
          console.warn('[upload/complete] background DWG queue failed:', err)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[upload/complete] inline CAD parse failed:', err)
      cadParseWarning = `CAD parse failed: ${message}`
    }
  }

  return NextResponse.json({
    id: docId,
    storagePath,
    documentType: docType,
    cadFormat,
    cadParseQueued,
    ...(cadParseWarning ? { cadParseWarning } : {}),
    ...(cadResult ? { cadResult } : {}),
  })
}
