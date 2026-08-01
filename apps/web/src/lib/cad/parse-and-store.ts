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

import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents, scopeItems } from '@third-code-erp/database/schema'
import { and, eq, like } from 'drizzle-orm'
import { z } from 'zod'

import { extractFromDxfText } from './dxf-extractor'
import { calcDraftBomFromScope, type AutoBomResult } from './auto-bom'
import { detectCadFormat, fileExtensionOf } from './format-detect'
import {
  parseWorkerResponse,
  type WorkerParseResponse,
  type WorkerScopeItem,
} from './worker-contract'
import { writeAuditLogInTransaction } from '@/lib/audit'

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
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function safeScopeLineTotalCents(item: WorkerScopeItem): number {
  const total = BigInt(item.unit_cost_cents) * BigInt(item.quantity)
  if (total > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error('CAD parser returned a scope line value outside supported range')
  }
  return Number(total)
}

export async function persistExtractedScopeItems(input: {
  tenantId: string
  projectId: string
  documentId: string
  actorId?: string | null
  sourceFormat: 'dxf' | 'dwg'
  items: WorkerScopeItem[]
}): Promise<number> {
  const tenantId = z.string().uuid().parse(input.tenantId)
  const projectId = z.string().uuid().parse(input.projectId)
  const documentId = z.string().uuid().parse(input.documentId)
  const actorId = input.actorId ? z.string().uuid().parse(input.actorId) : null

  return db.transaction(async (tx) => {
    const [document] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenant_id, tenantId),
          eq(documents.project_id, projectId)
        )
      )
      .limit(1)
    if (!document) throw new Error('CAD document is outside tenant project scope')

    await tx
      .delete(scopeItems)
      .where(
        and(
          eq(scopeItems.tenant_id, tenantId),
          eq(scopeItems.project_id, projectId),
          like(scopeItems.notes, `%document:${documentId}%`)
        )
      )

    const rows = input.items.map((item, index) => ({
      tenant_id: tenantId,
      project_id: projectId,
      created_by: actorId,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost_cents: item.unit_cost_cents,
      line_total_cents: safeScopeLineTotalCents(item),
      sort_order: index,
      notes:
        `auto-extracted; document:${documentId}` +
        (item.notes ? `; ${item.notes}` : ''),
    }))

    for (let i = 0; i < rows.length; i += SCOPE_BATCH_SIZE) {
      await tx.insert(scopeItems).values(rows.slice(i, i + SCOPE_BATCH_SIZE))
    }

    await writeAuditLogInTransaction(tx, {
      tenantId,
      actorId,
      entityType: 'document',
      entityId: documentId,
      action: 'update',
      diff: {
        scope_items_replaced: rows.length,
        source: 'cad_parser_worker',
        source_format: input.sourceFormat,
      },
    })

    return rows.length
  })
}

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

        const scopeItemsCreated = await persistExtractedScopeItems({
          tenantId,
          projectId,
          documentId,
          actorId: input.actorId,
          sourceFormat: workerResult.source_format,
          items: workerResult.scope_items,
        })

        // Commit the worker evidence in the application transaction, then run
        // the auto-BOM inline so the user sees an extracted scope + draft BOM
        // in the same request.
        let bom: AutoBomResult | null = null
        if (scopeItemsCreated > 0) {
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
          scopeItemsCreated,
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

  const scopeItemsCreated = await persistExtractedScopeItems({
    tenantId,
    projectId,
    documentId,
    actorId: input.actorId,
    sourceFormat: 'dxf',
    items: extraction.items,
  })

  // 5. Auto-BOM (non-fatal if it errors)
  let bom: AutoBomResult | null = null
  if (scopeItemsCreated > 0) {
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
    scopeItemsCreated,
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
