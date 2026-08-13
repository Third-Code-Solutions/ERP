// CAD parsing pipeline.
//
// Next.js owns official scope-item and draft-BOM writes. The Python worker is
// evidence-only: it receives a short-lived exact-object URL and returns
// bounded extraction evidence without tenant, project, document, or database
// authority.

import { createHash, randomUUID } from 'node:crypto'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { scopeItems } from '@third-code-erp/database/schema'
import { and, eq, like } from 'drizzle-orm'
import { z } from 'zod'

import { extractFromDxfText } from './dxf-extractor'
import { calcDraftBomFromScope, type AutoBomResult } from './auto-bom'
import { detectCadFormat, fileExtensionOf } from './format-detect'

export interface ParseAndStoreInput {
  tenantId: string
  projectId: string
  documentId: string
  storagePath: string
  fileName: string
  createDraftBom?: boolean
}

export type ParseStatus =
  | 'extracted'
  | 'binary-dwg-pending'
  | 'unknown-format'
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

interface PersistedScopeItem {
  code: string | null
  description: string
  unit: string
  quantity: number
  unitCostCents: number
  notes: string | null
}

const SCOPE_BATCH_SIZE = 200
const WORKER_TIMEOUT_MS = 90_000

const workerItemSchema = z.object({
  item_key: z.string().regex(/^[0-9a-f]{64}$/),
  code: z.string().nullable(),
  description: z.string().min(1).max(500),
  unit: z.string().min(1).max(64),
  quantity: z.number().int().positive(),
  recommended_unit_cost_cents: z.number().int().nonnegative(),
  notes: z.string().nullable(),
})

const workerResponseSchema = z.object({
  schema_version: z.literal(1),
  job_id: z.string().uuid(),
  attempt: z.number().int().positive(),
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_format: z.enum(['dxf', 'dwg']),
  parsed_format: z.literal('dxf'),
  items: z.array(workerItemSchema).max(5_000),
  warnings: z.array(z.string().max(500)).max(100),
})

async function persistScopeItems(
  tenantId: string,
  projectId: string,
  documentId: string,
  items: PersistedScopeItem[],
): Promise<number> {
  await db.transaction(async (tx) => {
    await tx
      .delete(scopeItems)
      .where(
        and(
          eq(scopeItems.tenant_id, tenantId),
          eq(scopeItems.project_id, projectId),
          like(scopeItems.notes, `%document:${documentId}%`),
        ),
      )

    const rows = items.map((item, index) => ({
      tenant_id: tenantId,
      project_id: projectId,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost_cents: item.unitCostCents,
      line_total_cents: item.unitCostCents * item.quantity,
      sort_order: index,
      notes:
        `auto-extracted; document:${documentId}` +
        (item.notes ? `; ${item.notes}` : ''),
    }))

    for (let index = 0; index < rows.length; index += SCOPE_BATCH_SIZE) {
      await tx
        .insert(scopeItems)
        .values(rows.slice(index, index + SCOPE_BATCH_SIZE))
    }
  })

  return items.length
}

function toPersistedDxfItems(
  items: Array<{
    code: string | null
    description: string
    unit: string
    quantity: number
    unit_cost_cents: number
    notes: string | null
  }>,
): PersistedScopeItem[] {
  return items.map((item) => ({
    code: item.code,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitCostCents: item.unit_cost_cents,
    notes: item.notes,
  }))
}

function toPersistedWorkerItems(
  items: Array<z.infer<typeof workerItemSchema>>,
): PersistedScopeItem[] {
  return items.map((item) => ({
    code: item.code,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitCostCents: item.recommended_unit_cost_cents,
    notes: item.notes,
  }))
}

export async function parseAndStoreCad(
  input: ParseAndStoreInput,
): Promise<ParseAndStoreResult> {
  const {
    tenantId,
    projectId,
    documentId,
    storagePath,
    fileName,
    createDraftBom = true,
  } = input
  const supabase = createSupabaseAdminClient()
  const { data: blob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(storagePath)

  if (downloadError || !blob) {
    console.error('[parse-and-store] storage download failed', {
      documentId,
      error: downloadError?.message,
    })
    return {
      status: 'download-failed',
      scopeItemsCreated: 0,
      warnings: ['Storage download failed.'],
      layerCount: 0,
      entityCount: 0,
      detectedFormat: 'unknown',
      dwgVersion: null,
      extensionMismatch: false,
      bom: null,
      message: 'File could not be retrieved from storage.',
    }
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const extension = fileExtensionOf(fileName)
  const detection = detectCadFormat(bytes, extension)

  if (detection.format === 'dwg') {
    const parserUrl = process.env.DXF_PARSER_URL
    if (parserUrl) {
      try {
        const sourceSha256 = createHash('sha256').update(bytes).digest('hex')
        const { data: signed, error: signedUrlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, 120)
        if (signedUrlError || !signed?.signedUrl) {
          throw new Error('Signed source URL unavailable')
        }

        const workerResult = await callDwgWorker({
          parserUrl,
          fileName,
          sourceSha256,
          sourceUrl: signed.signedUrl,
        })
        const scopeItemsCreated = await persistScopeItems(
          tenantId,
          projectId,
          documentId,
          toPersistedWorkerItems(workerResult.items),
        )

        let bom: AutoBomResult | null = null
        if (createDraftBom && scopeItemsCreated > 0) {
          try {
            bom = await calcDraftBomFromScope({ tenantId, projectId, documentId })
          } catch (error) {
            console.error('[parse-and-store] auto-BOM failed', {
              documentId,
              error: error instanceof Error ? error.message : 'unknown',
            })
            workerResult.warnings.push('Auto-BOM could not be created.')
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
          message: `DWG ${detection.dwgVersion ?? ''} converted via worker · ${scopeItemsCreated} scope item${scopeItemsCreated === 1 ? '' : 's'} extracted.`,
        }
      } catch (error) {
        console.error('[parse-and-store] DWG evidence path failed', {
          documentId,
          error: error instanceof Error ? error.message : 'unknown',
        })
        return {
          status: 'binary-dwg-pending',
          scopeItemsCreated: 0,
          warnings: ['DWG evidence extraction is temporarily unavailable.'],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: detection.dwgVersion,
          extensionMismatch: detection.mismatch,
          bom: null,
          message:
            'DWG stored. Evidence extraction is temporarily unavailable; verify the worker or re-export as DXF for instant extraction.',
        }
      }
    }

    return {
      status: 'binary-dwg-pending',
      scopeItemsCreated: 0,
      warnings: [
        `Binary DWG detected (${detection.dwgVersion ?? 'unknown version'}). Server-side conversion required for scope extraction.`,
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

  const dxfText = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const extraction = extractFromDxfText(dxfText)
  const scopeItemsCreated = await persistScopeItems(
    tenantId,
    projectId,
    documentId,
    toPersistedDxfItems(extraction.items),
  )

  let bom: AutoBomResult | null = null
  if (createDraftBom && scopeItemsCreated > 0) {
    try {
      bom = await calcDraftBomFromScope({ tenantId, projectId, documentId })
    } catch (error) {
      console.error('[parse-and-store] auto-BOM failed', {
        documentId,
        error: error instanceof Error ? error.message : 'unknown',
      })
      extraction.warnings.push('Auto-BOM could not be created.')
    }
  }

  const message = detection.mismatch
    ? `File extension was .${extension} but content is DXF — parsed successfully.`
    : `Parsed ${scopeItemsCreated} scope item${scopeItemsCreated === 1 ? '' : 's'} from ${extraction.entityCount} entities across ${extraction.layerCount} layers.`

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

export const parseAndStoreDxf = parseAndStoreCad

type DwgWorkerResponse = z.infer<typeof workerResponseSchema>

interface DwgWorkerCallArgs {
  parserUrl: string
  fileName: string
  sourceSha256: string
  sourceUrl: string
}

async function callDwgWorker(args: DwgWorkerCallArgs): Promise<DwgWorkerResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const sharedSecret = process.env.PARSER_SHARED_SECRET
    if (!sharedSecret) throw new Error('PARSER_SHARED_SECRET is not configured')
    headers.Authorization = `Bearer ${sharedSecret}`

    const response = await fetch(`${args.parserUrl.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        job_id: randomUUID(),
        attempt: 1,
        source_url: args.sourceUrl,
        source_sha256: args.sourceSha256,
        source_format: 'dwg',
        file_name: args.fileName,
        max_bytes: 100 * 1024 * 1024,
        max_items: 5_000,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`worker returned ${response.status}`)
    }

    const parsed = workerResponseSchema.parse(await response.json())
    if (parsed.source_sha256 !== args.sourceSha256) {
      throw new Error('worker source hash mismatch')
    }
    return parsed
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`worker timed out after ${WORKER_TIMEOUT_MS / 1000}s`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
