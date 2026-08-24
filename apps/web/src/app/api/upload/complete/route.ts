import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { parseCadEvidence } from '@/lib/cad/parse-and-store'
import {
  commitCadEvidenceThroughCoreApi,
  completeDocumentUploadReservationThroughCoreApi,
  createDocumentThroughCoreApi,
  documentProcessingJobsUseCoreApi,
  documentUploadReservationIssuanceUsesCoreApi,
  documentUploadReservationWritesUseCoreApi,
  enqueueDocumentProcessingThroughCoreApi,
} from '@/lib/erp-core-client'
import { documentUploadCompleteResultSchema } from '@third-code-erp/shared-types'
import {
  extractDeterministicDocument,
} from '@/lib/document-intake/deterministic-extractor'
import { isExactDocumentUploadReservationPath } from '@/lib/document-upload-reservation-path'
import {
  logUploadReservationOutcome,
  resolveUploadReservationTraceId,
} from '@/lib/upload-reservation-observability'

export const runtime = 'nodejs'

const ReservationCompleteSchema = z
  .object({ reservationId: z.string().uuid() })
  .strict()

const LegacyCompleteSchema = z
  .object({
    storagePath: z.string().min(1),
    projectId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    // documents.mime_type column is varchar(127); cap at the column limit
    mimeType: z.string().max(127).default('application/octet-stream'),
    sizeBytes: z.number().int().nonnegative(),
    description: z.string().max(2000).optional(),
  })
  .strict()

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
  if (
    ['xlsx', 'xls', 'xlsm', 'xlsb'].includes(ext) ||
    mimeType.includes('spreadsheet') ||
    mimeType === 'application/vnd.ms-excel'
  )
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
  const traceId = resolveUploadReservationTraceId(req.headers)
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

  const reservationRequest = ReservationCompleteSchema.safeParse(body)
  const legacyRequest = LegacyCompleteSchema.safeParse(body)
  if (!reservationRequest.success && !legacyRequest.success) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }

  let storagePath: string
  let projectId: string
  let fileName: string
  let mimeType: string
  let intake: {
    documentId: string
    storagePath: string
    documentType: DocumentType
    created: boolean
  }

  if (reservationRequest.success) {
    if (!documentUploadReservationWritesUseCoreApi(profile.tenantId)) {
      logUploadReservationOutcome({
        traceId,
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        action: 'complete',
        outcome: 'gate_mismatch',
        status: 503,
      })
      return NextResponse.json(
        { error: 'Upload reservation lifecycle is not enabled.' },
        { status: 503 }
      )
    }
    const coreResult = await completeDocumentUploadReservationThroughCoreApi(
      reservationRequest.data.reservationId,
      traceId
    )
    if (!coreResult.ok || !coreResult.data) {
      logUploadReservationOutcome({
        traceId,
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        action: 'complete',
        outcome: 'core_failed',
        status: coreResult.status ?? 503,
      })
      return NextResponse.json(
        { error: coreResult.error ?? 'Upload reservation was not completed.' },
        { status: coreResult.status ?? 503 }
      )
    }
    if (
      coreResult.data.reservationId !== reservationRequest.data.reservationId ||
      coreResult.data.tenantId !== profile.tenantId ||
      !isExactDocumentUploadReservationPath({
        tenantId: profile.tenantId,
        projectId: coreResult.data.projectId,
        reservationId: reservationRequest.data.reservationId,
        storagePath: coreResult.data.storagePath,
      })
    ) {
      logUploadReservationOutcome({
        traceId,
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        action: 'complete',
        outcome: 'invalid_core_result',
        status: 503,
      })
      return NextResponse.json(
        { error: 'ERP Core returned an invalid upload completion result.' },
        { status: 503 }
      )
    }
    storagePath = coreResult.data.storagePath
    projectId = coreResult.data.projectId
    fileName = coreResult.data.fileName
    mimeType = coreResult.data.mimeType
    intake = {
      documentId: coreResult.data.documentId,
      storagePath: coreResult.data.storagePath,
      documentType: coreResult.data.documentType,
      created: coreResult.data.created,
    }
    logUploadReservationOutcome({
      traceId,
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      action: 'complete',
      outcome: 'succeeded',
      status: 200,
    })
  } else {
    if (!legacyRequest.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (documentUploadReservationIssuanceUsesCoreApi(profile.tenantId)) {
      return NextResponse.json(
        { error: 'reservationId is required for this tenant.' },
        { status: 400 }
      )
    }
    const { description, sizeBytes } = legacyRequest.data
    storagePath = legacyRequest.data.storagePath
    projectId = legacyRequest.data.projectId
    fileName = legacyRequest.data.fileName
    mimeType = legacyRequest.data.mimeType

    const expectedPrefix = `${profile.tenantId}/${projectId}/`
    if (
      !storagePath.startsWith(expectedPrefix) ||
      storagePath.split('/').some((segment) => segment === '..')
    ) {
      return NextResponse.json(
        { error: 'Storage path not in tenant scope' },
        { status: 403 }
      )
    }
    if (sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds 100 MB limit' },
        { status: 413 }
      )
    }

    const coreResult = await createDocumentThroughCoreApi(
      {
        storagePath,
        projectId,
        fileName,
        mimeType,
        sizeBytes,
        description: description ?? null,
      },
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
    intake = coreResult.data
  }

  const { cadFormat, extractorKind } = classify(fileName, mimeType)
  const docId = intake.documentId

  // A retry may observe a Core replay after Web crashed immediately after the
  // document commit. Continue the downstream recovery path: CAD commits and
  // queue requests use document-derived idempotency keys, while local
  // extraction is deterministic and privately cached.

  // Unified document intake pipeline.
  //
  //   - DXF/DWG  → evidence-only parse, then an ERP Core evidence commit
  //   - PDF/image/spreadsheet/CSV/DOCX → deterministic local text/OCR read
  //
  // All branches retain the legacy `cadResult` response shape. Non-CAD
  // parsing returns private source evidence only: it never calls a model,
  // consumes provider quota, or creates a BOM candidate automatically.
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
        unpricedCandidateBom?: boolean
        processingJobId?: string | null
        extractedCharacters?: number
        extractionPages?: number | null
        extractionSheets?: number | null
        extractionOcrConfidence?: number | null
        extractionCacheHit?: boolean
      }
    | undefined

  if (cadFormat) {
    try {
      // CAD parsing produces immutable evidence only. ERP Core is the sole
      // authority for official scope rows, idempotency, and audit. A failed
      // Core command is terminal and never falls back to a Web database write.
      if (
        !(
          cadFormat === 'dwg' &&
          documentProcessingJobsUseCoreApi(profile.tenantId)
        )
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
            // Both the worker evidence and the Core commit have completed in
            // this request. Preserve the legacy flag's actual meaning: only
            // an outstanding Core processing job is queued.
            cadParseQueued = false
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
        // Binary DWG processing is an optional Core queue seam. Once selected,
        // Core owns the worker bridge and its eventual evidence commit.
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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[upload/complete] inline CAD parse failed:', err)
      cadParseWarning = `CAD parse failed: ${message}`
    }
  } else if (extractorKind) {
    try {
      const extracted = await extractDeterministicDocument({
        tenantId: profile.tenantId,
        storagePath,
        fileName,
        mimeType,
        kind: extractorKind,
      })

      cadParseQueued = false
      cadResult = {
        status:
          extracted.status === 'no-text'
            ? 'no-items'
            : extracted.status,
        scopeItemsCreated: 0,
        warnings: extracted.warnings,
        layerCount: 0,
        entityCount: 0,
        detectedFormat: extracted.detectedKind,
        dwgVersion: null,
        extensionMismatch: false,
        message: extracted.message,
        bomId: null,
        bomTcvCents: 0,
        bomCostCents: 0,
        bomGpMarginBps: 0,
        ragMatches: 0,
        aiEstimateMatches: 0,
        extractedCharacters: extracted.extractedCharacters,
        extractionPages: extracted.pages,
        extractionSheets: extracted.sheets,
        extractionOcrConfidence: extracted.ocrConfidence,
        extractionCacheHit: extracted.cacheHit,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[upload/complete] deterministic extraction failed:', err)
      cadParseWarning = `Local document extraction failed: ${message}`
    }
  }

  const response = documentUploadCompleteResultSchema.parse({
    id: docId,
    storagePath,
    documentType: intake.documentType,
    cadFormat,
    cadParseQueued,
    ...(cadParseWarning ? { cadParseWarning } : {}),
    ...(cadResult ? { cadResult } : {}),
  })

  return NextResponse.json(response)
}
