// Scope extraction for non-CAD source documents (PDF, image, spreadsheet,
// CSV, Word). This module is deliberately evidence-only: it may read the
// already-recorded private object and ask the model for candidate scope, but
// ERP Core is the sole authority that persists the resulting BOM/import/audit
// transaction. The model is never asked to price work.

import { createHash } from 'node:crypto'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { executeTakeoffImportThroughCoreApi } from '@/lib/erp-core-client'
import OpenAI from 'openai'
import type { ResponseInputContent } from 'openai/resources/responses/responses'

const VISION_MODEL = 'gpt-4o-mini'

// Per-format upload budgets. The model receives the content inline, so keep
// files comfortably below provider transport limits and serverless budgets.
const SIZE_BUDGET: Record<VisualKind, number> = {
  pdf: 25 * 1024 * 1024,
  image: 18 * 1024 * 1024,
  spreadsheet: 25 * 1024 * 1024,
  csv: 25 * 1024 * 1024,
  docx: 25 * 1024 * 1024,
}

const MAX_OUTPUT_TOKENS = 4096
const MAX_TEXT_CHARS = 120_000

export type VisualKind = 'pdf' | 'image' | 'spreadsheet' | 'csv' | 'docx'

export type VisualExtractStatus =
  | 'extracted'
  | 'no-items'
  | 'download-failed'
  | 'ai-not-configured'
  | 'too-large'
  | 'parse-failed'
  | 'core-unavailable'
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

interface VisualCandidateBom {
  bomId: string
  totalCostCents: 0
  totalTcvCents: 0
  gpMarginBps: 0
  ragMatches: 0
  aiEstimateMatches: 0
  unpriced: number
}

export interface VisualExtractResult {
  status: VisualExtractStatus
  // Kept for the legacy upload response shape. These are Core-committed BOM
  // candidate rows, not direct Web scope_items writes.
  scopeItemsCreated: number
  warnings: string[]
  detectedKind: VisualKind
  bom: VisualCandidateBom | null
  message: string
}

interface ExtractedScopeItem {
  code: string | null
  description: string
  unit: string | null
  quantity: number | null
  category: string | null
  notes: string | null
}

const SYSTEM_PROMPT = `You extract unpriced construction scope candidates from a source document.

Return only candidates supported by visible labels, schedules, quantities, dimensions, or other source evidence. Do not invent a standard room package, hidden specification, quantity, unit, rate, price, cost, markup, or commercial assumption. When a unit or quantity is not clearly supported, return null for that field and explain the uncertainty briefly in notes.

For each supported candidate return:
- code: source item code or null.
- description: concise source-grounded work/item description.
- quantity: numeric source-grounded quantity or null.
- unit: source-grounded unit or null.
- category: a high-level discipline label or null.
- notes: source location or uncertainty note, or null.

This is a review queue, not an estimate. Do not output price or rate fields. Output strict JSON matching the schema; never wrap it in markdown.`

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
        required: ['code', 'description', 'unit', 'quantity', 'category', 'notes'],
        properties: {
          code: { type: ['string', 'null'] },
          description: { type: 'string' },
          unit: { type: ['string', 'null'] },
          quantity: { type: ['number', 'null'] },
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

function kindLabel(kind: VisualKind): string {
  switch (kind) {
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

function truncate(value: string, maximum: number): string {
  return value.trim().slice(0, maximum)
}

function optionalString(value: string | null, maximum: number): string | null {
  if (!value) return null
  const trimmed = truncate(value, maximum)
  return trimmed.length > 0 ? trimmed : null
}

function contentSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function toTakeoffRows(items: ReadonlyArray<ExtractedScopeItem>) {
  return items.map((item, index) => {
    const code = optionalString(item.code, 255)
    const description = truncate(item.description, 4_000)
    const unit = optionalString(item.unit, 64) ?? ''
    const notes = optionalString(item.notes, 1_000)
    const category = optionalString(item.category, 1_000)
    const quantity =
      typeof item.quantity === 'number' &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0
        ? item.quantity
        : null

    return {
      sourceRowKey: `vision-${code ?? 'row'}-${index + 1}`.slice(0, 255),
      description,
      quantity,
      unit,
      division: null,
      location: null,
      itemNo: code,
      notes,
      raw: {
        code,
        description: truncate(item.description, 1_000),
        quantity,
        unit: optionalString(item.unit, 1_000),
        category,
        notes,
      },
    }
  })
}

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
          `Extract source-grounded scope candidates from this PDF: ${fileName}. ` +
          'Return strict JSON matching the schema.',
      },
      { type: 'input_file', filename: fileName, file_data: dataUrl },
    ]
  }
  return [
    {
      type: 'input_text',
      text:
        `Extract source-grounded scope candidates from this image: ${fileName}. ` +
        'Return strict JSON matching the schema.',
    },
    { type: 'input_image', image_url: dataUrl, detail: 'high' },
  ]
}

async function spreadsheetToText(buffer: Buffer): Promise<string> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const parts: string[] = []
  workbook.eachSheet((worksheet) => {
    const rows: string[] = []
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      const values = (row.values as unknown[]).slice(1)
      for (const value of values) cells.push(stringifyCell(value))
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
    const candidate = value as {
      result?: unknown
      text?: string
      richText?: { text: string }[]
      hyperlink?: string
    }
    if (candidate.result !== undefined) return stringifyCell(candidate.result)
    if (candidate.text) return candidate.text.trim()
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text).join('').trim()
    }
    if (candidate.hyperlink) return candidate.hyperlink
  }
  return String(value)
}

async function docxToText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

function csvToText(buffer: Buffer): string {
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
  const sourceDescription =
    kind === 'spreadsheet'
      ? `this spreadsheet (${fileName}); pipe-separated columns and "## Sheet:" labels identify sheets`
      : kind === 'csv'
        ? `this CSV (${fileName})`
        : `this Word document (${fileName})`
  const truncationNote = truncated
    ? '\n\n[The source was truncated to fit context. Only use visible evidence.]'
    : ''
  return [
    {
      type: 'input_text',
      text:
        `Extract source-grounded scope candidates from ${sourceDescription}. ` +
        `Return strict JSON matching the schema.${truncationNote}`,
    },
    { type: 'input_text', text: extractedText },
  ]
}

export async function extractScopeFromVisual(
  input: VisualExtractInput
): Promise<VisualExtractResult> {
  const { tenantId, projectId, documentId, storagePath, fileName, mimeType, kind } = input

  if (!process.env.OPENAI_API_KEY) return notConfigured(kind)

  const supabase = createSupabaseAdminClient()
  const { data: blob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(storagePath)

  if (downloadError || !blob) {
    return {
      status: 'download-failed',
      scopeItemsCreated: 0,
      warnings: [`Storage download failed: ${downloadError?.message ?? 'unknown error'}`],
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
      message: `${kindLabel(kind)} stored. Too large for inline AI extraction — split it or add line items manually.`,
    }
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const warnings: string[] = []
  let userContent: ResponseInputContent[]

  try {
    if (kind === 'pdf' || kind === 'image') {
      userContent = await buildContentForBinaryInput(kind, buffer, fileName, mimeType)
    } else {
      const rawText =
        kind === 'spreadsheet'
          ? await spreadsheetToText(buffer)
          : kind === 'csv'
            ? csvToText(buffer)
            : await docxToText(buffer)
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
          `${kindLabel(kind)} was truncated to ${MAX_TEXT_CHARS.toLocaleString()} chars before model extraction.`
        )
      }
      userContent = buildContentForTextInput(kind, clipped.text, fileName, clipped.truncated)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'scope_candidate_extraction',
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
      } catch (error) {
        warnings.push(
          `AI returned unparseable JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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

  if (extracted.length === 0) {
    return {
      status: 'no-items',
      scopeItemsCreated: 0,
      warnings,
      detectedKind: kind,
      bom: null,
      message: `${kindLabel(kind)} stored. AI did not find source-grounded scope candidates — add line items manually.`,
    }
  }

  const rows = toTakeoffRows(extracted)
  const categories = new Set(
    extracted
      .map((item) => optionalString(item.category, 120))
      .filter((category): category is string => category !== null)
  )
  const coreResult = await executeTakeoffImportThroughCoreApi(
    {
      mode: 'commit',
      target: 'ai_document',
      projectId,
      documentId,
      sourceModel: VISION_MODEL,
      source: 'ai-document',
      drawingRevisionKey: `document:${documentId}`,
      fileName,
      contentSha256: contentSha256(buffer),
      mapping: {
        sourceRowKey: 'vision.code + row index',
        description: 'model.description',
        quantity: 'model.quantity',
        unit: 'model.unit',
        division: 'manual assignment required',
        notes: 'model.notes',
      },
      missingColumns: [],
      rows,
    },
    tenantId
  )

  if (!coreResult.ok || !coreResult.data || coreResult.data.mode !== 'commit') {
    return {
      status: 'core-unavailable',
      scopeItemsCreated: 0,
      warnings: [
        ...warnings,
        coreResult.error ?? 'ERP Core did not accept the AI scope candidates.',
      ],
      detectedKind: kind,
      bom: null,
      message:
        `${kindLabel(kind)} stored. AI scope candidates were not committed because ERP Core was unavailable or rejected the evidence.`,
    }
  }

  warnings.push(
    `AI-derived scope candidates are unpriced. Resolve ${coreResult.data.unresolvedCount} review queue item${coreResult.data.unresolvedCount === 1 ? '' : 's'} and attach a DUPA before approval.`
  )
  const categoryHint =
    categories.size > 0
      ? ` (${[...categories].slice(0, 4).join(', ')}${categories.size > 4 ? '…' : ''})`
      : ''

  return {
    status: 'extracted',
    scopeItemsCreated: coreResult.data.linesUpserted,
    warnings,
    detectedKind: kind,
    bom: {
      bomId: coreResult.data.bomId,
      totalCostCents: 0,
      totalTcvCents: 0,
      gpMarginBps: 0,
      ragMatches: 0,
      aiEstimateMatches: 0,
      unpriced: coreResult.data.linesUpserted,
    },
    message:
      `Created an unpriced candidate BOM with ${coreResult.data.linesUpserted} AI-extracted scope item${coreResult.data.linesUpserted === 1 ? '' : 's'} from ${kindLabel(kind)}${categoryHint}. ` +
      'Resolve the review queue and attach a DUPA before approval.',
  }
}
