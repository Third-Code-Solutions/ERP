// Vision-based scope extraction for PDFs and images.
//
// Mirrors the parse-and-store DXF pipeline but uses OpenAI's Responses API with
// input_file (PDF) or input_image (raster image) to read a scope/BOM list out of
// a document. The output is normalized into the same scope_items rows that the
// DXF path produces, so calcDraftBomFromScope can run unchanged afterwards.
//
// This is the path that powers the "upload an image or PDF → draft BOM appears"
// UX. Before this, /api/upload/complete persisted the document but never wrote
// scope items, so the UI reported a successful upload with no generated BOM.
//
// The Responses API accepts a base64 data URL via file_data / image_url and
// renders PDFs server-side; we don't need a separate PDF→image converter.

import { db } from '@buildops/database'
import { scopeItems } from '@buildops/database/schema'
import { and, eq, like } from 'drizzle-orm'
import { createSupabaseAdminClient } from '@buildops/auth/server'
import OpenAI from 'openai'
import type { ResponseInputContent } from 'openai/resources/responses/responses'
import { calcDraftBomFromScope, type AutoBomResult } from '../cad/auto-bom'

const VISION_MODEL = 'gpt-4o-mini'

// OpenAI accepts ~32 MB inline file_data; image inputs are smaller in practice.
// We cap below the documented limits to leave room for the prompt + response.
const MAX_PDF_BYTES = 25 * 1024 * 1024
const MAX_IMAGE_BYTES = 18 * 1024 * 1024

const SCOPE_BATCH_SIZE = 200
const MAX_OUTPUT_TOKENS = 4096

export type VisualKind = 'pdf' | 'image'

export type VisualExtractStatus =
  | 'extracted'
  | 'no-items'
  | 'download-failed'
  | 'ai-not-configured'
  | 'too-large'
  | 'error'

export interface VisualExtractInput {
  tenantId: string
  projectId: string
  documentId: string
  storagePath: string
  fileName: string
  mimeType: string
  kind: VisualKind
}

export interface VisualExtractResult {
  status: VisualExtractStatus
  scopeItemsCreated: number
  warnings: string[]
  detectedKind: VisualKind
  bom: AutoBomResult | null
  message: string
}

interface ExtractedScopeItem {
  code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_cost_php: number | null
  notes: string | null
}

const SYSTEM_PROMPT = `You are an estimating expert for Philippine construction (MEP, fit-out, interior build-outs).
You are given an image or PDF that may be a Bill of Materials, scope list, specification page,
priced quote, takeoff worksheet, or even a hand-drawn plan. Extract every distinct LINE ITEM that
is clearly material, equipment, fixture, or labor work needed for the project.

For each item return:
- description: canonical material/equipment/labor name. Expand abbreviations (e.g. "FCU" → "Fan Coil Unit", "GI" → "Galvanized Iron").
- quantity: integer count when shown; if a range is given use the higher end; if unclear, use 1.
- unit: short unit like "pc","set","lot","m","sqm","cbm","kg","hr","ls". Omit (null) when unknown.
- code: any SKU / item code printed next to the line. Omit when none.
- unit_cost_php: only when a unit price in Philippine Pesos is clearly shown alongside the line. Omit otherwise.
- notes: brief estimator-facing note (assumption, page number, alternative). Omit when not useful.

Do NOT invent items. If the document does not contain any scope/BOM-like content (logo, signature page,
generic plan with no labels, etc.), return an empty items array. Never wrap output in markdown.`

const SCOPE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'description', 'unit', 'quantity', 'unit_cost_php', 'notes'],
        properties: {
          code: { type: ['string', 'null'] },
          description: { type: 'string' },
          unit: { type: ['string', 'null'] },
          quantity: { type: 'number' },
          unit_cost_php: { type: ['number', 'null'] },
          notes: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const

function notConfigured(kind: VisualKind): VisualExtractResult {
  return {
    status: 'ai-not-configured',
    scopeItemsCreated: 0,
    warnings: ['OPENAI_API_KEY missing on the server'],
    detectedKind: kind,
    bom: null,
    message:
      `${kind === 'pdf' ? 'PDF' : 'Image'} stored. AI extraction is not configured on this deployment — ` +
      'set OPENAI_API_KEY in Vercel and re-upload, or add line items manually.',
  }
}

export async function extractScopeFromVisual(
  input: VisualExtractInput
): Promise<VisualExtractResult> {
  const { tenantId, projectId, documentId, storagePath, fileName, mimeType, kind } = input

  if (!process.env.OPENAI_API_KEY) return notConfigured(kind)

  const supabase = createSupabaseAdminClient()
  const { data: blob, error: dlErr } = await supabase.storage
    .from('documents')
    .download(storagePath)

  if (dlErr || !blob) {
    return {
      status: 'download-failed',
      scopeItemsCreated: 0,
      warnings: [`Storage download failed: ${dlErr?.message ?? 'unknown error'}`],
      detectedKind: kind,
      bom: null,
      message:
        `${kind === 'pdf' ? 'PDF' : 'Image'} stored but could not be re-read for AI extraction.`,
    }
  }

  const sizeLimit = kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (blob.size > sizeLimit) {
    return {
      status: 'too-large',
      scopeItemsCreated: 0,
      warnings: [
        `File ${(blob.size / 1024 / 1024).toFixed(1)} MB exceeds AI extraction limit of ${(sizeLimit / 1024 / 1024).toFixed(0)} MB`,
      ],
      detectedKind: kind,
      bom: null,
      message: `${kind === 'pdf' ? 'PDF' : 'Image'} stored. Too large for inline AI extraction — split into smaller pages or add line items manually.`,
    }
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const base64 = buffer.toString('base64')
  const safeMime = kind === 'pdf' ? 'application/pdf' : mimeType || 'image/png'
  const dataUrl = `data:${safeMime};base64,${base64}`

  // Use the local openai v6 SDK directly (not @buildops/ai's getOpenAI which is
  // pinned to v4). v6 is what supports the Responses API + input_file/input_image
  // shapes we rely on here.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let extracted: ExtractedScopeItem[] = []
  const warnings: string[] = []

  try {
    const userContent: ResponseInputContent[] =
      kind === 'pdf'
        ? [
            {
              type: 'input_text',
              text:
                `Extract scope items from this PDF: ${fileName}. ` +
                'Read every page. Return strict JSON matching the schema.',
            },
            {
              type: 'input_file',
              filename: fileName,
              file_data: dataUrl,
            },
          ]
        : [
            {
              type: 'input_text',
              text:
                `Extract scope items from this image: ${fileName}. ` +
                'Return strict JSON matching the schema.',
            },
            {
              type: 'input_image',
              image_url: dataUrl,
              detail: 'high',
            },
          ]

    const systemContent: ResponseInputContent[] = [
      { type: 'input_text', text: SYSTEM_PROMPT },
    ]

    const response = await openai.responses.create({
      model: VISION_MODEL,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'scope_extraction',
          strict: true,
          schema: SCOPE_JSON_SCHEMA,
        },
      },
    })

    const outputText = response.output_text?.trim()
    if (!outputText) {
      warnings.push('AI returned an empty response.')
    } else {
      try {
        const parsed = JSON.parse(outputText) as { items?: ExtractedScopeItem[] }
        if (Array.isArray(parsed.items)) extracted = parsed.items
      } catch (parseErr) {
        warnings.push(
          `AI returned unparseable JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        )
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'error',
      scopeItemsCreated: 0,
      warnings: [`AI extraction failed: ${message}`],
      detectedKind: kind,
      bom: null,
      message:
        `${kind === 'pdf' ? 'PDF' : 'Image'} stored. AI extraction failed — open the file from the documents tab ` +
        'and add line items manually while the upstream issue is investigated.',
    }
  }

  // Always wipe any previous extraction for this same document so re-uploads
  // (or model retries) don't accumulate duplicates.
  await db
    .delete(scopeItems)
    .where(
      and(
        eq(scopeItems.tenant_id, tenantId),
        eq(scopeItems.project_id, projectId),
        like(scopeItems.notes, `%document:${documentId}%`)
      )
    )

  if (extracted.length === 0) {
    return {
      status: 'no-items',
      scopeItemsCreated: 0,
      warnings,
      detectedKind: kind,
      bom: null,
      message:
        kind === 'pdf'
          ? 'PDF stored. AI did not find scope-like content — try a clearer page set or add line items manually.'
          : 'Image stored. AI did not find scope-like content — try a clearer photo or add line items manually.',
    }
  }

  const rows = extracted.map((item, idx) => {
    const description = (item.description ?? '').toString().trim().slice(0, 1000) || 'Unspecified item'
    const code = item.code ? String(item.code).trim().slice(0, 50) || null : null
    const unitRaw = item.unit ? String(item.unit).trim().slice(0, 20) : ''
    const unit = unitRaw.length > 0 ? unitRaw : 'pc'
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
        ? Math.max(1, Math.round(item.quantity))
        : 1
    const unitCostCents =
      typeof item.unit_cost_php === 'number' &&
      Number.isFinite(item.unit_cost_php) &&
      item.unit_cost_php > 0
        ? Math.round(item.unit_cost_php * 100)
        : 0
    const noteFragment = item.notes ? String(item.notes).trim().slice(0, 300) : ''

    return {
      tenant_id: tenantId,
      project_id: projectId,
      code,
      description,
      unit,
      quantity,
      unit_cost_cents: unitCostCents,
      line_total_cents: unitCostCents * quantity,
      sort_order: idx,
      notes:
        `auto-extracted (vision/${kind}); document:${documentId}` +
        (noteFragment ? `; ${noteFragment}` : ''),
    }
  })

  for (let i = 0; i < rows.length; i += SCOPE_BATCH_SIZE) {
    await db.insert(scopeItems).values(rows.slice(i, i + SCOPE_BATCH_SIZE))
  }

  // Auto-BOM (non-fatal — scope still exists if this errors).
  let bom: AutoBomResult | null = null
  try {
    bom = await calcDraftBomFromScope({ tenantId, projectId, documentId })
  } catch (err) {
    warnings.push(
      `Auto-BOM failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return {
    status: 'extracted',
    scopeItemsCreated: rows.length,
    warnings,
    detectedKind: kind,
    bom,
    message: `Extracted ${rows.length} scope item${rows.length === 1 ? '' : 's'} from ${kind === 'pdf' ? 'PDF' : 'image'} via AI vision.`,
  }
}
