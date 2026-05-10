// In-process CAD parsing pipeline.
//
//   1. Download the uploaded file from Supabase Storage
//   2. Detect actual format (DXF text vs binary DWG) from magic bytes
//   3. For DXF: parse with the JS extractor (dxf-parser), extract scope items,
//      run auto-BOM. Runs entirely in the Next.js Node runtime.
//   4. For binary DWG: try the Python worker via Inngest if configured;
//      otherwise return a structured "needs converter" result so the UI can
//      explain the situation to the user.
//
// Important: extension is treated as a hint, not truth. Some CAD users save
// DXF content under a .dwg extension and vice versa — magic-byte detection
// catches that and routes correctly.

import { createSupabaseAdminClient } from '@buildops/auth/server'
import { db } from '@buildops/database'
import { scopeItems } from '@buildops/database/schema'
import { and, eq, like } from 'drizzle-orm'

import { extractFromDxfText } from './dxf-extractor'
import { calcDraftBomFromScope, type AutoBomResult } from './auto-bom'
import { detectCadFormat, fileExtensionOf } from './format-detect'

export interface ParseAndStoreInput {
  tenantId: string
  projectId: string
  documentId: string
  storagePath: string
  fileName: string
}

export type ParseStatus =
  | 'extracted' // DXF (or DWG-named DXF) parsed in-process
  | 'binary-dwg-pending' // real DWG, needs converter (no scope yet)
  | 'unknown-format' // not DXF and not DWG header — bail
  | 'download-failed'

export interface ParseAndStoreResult {
  status: ParseStatus
  scopeItemsCreated: number
  warnings: string[]
  layerCount: number
  entityCount: number
  detectedFormat: 'dxf' | 'dwg' | 'unknown'
  dwgVersion: string | null
  extensionMismatch: boolean
  bom: AutoBomResult | null
  message: string
}

const SCOPE_BATCH_SIZE = 200

export async function parseAndStoreCad(
  input: ParseAndStoreInput
): Promise<ParseAndStoreResult> {
  const { tenantId, projectId, documentId, storagePath, fileName } = input

  // 1. Download the file (binary-safe)
  const supabase = createSupabaseAdminClient()
  const { data: blob, error: dlErr } = await supabase.storage
    .from('documents')
    .download(storagePath)

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

        // Worker writes scope_items itself. Now run the auto-BOM inline so the
        // user sees an extracted scope + draft BOM in the same request.
        let bom: AutoBomResult | null = null
        if (workerResult.count > 0) {
          try {
            bom = await calcDraftBomFromScope({ tenantId, projectId, documentId })
          } catch (err) {
            console.error('[parse-and-store] auto-BOM failed:', err)
            workerResult.warnings.push(
              `Auto-BOM failed: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        return {
          status: 'extracted',
          scopeItemsCreated: workerResult.count,
          warnings: workerResult.warnings,
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: detection.dwgVersion,
          extensionMismatch: detection.mismatch,
          bom,
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
      message:
        'File does not appear to be a valid CAD file. Stored, but no scope extracted.',
    }
  }

  // 4. DXF (whether the extension was .dxf or .dwg, content is text DXF)
  const dxfText = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const extraction = extractFromDxfText(dxfText)

  // Replace any prior auto-extracted rows for this document
  await db
    .delete(scopeItems)
    .where(
      and(
        eq(scopeItems.tenant_id, tenantId),
        eq(scopeItems.project_id, projectId),
        like(scopeItems.notes, `%document:${documentId}%`)
      )
    )

  if (extraction.items.length > 0) {
    const rows = extraction.items.map((item, idx) => ({
      tenant_id: tenantId,
      project_id: projectId,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost_cents: item.unit_cost_cents,
      line_total_cents: item.unit_cost_cents * item.quantity,
      sort_order: idx,
      notes:
        `auto-extracted; document:${documentId}` +
        (item.notes ? `; ${item.notes}` : ''),
    }))

    for (let i = 0; i < rows.length; i += SCOPE_BATCH_SIZE) {
      await db.insert(scopeItems).values(rows.slice(i, i + SCOPE_BATCH_SIZE))
    }
  }

  // 5. Auto-BOM (non-fatal if it errors)
  let bom: AutoBomResult | null = null
  if (extraction.items.length > 0) {
    try {
      bom = await calcDraftBomFromScope({ tenantId, projectId, documentId })
    } catch (err) {
      console.error('[parse-and-store] auto-BOM failed:', err)
      extraction.warnings.push(
        `Auto-BOM failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const message = detection.mismatch
    ? `File extension was .${ext} but content is DXF — parsed successfully.`
    : `Parsed ${extraction.items.length} scope item${extraction.items.length === 1 ? '' : 's'} from ${extraction.entityCount} entities across ${extraction.layerCount} layers.`

  return {
    status: 'extracted',
    scopeItemsCreated: extraction.items.length,
    warnings: extraction.warnings,
    layerCount: extraction.layerCount,
    entityCount: extraction.entityCount,
    detectedFormat: 'dxf',
    dwgVersion: null,
    extensionMismatch: detection.mismatch,
    bom,
    message,
  }
}

// Backward-compat alias — old name was DXF-specific
export const parseAndStoreDxf = parseAndStoreCad

interface DwgWorkerResponse {
  count: number
  warnings: string[]
  source_format?: string
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

async function callDwgWorker(args: DwgWorkerCallArgs): Promise<DwgWorkerResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS)
  try {
    const url = `${args.parserUrl.replace(/\/$/, '')}/parse`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const json = (await res.json()) as {
      count?: number
      warnings?: string[]
      source_format?: string
    }
    return {
      count: typeof json.count === 'number' ? json.count : 0,
      warnings: Array.isArray(json.warnings) ? json.warnings : [],
      source_format: json.source_format,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`worker timed out after ${WORKER_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
