// In-process CAD evidence parser.
//
//   1. Download the uploaded file from Supabase Storage
//   2. Detect actual format (DXF text vs binary DWG) from magic bytes
//   3. For DXF: parse with the JS extractor (dxf-parser) and return validated
//      scope evidence.
//   4. For binary DWG: call the Python parser if configured; otherwise return
//      a structured "needs converter" result.
//
// This module deliberately has no database or BOM side effects. ERP Core owns
// scope replacement, audit, idempotency, and any subsequent draft-BOM command.
//
// Important: extension is treated as a hint, not truth. Some CAD users save
// DXF content under a .dwg extension and vice versa — magic-byte detection
// catches that and routes correctly.

import { extractFromDxfText } from './dxf-extractor'
import { detectCadFormat, fileExtensionOf } from './format-detect'
import {
  parseWorkerResponse,
  type WorkerParseResponse,
} from './worker-contract'
import {
  createDocumentStorage,
  type DocumentStorage,
} from '@/lib/storage/document-storage'

export interface ParseAndStoreInput {
  tenantId: string
  projectId: string
  documentId: string
  storagePath: string
  fileName: string
  actorId?: string | null
}

export type ParseStatus =
  | 'extracted' // DXF (or DWG-named DXF) parsed in-process
  | 'binary-dwg-pending' // real DWG, needs converter (no scope yet)
  | 'unknown-format' // not DXF and not DWG header — bail
  | 'download-failed'
  | 'parse-failed'

/** Evidence-only CAD result. No database or BOM side effect. */
export interface CadEvidenceParseResult {
  status: ParseStatus
  scopeItemsCreated: 0
  warnings: string[]
  layerCount: number
  entityCount: number
  detectedFormat: 'dxf' | 'dwg' | 'unknown'
  dwgVersion: string | null
  extensionMismatch: boolean
  bom: null
  message: string
  workerResponse: WorkerParseResponse | null
}

export async function parseCadEvidence(
  input: ParseAndStoreInput,
  storage: DocumentStorage = createDocumentStorage()
): Promise<CadEvidenceParseResult> {
  const { tenantId, projectId, documentId, storagePath, fileName } = input

  // 1. Download the file (binary-safe)
  const { data: blob, error: dlErr } = await storage.download(storagePath)

  if (dlErr || !blob) {
    return {
      status: 'download-failed',
      scopeItemsCreated: 0,
      warnings: [`Storage download failed: ${dlErr?.message ?? 'unknown error'}`],
      layerCount: 0,
      entityCount: 0,
      detectedFormat: 'unknown',
      dwgVersion: null,
      extensionMismatch: false,
      bom: null,
      message: 'File could not be retrieved from storage.',
      workerResponse: null,
    }
  }

  const arrayBuf = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuf)
  const ext = fileExtensionOf(fileName)
  const detection = detectCadFormat(bytes, ext)

  // 2. Real binary DWG → call the Python worker directly when reachable
  if (detection.format === 'dwg') {
    const parserUrl = process.env.DXF_PARSER_URL
    if (parserUrl) {
      try {
        const workerResult = await callDwgWorker({
          parserUrl,
          documentId,
          projectId,
          tenantId,
          storagePath,
          fileName,
        })

        return {
          status: 'extracted',
          scopeItemsCreated: 0,
          warnings: workerResult.warnings,
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: detection.dwgVersion,
          extensionMismatch: detection.mismatch,
          workerResponse: workerResult,
          bom: null,
          message: `DWG ${detection.dwgVersion ?? ''} converted via worker · ${workerResult.count} scope item${workerResult.count === 1 ? '' : 's'} extracted.`,
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[parse-and-store] DWG worker call failed:', err)
        return {
          status: 'binary-dwg-pending',
          scopeItemsCreated: 0,
          warnings: [`DWG worker error: ${errMsg}`],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: detection.dwgVersion,
          extensionMismatch: detection.mismatch,
          bom: null,
          workerResponse: null,
          message: `DWG stored. Worker at DXF_PARSER_URL is unreachable (${errMsg}). Verify the worker is running, or re-export as DXF for instant extraction.`,
        }
      }
    }

    // No worker configured — fall back to the queued path with a friendly message
    return {
      status: 'binary-dwg-pending',
      scopeItemsCreated: 0,
      warnings: [
        `Binary DWG detected (${detection.dwgVersion ?? 'unknown version'}). ` +
          'Server-side conversion required for scope extraction.',
      ],
      layerCount: 0,
      entityCount: 0,
      detectedFormat: 'dwg',
      dwgVersion: detection.dwgVersion,
      extensionMismatch: detection.mismatch,
      bom: null,
      workerResponse: null,
      message:
        'DWG stored. To enable automatic DWG extraction, deploy the CAD parser worker and set DXF_PARSER_URL — or re-export as DXF for instant in-browser extraction.',
    }
  }

  // 3. Unknown header → bail with a useful message
  if (detection.format === 'unknown') {
    return {
      status: 'unknown-format',
      scopeItemsCreated: 0,
      warnings: ['Could not detect a CAD header (neither DXF text nor DWG binary).'],
      layerCount: 0,
      entityCount: 0,
      detectedFormat: 'unknown',
      dwgVersion: null,
      extensionMismatch: false,
      bom: null,
      workerResponse: null,
      message:
        'File does not appear to be a valid CAD file. Stored, but no scope extracted.',
    }
  }

  // 4. DXF (whether the extension was .dxf or .dwg, content is text DXF)
  const dxfText = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const extraction = extractFromDxfText(dxfText)

  let workerResponse: WorkerParseResponse
  try {
    workerResponse = parseWorkerResponse(
      {
        document_id: documentId,
        scope_items: extraction.items,
        count: extraction.items.length,
        warnings: extraction.warnings,
        parsed_format: 'dxf',
        source_format: 'dxf',
      },
      documentId
    )
  } catch (err) {
    const validationMessage = err instanceof Error ? err.message : String(err)
    return {
      status: 'parse-failed',
      scopeItemsCreated: 0,
      warnings: [
        ...extraction.warnings,
        `CAD evidence validation failed: ${validationMessage}`,
      ],
      layerCount: extraction.layerCount,
      entityCount: extraction.entityCount,
      detectedFormat: 'dxf',
      dwgVersion: null,
      extensionMismatch: detection.mismatch,
      bom: null,
      message: 'DXF parsed, but evidence failed validation. No scope was committed.',
      workerResponse: null,
    }
  }

  const message = detection.mismatch
    ? `File extension was .${ext} but content is DXF — parsed successfully.`
    : `Parsed ${extraction.items.length} scope item${extraction.items.length === 1 ? '' : 's'} from ${extraction.entityCount} entities across ${extraction.layerCount} layers.`

  return {
    status: 'extracted',
    scopeItemsCreated: 0,
    warnings: extraction.warnings,
    layerCount: extraction.layerCount,
    entityCount: extraction.entityCount,
    detectedFormat: 'dxf',
    dwgVersion: null,
    extensionMismatch: detection.mismatch,
    bom: null,
    message,
    workerResponse,
  }
}

interface DwgWorkerCallArgs {
  parserUrl: string
  documentId: string
  projectId: string
  tenantId: string
  storagePath: string
  fileName: string
}

const WORKER_TIMEOUT_MS = 90_000 // DWG conversion can take a while on big files

async function callDwgWorker(args: DwgWorkerCallArgs): Promise<WorkerParseResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS)
  try {
    const url = `${args.parserUrl.replace(/\/$/, '')}/parse`
    const sharedSecret = process.env.PARSER_SHARED_SECRET
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sharedSecret) headers.Authorization = `Bearer ${sharedSecret}`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        document_id: args.documentId,
        project_id: args.projectId,
        tenant_id: args.tenantId,
        storage_path: args.storagePath,
        format: 'dwg',
        file_name: args.fileName,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`worker returned ${res.status}: ${text.slice(0, 200)}`)
    }
    return parseWorkerResponse(await res.json(), args.documentId)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`worker timed out after ${WORKER_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
