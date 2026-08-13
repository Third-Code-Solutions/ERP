import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { documents } from '@third-code-erp/database/schema'
import { inngest } from '@/lib/inngest'
import { parseAndStoreCad, parseCadEvidence } from '@/lib/cad/parse-and-store'
import {
  cadEvidenceCommitWritesUseCoreApi,
  commitCadEvidenceThroughCoreApi,
  completeDocumentUploadThroughCoreCanary,
  documentIntakeCanarySelectedForUpload,
  documentProcessingJobsUseCoreApi,
  enqueueDocumentProcessingThroughCoreApi,
} from '@/lib/erp-core-client'
import { getProject } from '@/lib/project-queries'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { documentUploadCompleteResultSchema } from '@third-code-erp/shared-types'
import {
  extractScopeFromVisual,
  type VisualExtractResult,
} from '@/lib/vision/extract-from-visual'

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
// ExtractorKind decides which scope extractor runs for a given upload. It is
// independent of the persisted document_type enum so we can route new formats
// (xlsx, csv, docx) without touching the live Postgres enum / running a
// migration. document_type for these is just 'other'.
type ExtractorKind = 'pdf' | 'image' | 'spreadsheet' | 'csv' | 'docx'

function createUploadIdempotencyKey(input: {
  storagePath: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  description?: string
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        action: 'upload-complete',
        storagePath: input.storagePath,
        projectId: input.projectId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        description: input.description ?? null,
      })
    )
    .digest('hex')
}

function classify(
  fileName: string,
  mimeType: string
): {
  docType: DocumentType
  cadFormat: CadFormat | null
  extractorKind: ExtractorKind | null
} {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'dxf') return { docType: 'dxf', cadFormat: 'dxf', extractorKind: null }
  if (ext === 'dwg') return { docType: 'dxf', cadFormat: 'dwg', extractorKind: null }
  if (ext === 'pdf' || mimeType === 'application/pdf')
    return { docType: 'pdf', cadFormat: null, extractorKind: 'pdf' }
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext))
    return { docType: 'image', cadFormat: null, extractorKind: 'image' }
  if (ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet'))
    return { docType: 'other', cadFormat: null, extractorKind: 'spreadsheet' }
  if (ext === 'csv' || mimeType === 'text/csv')
    return { docType: 'other', cadFormat: null, extractorKind: 'csv' }
  if (
    ext === 'docx' ||
    ext === 'doc' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return { docType: 'other', cadFormat: null, extractorKind: 'docx' }

  return { docType: 'other', cadFormat: null, extractorKind: null }
}

export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!profile.tenantId) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
  }
  if (!can(profile.role, 'document.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  const project = await getProject(profile.tenantId, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const expectedPrefix = `${profile.tenantId}/${projectId}/`
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Storage path not in tenant scope' }, { status: 403 })
  }

  if (sizeBytes > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 413 })
  }

  // Select Core before any legacy document insert. The exact tenant gate is
  // closed by default; extractor formats keep their existing response and
  // CAD/AI processing path until separate parity evidence exists.
  if (
    documentIntakeCanarySelectedForUpload(profile.tenantId, {
      fileName,
      mimeType,
    })
  ) {
    const coreResult = await completeDocumentUploadThroughCoreCanary(
      {
        storagePath,
        projectId,
        fileName,
        mimeType,
        sizeBytes,
        description: description ?? null,
      },
      profile.tenantId,
      `upload-${createUploadIdempotencyKey({
        storagePath,
        projectId,
        fileName,
        mimeType,
        sizeBytes,
        description,
      })}`
    )
    if (!coreResult.ok || !coreResult.data) {
      return NextResponse.json(
        { error: coreResult.error ?? 'Document was not recorded.' },
        { status: coreResult.status ?? 503 }
      )
    }
    // Preserve legacy upload HTTP success semantics while Core owns commit.
    return NextResponse.json(coreResult.data)
  }

  const { docType, cadFormat, extractorKind } = classify(fileName, mimeType)

  let docId: string
  try {
    docId = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          tenant_id: profile.tenantId,
          project_id: projectId,
          uploaded_by: profile.user.id,
          document_type: docType,
          file_name: fileName,
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          description: description ?? null,
        })
        .returning({ id: documents.id })

      if (!doc) {
        throw new Error('Document insert returned no row')
      }

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'document',
        entityId: doc.id,
        action: 'create',
        diff: {
          project_id: projectId,
          document_type: docType,
          size_bytes: sizeBytes,
        },
      })

      return doc.id
    })
  } catch (err) {
    console.error('[upload/complete] documents insert failed:', err)
    return NextResponse.json(
      { error: 'Failed to record document' },
      { status: 500 }
    )
  }

  // Unified extraction pipeline.
  //
  //   - DXF/DWG  → parseAndStoreCad (magic-byte routed, optional Python worker)
  //   - PDF      → OpenAI Responses API with input_file
  //   - image/*  → OpenAI Responses API with input_image
  //
  // All three branches produce the same `cadResult` payload shape so the upload
  // hook (use-cad-upload.ts) renders the same success copy: "N scope items
  // extracted · draft BOM ₱X TCV (M% GP)".
  let cadParseQueued = false
  let cadParseWarning: string | undefined
  let cadResult:
    | {
        status: string
        scopeItemsCreated: number
        warnings: string[]
        layerCount: number
        entityCount: number
        detectedFormat:
          | 'dxf'
          | 'dwg'
          | 'pdf'
          | 'image'
          | 'spreadsheet'
          | 'csv'
          | 'docx'
          | 'unknown'
        dwgVersion: string | null
        extensionMismatch: boolean
        message: string
        bomId: string | null
        bomTcvCents: number
        bomCostCents: number
        bomGpMarginBps: number
        ragMatches: number
        aiEstimateMatches: number
        processingJobId?: string | null
      }
    | undefined

  if (cadFormat) {
    try {
      // CAD evidence canary: parse produces immutable evidence only, then the
      // Nest adapter commits official scope rows. Selected-Core failures are
      // terminal; this branch never calls the compatibility writer.
      if (
        cadEvidenceCommitWritesUseCoreApi(profile.tenantId) &&
        !(cadFormat === 'dwg' &&
          documentProcessingJobsUseCoreApi(profile.tenantId))
      ) {
        const evidence = await parseCadEvidence({
          tenantId: profile.tenantId,
          projectId,
          documentId: docId,
          storagePath,
          fileName,
          actorId: profile.user.id,
        })
        const workerResponse = evidence.workerResponse
        if (workerResponse) {
          const coreResult = await commitCadEvidenceThroughCoreApi(
            docId,
            { projectId, workerResponse },
            `cad-evidence-${docId}`,
            profile.tenantId
          )
          if (!coreResult.ok || !coreResult.data) {
            const error = coreResult.error ?? 'CAD evidence was not committed.'
            cadParseWarning = error
            cadResult = {
              status: 'processing-unavailable',
              scopeItemsCreated: 0,
              warnings: [error],
              layerCount: evidence.layerCount,
              entityCount: evidence.entityCount,
              detectedFormat: evidence.detectedFormat,
              dwgVersion: evidence.dwgVersion,
              extensionMismatch: evidence.extensionMismatch,
              message:
                'CAD parsed. No scope items were committed because ERP Core rejected the evidence.',
              bomId: null,
              bomTcvCents: 0,
              bomCostCents: 0,
              bomGpMarginBps: 0,
              ragMatches: 0,
              aiEstimateMatches: 0,
            }
          } else {
            cadParseQueued = true
            cadResult = {
              status: 'extracted',
              scopeItemsCreated: coreResult.data.scopeItemsCreated,
              warnings: evidence.warnings,
              layerCount: evidence.layerCount,
              entityCount: evidence.entityCount,
              detectedFormat: evidence.detectedFormat,
              dwgVersion: evidence.dwgVersion,
              extensionMismatch: evidence.extensionMismatch,
              message: `CAD evidence committed by ERP Core - ${coreResult.data.scopeItemsCreated} scope item${coreResult.data.scopeItemsCreated === 1 ? '' : 's'} ready for review.`,
              bomId: null,
              bomTcvCents: 0,
              bomCostCents: 0,
              bomGpMarginBps: 0,
              ragMatches: 0,
              aiEstimateMatches: 0,
            }
          }
        } else {
          cadParseWarning = evidence.warnings[0]
          cadResult = {
            status: evidence.status,
            scopeItemsCreated: 0,
            warnings: evidence.warnings,
            layerCount: evidence.layerCount,
            entityCount: evidence.entityCount,
            detectedFormat: evidence.detectedFormat,
            dwgVersion: evidence.dwgVersion,
            extensionMismatch: evidence.extensionMismatch,
            message: evidence.message,
            bomId: null,
            bomTcvCents: 0,
            bomCostCents: 0,
            bomGpMarginBps: 0,
            ragMatches: 0,
            aiEstimateMatches: 0,
          }
        }
      } else {
      // Binary DWG canary: once explicitly selected, Nest owns the worker
      // bridge and the official scope-item commit. Never fall back to the
      // legacy Next-side writer after this gate is selected.
      if (
        cadFormat === 'dwg' &&
        documentProcessingJobsUseCoreApi(profile.tenantId)
      ) {
        const coreResult = await enqueueDocumentProcessingThroughCoreApi(
          docId,
          {
            mode: 'cad',
            requestedFormat: 'dwg',
            // Draft BOM enablement remains an independent Nest canary.
            createDraftBom: false,
          },
          `cad-processing-${docId}`
        )

        const data = coreResult.data
        if (!coreResult.ok || !data) {
          const error = coreResult.error ?? 'Document processing was not queued.'
          cadParseWarning = error
          cadResult = {
            status: 'processing-unavailable',
            scopeItemsCreated: 0,
            warnings: [error],
            layerCount: 0,
            entityCount: 0,
            detectedFormat: 'dwg',
            dwgVersion: null,
            extensionMismatch: false,
            message:
              'DWG uploaded. No scope items were committed because ERP Core processing was unavailable.',
            bomId: null,
            bomTcvCents: 0,
            bomCostCents: 0,
            bomGpMarginBps: 0,
            ragMatches: 0,
            aiEstimateMatches: 0,
            processingJobId: null,
          }
        } else {
          cadParseQueued =
            data.status === 'queued' || data.status === 'processing'
          const statusData =
            'scopeItemsCreated' in data ? data : null
          cadResult = {
            status: data.status,
            scopeItemsCreated: statusData?.scopeItemsCreated ?? 0,
            warnings: statusData?.warnings ?? [],
            layerCount: 0,
            entityCount: 0,
            detectedFormat: 'dwg',
            dwgVersion: null,
            extensionMismatch: false,
            message:
              statusData?.status === 'succeeded'
                ? `DWG processed by ERP Core · ${statusData.scopeItemsCreated} scope item${statusData.scopeItemsCreated === 1 ? '' : 's'} committed.`
                : 'DWG processing queued in ERP Core. Scope items will appear when the job completes.',
            bomId: statusData?.draftBomId ?? null,
            bomTcvCents: 0,
            bomCostCents: 0,
            bomGpMarginBps: 0,
            ragMatches: 0,
            aiEstimateMatches: 0,
            processingJobId: data.jobId,
          }
        }
      } else {
      const result = await parseAndStoreCad({
        tenantId: profile.tenantId,
        projectId,
        documentId: docId,
        storagePath,
        fileName,
        actorId: profile.user.id,
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
        aiEstimateMatches: result.bom?.aiEstimateMatches ?? 0,
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
              tenantId: profile.tenantId,
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
      }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[upload/complete] inline CAD parse failed:', err)
      cadParseWarning = `CAD parse failed: ${message}`
    }
  } else if (extractorKind) {
    try {
      const visual: VisualExtractResult = await extractScopeFromVisual({
        tenantId: profile.tenantId,
        projectId,
        documentId: docId,
        storagePath,
        fileName,
        mimeType,
        kind: extractorKind,
      })

      cadParseQueued = visual.status === 'extracted'
      cadResult = {
        status: visual.status,
        scopeItemsCreated: visual.scopeItemsCreated,
        warnings: visual.warnings,
        layerCount: 0,
        entityCount: 0,
        detectedFormat: visual.detectedKind,
        dwgVersion: null,
        extensionMismatch: false,
        message: visual.message,
        bomId: visual.bom?.bomId ?? null,
        bomTcvCents: visual.bom?.totalTcvCents ?? 0,
        bomCostCents: visual.bom?.totalCostCents ?? 0,
        bomGpMarginBps: visual.bom?.gpMarginBps ?? 0,
        ragMatches: visual.bom?.ragMatches ?? 0,
        aiEstimateMatches: visual.bom?.aiEstimateMatches ?? 0,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[upload/complete] visual extraction failed:', err)
      cadParseWarning = `Vision extraction failed: ${message}`
    }
  }

  const response = documentUploadCompleteResultSchema.parse({
    id: docId,
    storagePath,
    documentType: docType,
    cadFormat,
    cadParseQueued,
    ...(cadParseWarning ? { cadParseWarning } : {}),
    ...(cadResult ? { cadResult } : {}),
  })

  return NextResponse.json(response)
}
