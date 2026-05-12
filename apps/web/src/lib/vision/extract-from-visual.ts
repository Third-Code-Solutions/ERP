// Scope extraction for non-CAD source documents (PDF, image, spreadsheet, CSV,
// Word). Each input gets converted to the right OpenAI Responses-API content
// shape — input_file for PDFs, input_image for raster images, plain input_text
// for tabular or document text — and then a strict json_schema response format
// gives us back a normalized list of scope items. The downstream pipeline
// (scope_items insert + calcDraftBomFromScope) is identical to the DXF path so
// every supported upload produces the same draft BOM with the same provenance.
//
// This is the path that powers "upload anything from the BOM tab → draft BOM
// appears" for construction teams that don't always have a CAD drawing.
//
// Why two SDK versions: @buildops/ai is pinned to openai@4 (its v4 Responses
// types lack the 'original' detail variant + some structured-output fields we
// need). apps/web already pins openai@6 directly, so we instantiate the client
// here rather than going through getOpenAI().

import { db } from '@buildops/database'
import { scopeItems } from '@buildops/database/schema'
import { and, eq, like } from 'drizzle-orm'
import { createSupabaseAdminClient } from '@buildops/auth/server'
import OpenAI from 'openai'
import type { ResponseInputContent } from 'openai/resources/responses/responses'
import { calcDraftBomFromScope, type AutoBomResult } from '../cad/auto-bom'

const VISION_MODEL = 'gpt-4o-mini'

// Per-format upload budgets. The OpenAI inline file_data limit hovers around
// 32 MB; we cap each kind well below that to leave room for prompt + response
// tokens and to keep request times reasonable on Vercel's serverless runtime.
const SIZE_BUDGET: Record<VisualKind, number> = {
  pdf: 25 * 1024 * 1024,
  image: 18 * 1024 * 1024,
  spreadsheet: 25 * 1024 * 1024,
  csv: 25 * 1024 * 1024,
  docx: 25 * 1024 * 1024,
}

const SCOPE_BATCH_SIZE = 200
const MAX_OUTPUT_TOKENS = 4096
// Cap how much extracted text we forward to the model. Most BOM spreadsheets
// and quote docs fit comfortably; for monsters we keep the head + tail so the
// model still sees totals/footers.
const MAX_TEXT_CHARS = 120_000

export type VisualKind = 'pdf' | 'image' | 'spreadsheet' | 'csv' | 'docx'

export type VisualExtractStatus =
  | 'extracted'
  | 'no-items'
  | 'download-failed'
  | 'ai-not-configured'
  | 'too-large'
  | 'parse-failed'
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
  category: string | null
  notes: string | null
}

const SYSTEM_PROMPT = `You are an estimating expert for Philippine construction (MEP, fit-out, interior build-outs).
You will be given source material — image, PDF, spreadsheet, CSV, or word document — that may be a Bill
of Materials, scope list, takeoff worksheet, priced quote, specification, or hand-drawn plan. Extract
every distinct LINE ITEM that is clearly a material, equipment, fixture, or labor item required for the
project.

For each item return:
- description: canonical material / equipment / labor name. Expand abbreviations (e.g. "FCU" → "Fan Coil Unit", "GI" → "Galvanized Iron", "MCB" → "Miniature Circuit Breaker").
- quantity: integer count. If a range is given, use the higher end. If unclear, use 1.
- unit: short unit like "pc","set","lot","m","sqm","cbm","kg","hr","ls". Use null when unknown.
- code: any SKU / item code shown alongside the line. Use null when none.
- unit_cost_php: ONLY when a unit price in Philippine Pesos is clearly shown alongside the line. Use null otherwise.
- category: ONE of these top-level construction divisions — "Mechanical" (HVAC, ducting, refrigeration), "Electrical" (panels, wiring, lighting, controls), "Plumbing" (pipes, fittings, fixtures, drainage), "Fire Protection" (sprinklers, detectors, alarms), "Civil / Structural" (concrete, rebar, formwork, steel), "Architectural / Finishes" (drywall, paint, ceiling, flooring, doors, glazing), "Furniture / Equipment" (FF&E, appliances), "Labor / Services" (manhours, installation, hauling), or "Other". Always pick exactly one.
- notes: brief estimator-facing note (assumption, source row/page, alternative). Use null when not useful.

Rules:
- Do NOT invent items. If the source doesn't contain BOM/scope content (logo, cover page, signature page), return an empty items array.
- Header rows, subtotals, section dividers, page totals, and blank rows are NOT items.
- Items may repeat across pages; keep each occurrence only if it represents a different location / sub-system. Otherwise dedupe.
- Output strict JSON matching the schema; never wrap output in markdown.`

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
        required: [
          'code',
          'description',
          'unit',
          'quantity',
          'unit_cost_php',
          'category',
          'notes',
        ],
        properties: {
          code: { type: ['string', 'null'] },
          description: { type: 'string' },
          unit: { type: ['string', 'null'] },
          quantity: { type: 'number' },
          unit_cost_php: { type: ['number', 'null'] },
          category: { type: ['string', 'null'] },
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
      `${kindLabel(kind)} stored. AI extraction is not configured on this deployment — ` +
      'set OPENAI_API_KEY in Vercel and re-upload, or add line items manually.',
  }
}

function kindLabel(k: VisualKind): string {
  switch (k) {
    case 'pdf':
      return 'PDF'
    case 'image':
      return 'Image'
    case 'spreadsheet':
      return 'Spreadsheet'
    case 'csv':
      return 'CSV'
    case 'docx':
      return 'Word document'
  }
}

// --- Per-kind content builders ----------------------------------------------

async function buildContentForBinaryInput(
  kind: 'pdf' | 'image',
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ResponseInputContent[]> {
  const base64 = buffer.toString('base64')
  const safeMime = kind === 'pdf' ? 'application/pdf' : mimeType || 'image/png'
  const dataUrl = `data:${safeMime};base64,${base64}`

  if (kind === 'pdf') {
    return [
      {
        type: 'input_text',
        text:
          `Extract scope items from this PDF: ${fileName}. ` +
          'Read every page. Return strict JSON matching the schema.',
      },
      { type: 'input_file', filename: fileName, file_data: dataUrl },
    ]
  }
  return [
    {
      type: 'input_text',
      text:
        `Extract scope items from this image: ${fileName}. ` +
        'Return strict JSON matching the schema.',
    },
    { type: 'input_image', image_url: dataUrl, detail: 'high' },
  ]
}

async function spreadsheetToText(buffer: Buffer): Promise<string> {
  // exceljs has both a CommonJS and an ESM bundle; the dynamic-import works
  // for both since we only need the named Workbook export.
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)

  const parts: string[] = []
  wb.eachSheet((worksheet) => {
    const rows: string[] = []
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      // ExcelJS row.values is 1-indexed with [0] always undefined; slice it off
      const values = (row.values as unknown[]).slice(1)
      for (const v of values) {
        cells.push(stringifyCell(v))
      }
      // Trim trailing empties so columns line up visually
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      if (cells.length > 0) rows.push(cells.join(' | '))
    })
    if (rows.length > 0) {
      parts.push(`## Sheet: ${worksheet.name}\n${rows.join('\n')}`)
    }
  })

  return parts.join('\n\n')
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    // Rich-text / formula / hyperlink cells from ExcelJS
    const v = value as {
      result?: unknown
      text?: string
      richText?: { text: string }[]
      hyperlink?: string
    }
    if (v.result !== undefined) return stringifyCell(v.result)
    if (v.text) return v.text.trim()
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim()
    if (v.hyperlink) return v.hyperlink
  }
  return String(value)
}

async function docxToText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

function csvToText(buffer: Buffer): string {
  // Strip a leading UTF-8 BOM and force-decode as UTF-8.
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text.trim()
}

function clipText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false }
  const head = text.slice(0, Math.floor(MAX_TEXT_CHARS * 0.7))
  const tail = text.slice(text.length - Math.floor(MAX_TEXT_CHARS * 0.25))
  return {
    text: `${head}\n\n…[${text.length - head.length - tail.length} chars omitted]…\n\n${tail}`,
    truncated: true,
  }
}

function buildContentForTextInput(
  kind: 'spreadsheet' | 'csv' | 'docx',
  extractedText: string,
  fileName: string,
  truncated: boolean
): ResponseInputContent[] {
  const header =
    kind === 'spreadsheet'
      ? `Extract scope items from this spreadsheet (${fileName}). Pipe-separated columns; "## Sheet:" marks each tab. Headers may appear anywhere — infer.`
      : kind === 'csv'
        ? `Extract scope items from this CSV (${fileName}). Header row may or may not be present — infer.`
        : `Extract scope items from this Word document (${fileName}). The text is plain extracted prose; tables may appear as wrapped lines.`
  const truncNote = truncated
    ? '\n\n[Note: source was truncated to fit context. Focus on identifiable line items in the visible window.]'
    : ''
  return [
    { type: 'input_text', text: `${header} Return strict JSON matching the schema.${truncNote}` },
    { type: 'input_text', text: extractedText },
  ]
}

// --- Main entry --------------------------------------------------------------

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
      message: `${kindLabel(kind)} stored but could not be re-read for AI extraction.`,
    }
  }

  const sizeLimit = SIZE_BUDGET[kind]
  if (blob.size > sizeLimit) {
    return {
      status: 'too-large',
      scopeItemsCreated: 0,
      warnings: [
        `File ${(blob.size / 1024 / 1024).toFixed(1)} MB exceeds AI extraction limit of ${(sizeLimit / 1024 / 1024).toFixed(0)} MB`,
      ],
      detectedKind: kind,
      bom: null,
      message: `${kindLabel(kind)} stored. Too large for inline AI extraction — split into smaller files or add line items manually.`,
    }
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const warnings: string[] = []
  let userContent: ResponseInputContent[]

  try {
    if (kind === 'pdf' || kind === 'image') {
      userContent = await buildContentForBinaryInput(kind, buffer, fileName, mimeType)
    } else {
      let rawText = ''
      if (kind === 'spreadsheet') rawText = await spreadsheetToText(buffer)
      else if (kind === 'csv') rawText = csvToText(buffer)
      else if (kind === 'docx') rawText = await docxToText(buffer)

      if (!rawText.trim()) {
        return {
          status: 'no-items',
          scopeItemsCreated: 0,
          warnings: [`${kindLabel(kind)} contained no extractable text`],
          detectedKind: kind,
          bom: null,
          message: `${kindLabel(kind)} stored. Could not read any text — try a different export or add line items manually.`,
        }
      }

      const clipped = clipText(rawText)
      if (clipped.truncated) {
        warnings.push(
          `${kindLabel(kind)} was truncated to ${MAX_TEXT_CHARS.toLocaleString()} chars before sending to the model.`
        )
      }
      userContent = buildContentForTextInput(kind, clipped.text, fileName, clipped.truncated)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: 'parse-failed',
      scopeItemsCreated: 0,
      warnings: [`Local parse failed: ${message}`],
      detectedKind: kind,
      bom: null,
      message: `${kindLabel(kind)} stored but the server could not parse it (${message}). Try a different export or add line items manually.`,
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let extracted: ExtractedScopeItem[] = []

  try {
    const response = await openai.responses.create({
      model: VISION_MODEL,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
        },
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
        `${kindLabel(kind)} stored. AI extraction failed — open the file from the documents tab ` +
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
      message: `${kindLabel(kind)} stored. AI did not find scope-like content — try a clearer file or add line items manually.`,
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
    const category = item.category ? String(item.category).trim().slice(0, 60) : ''
    const noteFragment = item.notes ? String(item.notes).trim().slice(0, 300) : ''

    const noteParts = [`auto-extracted (vision/${kind}); document:${documentId}`]
    if (category) noteParts.push(`category:${category}`)
    if (noteFragment) noteParts.push(noteFragment)

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
      notes: noteParts.join('; '),
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

  const categoriesSeen = new Set(
    rows
      .map((r) => {
        const m = r.notes.match(/category:([^;]+)/)
        return m ? m[1]!.trim() : ''
      })
      .filter(Boolean)
  )
  const categoryHint =
    categoriesSeen.size > 0 ? ` (${[...categoriesSeen].slice(0, 4).join(', ')}${categoriesSeen.size > 4 ? '…' : ''})` : ''

  return {
    status: 'extracted',
    scopeItemsCreated: rows.length,
    warnings,
    detectedKind: kind,
    bom,
    message: `Extracted ${rows.length} scope item${rows.length === 1 ? '' : 's'} from ${kindLabel(kind)}${categoryHint}.`,
  }
}
