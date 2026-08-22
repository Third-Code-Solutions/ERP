import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import type {
  PDFPageProxy,
  TextItem,
  TextMarkedContent,
} from 'pdfjs-dist/types/src/display/api'
import { createWorker } from 'tesseract.js'
import type { CellObject, WorkBook, WorkSheet } from 'xlsx'

export const DETERMINISTIC_EXTRACTOR_VERSION = 'deterministic-intake-v2'

const CACHE_BUCKET = 'documents'
const CACHE_PREFIX = '_derived/deterministic-extractions'
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const MAX_EXTRACTED_CHARACTERS = 250_000
const MAX_PDF_PAGES = 500
const MAX_PDF_PAGE_PIXELS = 8_000_000
const PDF_RENDER_SCALE = 2
const MAX_SPREADSHEET_CELLS = 100_000
const require = createRequire(import.meta.url)

export type DeterministicExtractorKind =
  | 'pdf'
  | 'image'
  | 'spreadsheet'
  | 'csv'
  | 'docx'

export type DeterministicExtractionStatus =
  | 'extracted'
  | 'no-text'
  | 'download-failed'
  | 'too-large'
  | 'ocr-unavailable'
  | 'parse-failed'

export interface DeterministicExtractionInput {
  tenantId: string
  storagePath: string
  fileName: string
  mimeType: string
  kind: DeterministicExtractorKind
}

export interface DeterministicExtractionResult {
  status: DeterministicExtractionStatus
  detectedKind: DeterministicExtractorKind
  sourceSha256: string | null
  extractedText: string
  extractedCharacters: number
  pages: number | null
  sheets: number | null
  ocrConfidence: number | null
  warnings: string[]
  message: string
  cacheHit: boolean
}

interface CachedExtraction {
  extractorVersion: string
  sourceSha256: string
  kind: DeterministicExtractorKind
  result: Omit<DeterministicExtractionResult, 'cacheHit'>
}

interface ParsedContent {
  text: string
  pages: number | null
  sheets: number | null
  ocrConfidence: number | null
  warnings: string[]
  ocrAttempted?: boolean
}

class LocalOcrUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LocalOcrUnavailableError'
  }
}

function kindLabel(kind: DeterministicExtractorKind): string {
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

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function clipText(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\u0000/g, '').trim()
  if (normalized.length <= MAX_EXTRACTED_CHARACTERS) {
    return { text: normalized, truncated: false }
  }

  const headLength = Math.floor(MAX_EXTRACTED_CHARACTERS * 0.75)
  const tailLength = MAX_EXTRACTED_CHARACTERS - headLength
  return {
    text: `${normalized.slice(0, headLength)}\n\n[${normalized.length - headLength - tailLength} characters omitted from cached preview]\n\n${normalized.slice(-tailLength)}`,
    truncated: true,
  }
}

function cachePath(
  tenantId: string,
  sourceSha256: string,
  kind: DeterministicExtractorKind
): string {
  return `${tenantId}/${CACHE_PREFIX}/${sourceSha256}/${kind}/${DETERMINISTIC_EXTRACTOR_VERSION}.json`
}

function isDeterministicKind(value: unknown): value is DeterministicExtractorKind {
  return (
    value === 'pdf' ||
    value === 'image' ||
    value === 'spreadsheet' ||
    value === 'csv' ||
    value === 'docx'
  )
}

function isStatus(value: unknown): value is DeterministicExtractionStatus {
  return (
    value === 'extracted' ||
    value === 'no-text' ||
    value === 'download-failed' ||
    value === 'too-large' ||
    value === 'ocr-unavailable' ||
    value === 'parse-failed'
  )
}

function isNonnegativeIntegerOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function parseCachedExtraction(value: unknown): CachedExtraction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const result = candidate.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const parsed = result as Record<string, unknown>
  const sourceSha256 = candidate.sourceSha256
  const kind = candidate.kind
  const status = parsed.status
  const detectedKind = parsed.detectedKind
  const resultSourceSha256 = parsed.sourceSha256
  const extractedText = parsed.extractedText
  const extractedCharacters = parsed.extractedCharacters
  const pages = parsed.pages
  const sheets = parsed.sheets
  const ocrConfidence = parsed.ocrConfidence
  const warnings = parsed.warnings
  const message = parsed.message

  if (
    candidate.extractorVersion !== DETERMINISTIC_EXTRACTOR_VERSION ||
    typeof sourceSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(sourceSha256) ||
    !isDeterministicKind(kind) ||
    !isStatus(status) ||
    !isDeterministicKind(detectedKind) ||
    (resultSourceSha256 !== null && typeof resultSourceSha256 !== 'string') ||
    typeof extractedText !== 'string' ||
    typeof extractedCharacters !== 'number' ||
    !Number.isInteger(extractedCharacters) ||
    !isNonnegativeIntegerOrNull(pages) ||
    !isNonnegativeIntegerOrNull(sheets) ||
    !isFiniteNumberOrNull(ocrConfidence) ||
    !Array.isArray(warnings) ||
    !warnings.every((warning) => typeof warning === 'string') ||
    typeof message !== 'string'
  ) {
    return null
  }

  return {
    extractorVersion: candidate.extractorVersion,
    sourceSha256,
    kind,
    result: {
      status,
      detectedKind,
      sourceSha256: resultSourceSha256,
      extractedText,
      extractedCharacters,
      pages,
      sheets,
      ocrConfidence,
      warnings,
      message,
    },
  }
}

async function readCachedExtraction(
  storage: ReturnType<typeof createSupabaseAdminClient>['storage'],
  path: string,
  sourceSha256: string,
  kind: DeterministicExtractorKind
): Promise<DeterministicExtractionResult | null> {
  const { data, error } = await storage.from(CACHE_BUCKET).download(path)
  if (error || !data) return null

  try {
    const cached = parseCachedExtraction(JSON.parse(await data.text()))
    if (
      !cached ||
      cached.sourceSha256 !== sourceSha256 ||
      cached.kind !== kind ||
      cached.result.sourceSha256 !== sourceSha256
    ) {
      return null
    }
    return { ...cached.result, cacheHit: true }
  } catch {
    return null
  }
}

async function writeCachedExtraction(
  storage: ReturnType<typeof createSupabaseAdminClient>['storage'],
  path: string,
  sourceSha256: string,
  kind: DeterministicExtractorKind,
  result: DeterministicExtractionResult
): Promise<boolean> {
  const cached: CachedExtraction = {
    extractorVersion: DETERMINISTIC_EXTRACTOR_VERSION,
    sourceSha256,
    kind,
    result: {
      status: result.status,
      detectedKind: result.detectedKind,
      sourceSha256: result.sourceSha256,
      extractedText: result.extractedText,
      extractedCharacters: result.extractedCharacters,
      pages: result.pages,
      sheets: result.sheets,
      ocrConfidence: result.ocrConfidence,
      warnings: result.warnings,
      message: result.message,
    },
  }
  const { error } = await storage
    .from(CACHE_BUCKET)
    .upload(path, Buffer.from(JSON.stringify(cached)), {
      contentType: 'application/json',
      cacheControl: '31536000',
      upsert: false,
    })

  // Another request may have parsed the same content first. Its immutable
  // cache object is equivalent for this version, so a conflict is a success.
  return !error || /already exists|duplicate/i.test(error.message)
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

function spreadsheetCellText(cell: CellObject | undefined): string {
  if (!cell) return ''

  const rendered = typeof cell.w === 'string' ? cell.w.trim() : stringifyCell(cell.v)
  if (typeof cell.f !== 'string' || cell.f.trim() === '') return rendered

  const formula = `=${cell.f}`
  return rendered ? `${rendered} [formula: ${formula}]` : formula
}

function spreadsheetToText(buffer: Buffer): ParsedContent {
  // SheetJS is intentionally loaded through CommonJS. Its maintainers document
  // that this is the complete Node runtime path, including legacy BIFF codepage
  // support; ExcelJS remains elsewhere in the product for workbook generation.
  const XLSX = require('xlsx') as typeof import('xlsx')
  const workbook: WorkBook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: true,
    cellText: true,
    raw: false,
  })
  const parts: string[] = []
  const warnings: string[] = []
  let cellsRead = 0
  let capped = false

  for (const sheetName of workbook.SheetNames) {
    const sheet: WorkSheet | undefined = workbook.Sheets[sheetName]
    const rangeText = sheet?.['!ref']
    if (!sheet || typeof rangeText !== 'string') continue

    const range = XLSX.utils.decode_range(rangeText)
    const rows: string[] = []
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const cells: string[] = []
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        if (cellsRead >= MAX_SPREADSHEET_CELLS) {
          capped = true
          break
        }
        cellsRead += 1
        const cellKey = XLSX.utils.encode_cell({ r: row, c: column })
        cells.push(spreadsheetCellText(sheet[cellKey] as CellObject | undefined))
      }
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      if (cells.length > 0) rows.push(cells.join('\t'))
      if (capped) break
    }
    if (rows.length > 0) parts.push(`## Sheet: ${sheetName}\n${rows.join('\n')}`)
    if (capped) break
  }

  if (capped) {
    warnings.push(
      `Workbook reading stopped after ${MAX_SPREADSHEET_CELLS.toLocaleString()} cells to keep the upload request bounded.`
    )
  }

  return {
    text: parts.join('\n\n'),
    pages: null,
    sheets: workbook.SheetNames.length,
    ocrConfidence: null,
    warnings,
  }
}

export function csvToText(buffer: Buffer): ParsedContent {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  return {
    text: text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
    pages: null,
    sheets: 1,
    ocrConfidence: null,
    warnings: [],
  }
}

async function docxToText(buffer: Buffer): Promise<ParsedContent> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return {
    text: result.value.trim(),
    pages: null,
    sheets: null,
    ocrConfidence: null,
    warnings: result.messages.map((message) => message.message).slice(0, 20),
  }
}

function isPdfTextItem(
  value: TextItem | TextMarkedContent
): value is TextItem {
  return 'str' in value && typeof value.str === 'string'
}

async function pdfToText(buffer: Buffer): Promise<ParsedContent> {
  // Load and register the Node canvas primitives before PDF.js is evaluated.
  // PDF.js captures these globals at module initialization for vector pages.
  let canvasModule: typeof import('@napi-rs/canvas') | null = null
  let canvasLoadError: unknown = null
  try {
    canvasModule = await loadPdfCanvasModule()
  } catch (error) {
    canvasLoadError = error
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: true,
  })
  const document = await loadingTask.promise
  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has more than ${MAX_PDF_PAGES} pages`)
    }

    const pages: Array<string | null> = Array.from(
      { length: document.numPages },
      () => null
    )
    const blankPageNumbers: number[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .filter(isPdfTextItem)
        .map((item) => item.str)
        .join('')
        .trim()
      if (text) pages[pageNumber - 1] = `## Page ${pageNumber}\n${text}`
      else blankPageNumbers.push(pageNumber)
    }

    const warnings: string[] = []
    const ocrConfidence: number[] = []
    if (blankPageNumbers.length > 0) {
      if (!canvasModule) {
        throw canvasLoadError ?? new LocalOcrUnavailableError('Local PDF page renderer is unavailable.')
      }
      const worker = await createLocalOcrWorker()
      try {
        for (const pageNumber of blankPageNumbers) {
          const page = await document.getPage(pageNumber)
          const image = await renderPdfPageToPng(page, canvasModule)
          const ocr = await recognizeImageWithWorker(worker, image)
          if (ocr.text) pages[pageNumber - 1] = `## Page ${pageNumber}\n${ocr.text}`
          else warnings.push(`Page ${pageNumber} contained no readable text after local OCR.`)
          if (ocr.confidence !== null) ocrConfidence.push(ocr.confidence)
        }
      } finally {
        await worker.terminate()
      }
      warnings.unshift(
        `${blankPageNumbers.length} PDF page${blankPageNumbers.length === 1 ? '' : 's'} had no text layer and was read with bundled local OCR.`
      )
    }

    return {
      text: pages.filter((page): page is string => page !== null).join('\n\n'),
      pages: document.numPages,
      sheets: null,
      ocrConfidence:
        ocrConfidence.length === 0
          ? null
          : ocrConfidence.reduce((total, confidence) => total + confidence, 0) /
            ocrConfidence.length,
      warnings,
      ocrAttempted: blankPageNumbers.length > 0,
    }
  } finally {
    await document.destroy()
  }
}

function englishTessdataPath(): string {
  const packageDirectory = dirname(require.resolve('@tesseract.js-data/eng'))
  return join(packageDirectory, '4.0.0_best_int')
}

type LocalOcrWorker = Awaited<ReturnType<typeof createWorker>>

async function createLocalOcrWorker(): Promise<LocalOcrWorker> {
  try {
    return await createWorker('eng', 1, {
      langPath: englishTessdataPath(),
      cacheMethod: 'none',
      gzip: true,
      logger: () => undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new LocalOcrUnavailableError(
      `Bundled local OCR could not start: ${message}`,
      { cause: error }
    )
  }
}

async function recognizeImageWithWorker(
  worker: LocalOcrWorker,
  buffer: Buffer
): Promise<{ text: string; confidence: number | null }> {
  try {
    const result = await worker.recognize(buffer)
    return {
      text: result.data.text.trim(),
      confidence: Number.isFinite(result.data.confidence)
        ? result.data.confidence
        : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new LocalOcrUnavailableError(
      `Bundled local OCR could not read the image: ${message}`,
      { cause: error }
    )
  }
}

async function loadPdfCanvasModule(): Promise<typeof import('@napi-rs/canvas')> {
  try {
    const canvasModule = await import('@napi-rs/canvas')
    const browserGlobals = globalThis as unknown as {
      DOMMatrix?: unknown
      ImageData?: unknown
      Path2D?: unknown
    }

    // PDF.js uses these browser globals when painting vector-only scanned
    // pages. `@napi-rs/canvas` provides compatible server-side versions.
    if (!browserGlobals.DOMMatrix) browserGlobals.DOMMatrix = canvasModule.DOMMatrix
    if (!browserGlobals.ImageData) browserGlobals.ImageData = canvasModule.ImageData
    if (!browserGlobals.Path2D) browserGlobals.Path2D = canvasModule.Path2D
    return canvasModule
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new LocalOcrUnavailableError(
      `Local PDF page renderer is unavailable: ${message}`,
      { cause: error }
    )
  }
}

async function renderPdfPageToPng(
  page: PDFPageProxy,
  canvasModule: typeof import('@napi-rs/canvas')
): Promise<Buffer> {
  const originalViewport = page.getViewport({ scale: PDF_RENDER_SCALE })
  const originalPixels = originalViewport.width * originalViewport.height
  const scale =
    originalPixels > MAX_PDF_PAGE_PIXELS
      ? PDF_RENDER_SCALE * Math.sqrt(MAX_PDF_PAGE_PIXELS / originalPixels)
      : PDF_RENDER_SCALE
  const viewport = page.getViewport({ scale })
  const width = Math.max(1, Math.ceil(viewport.width))
  const height = Math.max(1, Math.ceil(viewport.height))
  const canvas = canvasModule.createCanvas(width, height)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new LocalOcrUnavailableError('Local PDF page renderer returned no 2D context.')
  }

  // PDF.js models DOM canvas types while this server-only Skia adapter exposes
  // the compatible CanvasRenderingContext2D surface required by page.render.
  await page.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise
  return Buffer.from(await canvas.encode('png'))
}

async function imageToText(buffer: Buffer): Promise<ParsedContent> {
  const worker = await createLocalOcrWorker()
  try {
    const ocr = await recognizeImageWithWorker(worker, buffer)
    return {
      text: ocr.text,
      pages: null,
      sheets: null,
      ocrConfidence: ocr.confidence,
      warnings: [],
      ocrAttempted: true,
    }
  } finally {
    await worker.terminate()
  }
}

function buildResult(
  input: DeterministicExtractionInput,
  sourceSha256: string,
  parsed: ParsedContent
): DeterministicExtractionResult {
  const clipped = clipText(parsed.text)
  const warnings = [...parsed.warnings]
  if (clipped.truncated) {
    warnings.push(
      `Extracted text was capped at ${MAX_EXTRACTED_CHARACTERS.toLocaleString()} characters in the cache preview.`
    )
  }

  if (!clipped.text) {
    if (input.kind === 'pdf' && !parsed.ocrAttempted) {
      return {
        status: 'ocr-unavailable',
        detectedKind: input.kind,
        sourceSha256,
        extractedText: '',
        extractedCharacters: 0,
        pages: parsed.pages,
        sheets: parsed.sheets,
        ocrConfidence: null,
        warnings: [
          ...warnings,
          'This PDF has no readable text layer. Local PDF page rendering for scanned-document OCR is not available in this runtime.',
        ],
        message:
          'PDF stored. Its text layer is empty; upload a text-based export or configure the local scanned-PDF renderer.',
        cacheHit: false,
      }
    }
    return {
      status: 'no-text',
      detectedKind: input.kind,
      sourceSha256,
      extractedText: '',
      extractedCharacters: 0,
      pages: parsed.pages,
      sheets: parsed.sheets,
      ocrConfidence: parsed.ocrConfidence,
      warnings: [
        ...warnings,
        input.kind === 'pdf' && parsed.ocrAttempted
          ? 'Bundled local OCR found no readable text in this PDF.'
          : `${kindLabel(input.kind)} contained no readable text.`,
      ],
      message: `${kindLabel(input.kind)} stored. No readable text was found.`,
      cacheHit: false,
    }
  }

  const quantity = `${clipped.text.length.toLocaleString()} character${clipped.text.length === 1 ? '' : 's'}`
  const pages = parsed.pages === null ? '' : ` across ${parsed.pages} page${parsed.pages === 1 ? '' : 's'}`
  const sheets = parsed.sheets === null ? '' : ` across ${parsed.sheets} sheet${parsed.sheets === 1 ? '' : 's'}`
  return {
    status: 'extracted',
    detectedKind: input.kind,
    sourceSha256,
    extractedText: clipped.text,
    extractedCharacters: clipped.text.length,
    pages: parsed.pages,
    sheets: parsed.sheets,
    ocrConfidence: parsed.ocrConfidence,
    warnings,
    message: `${kindLabel(input.kind)} read locally: ${quantity}${pages}${sheets}. Evidence was cached for this tenant; review it before creating a BOM.`,
    cacheHit: false,
  }
}

export async function extractDeterministicDocument(
  input: DeterministicExtractionInput
): Promise<DeterministicExtractionResult> {
  const supabase = createSupabaseAdminClient()
  const storage = supabase.storage
  const { data: blob, error: downloadError } = await storage
    .from(CACHE_BUCKET)
    .download(input.storagePath)
  if (downloadError || !blob) {
    return {
      status: 'download-failed',
      detectedKind: input.kind,
      sourceSha256: null,
      extractedText: '',
      extractedCharacters: 0,
      pages: null,
      sheets: null,
      ocrConfidence: null,
      warnings: [`Storage download failed: ${downloadError?.message ?? 'unknown error'}`],
      message: `${kindLabel(input.kind)} stored but could not be read from private storage.`,
      cacheHit: false,
    }
  }

  if (blob.size > MAX_SOURCE_BYTES) {
    return {
      status: 'too-large',
      detectedKind: input.kind,
      sourceSha256: null,
      extractedText: '',
      extractedCharacters: 0,
      pages: null,
      sheets: null,
      ocrConfidence: null,
      warnings: [
        `File ${(blob.size / 1024 / 1024).toFixed(1)} MB exceeds the ${(
          MAX_SOURCE_BYTES /
          1024 /
          1024
        ).toFixed(0)} MB local parser limit.`,
      ],
      message: `${kindLabel(input.kind)} stored. It exceeds the local parser limit; split it or upload a smaller export.`,
      cacheHit: false,
    }
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const sourceSha256 = sha256(buffer)
  const path = cachePath(input.tenantId, sourceSha256, input.kind)
  const cached = await readCachedExtraction(storage, path, sourceSha256, input.kind)
  if (cached) return cached

  let parsed: ParsedContent
  try {
    switch (input.kind) {
      case 'pdf':
        parsed = await pdfToText(buffer)
        break
      case 'image':
        parsed = await imageToText(buffer)
        break
      case 'spreadsheet':
        parsed = spreadsheetToText(buffer)
        break
      case 'csv':
        parsed = csvToText(buffer)
        break
      case 'docx':
        parsed = await docxToText(buffer)
        break
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const ocrUnavailable =
      (input.kind === 'image' || input.kind === 'pdf') &&
      (error instanceof LocalOcrUnavailableError ||
        /tesseract|traineddata|wasm|worker|langPath|canvas|renderer/i.test(
          message
        ))
    const result: DeterministicExtractionResult = {
      status: ocrUnavailable ? 'ocr-unavailable' : 'parse-failed',
      detectedKind: input.kind,
      sourceSha256,
      extractedText: '',
      extractedCharacters: 0,
      pages: null,
      sheets: null,
      ocrConfidence: null,
      warnings: [`Local parser failed: ${message}`],
      message: ocrUnavailable
        ? `${kindLabel(input.kind)} stored. The bundled local OCR runtime is unavailable; no remote fallback was used.`
        : `${kindLabel(input.kind)} stored but the local parser could not read it. Try a fresh export.`,
      cacheHit: false,
    }
    const cachedWrite = await writeCachedExtraction(
      storage,
      path,
      sourceSha256,
      input.kind,
      result
    )
    return cachedWrite
      ? result
      : {
          ...result,
          warnings: [...result.warnings, 'Extraction result was not cached.'],
        }
  }

  const result = buildResult(input, sourceSha256, parsed)
  const cachedWrite = await writeCachedExtraction(
    storage,
    path,
    sourceSha256,
    input.kind,
    result
  )
  return cachedWrite
    ? result
    : {
        ...result,
        warnings: [...result.warnings, 'Extraction result was not cached.'],
      }
}
