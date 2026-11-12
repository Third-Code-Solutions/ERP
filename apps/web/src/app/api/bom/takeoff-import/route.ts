import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { TAKEOFF_IMPORT_MAX_ROWS } from '@third-code-erp/shared-types'
import { executeTakeoffImportThroughCoreApi } from '@/lib/erp-core-client'
import { safeActionError } from '@/lib/safe-action-error'
import {
  parseStructuredTakeoff,
  sha256Digest,
  TAKEOFF_MAX_HEADER_ROW,
  TAKEOFF_TOO_MANY_ROWS_MESSAGE,
  TakeoffBusyError,
  TakeoffTooLargeError,
  type TakeoffColumnMapping,
} from '@/lib/operations/integrations/takeoff'

const MAX_FILE_BYTES = 25 * 1024 * 1024
// Room for the multipart boundaries and the small text fields beside the file.
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024

// An optional column sent blank means the user turned it off (no alias fallback).
const optionalColumn = z.string().trim().optional()

const mappingSchema = z.object({
  sourceRowKey: optionalColumn,
  description: z.string().trim().min(1),
  quantity: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  division: optionalColumn,
  location: optionalColumn,
  itemNo: optionalColumn,
  code: optionalColumn,
  notes: optionalColumn,
  unitRate: optionalColumn,
  amount: optionalColumn,
})

const headerRowSchema = z.coerce.number().int().min(1).max(TAKEOFF_MAX_HEADER_ROW)

const DEFAULT_MAPPING: TakeoffColumnMapping = {
  sourceRowKey: 'row',
  description: 'description',
  quantity: 'quantity',
  unit: 'uom',
  division: 'division',
  location: 'location',
  itemNo: 'item no',
  code: 'code',
  notes: 'notes',
  unitRate: 'unit rate',
  amount: 'amount',
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status }
  )
}

function getFormString(form: FormData, key: string): string | null {
  const value = form.get(key)
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function parseMapping(
  value: string | null
): { mapping: TakeoffColumnMapping } | { error: string } {
  if (!value) return { mapping: DEFAULT_MAPPING }
  let candidate: unknown
  try {
    candidate = JSON.parse(value)
  } catch {
    return { error: 'mapping must be valid JSON' }
  }
  const parsed = mappingSchema.safeParse(candidate)
  return parsed.success
    ? { mapping: parsed.data }
    : { error: 'mapping is invalid' }
}

/** The request body, or null once it is longer than the limit (the rest is not read). */
async function readBodyWithin(req: NextRequest, limit: number): Promise<ArrayBuffer | null> {
  const reader = req.body?.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = reader ? await reader.read() : { done: true, value: undefined }
    if (done || !value) break
    total += value.byteLength
    if (total > limit) {
      await reader?.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}

function coreErrorCode(status: number): string {
  if (status === 400) return 'INVALID_TAKEOFF_COMMAND'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'BOM_NOT_FOUND'
  if (status === 409) return 'BOM_IMMUTABLE'
  if (status === 413) return 'TAKEOFF_TOO_LARGE'
  if (status === 422) return 'MISSING_COLUMNS'
  if (status === 502) return 'TAKEOFF_CORE_INVALID_RESPONSE'
  return 'TAKEOFF_CORE_UNAVAILABLE'
}

/**
 * Web owns multipart parsing only. ERP Core validates the current actor and
 * BOM state, computes preview findings, and commits all takeoff/BOM/audit data
 * atomically; this route never falls back to a Web database transaction.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try {
    profile = await requireUserProfile()
  } catch {
    return errorResponse(401, 'UNAUTHENTICATED', 'Authentication is required.')
  }

  if (!can(profile.role, 'bom.generate')) {
    return errorResponse(
      403,
      'FORBIDDEN',
      `Role "${profile.role}" cannot import takeoffs.`
    )
  }

  // Refuse a declared oversize body before reading it, and count the bytes of
  // one that declares nothing (a chunked upload) instead of buffering it whole:
  // off Vercel no platform limit stands in front of this route.
  const tooLarge = () =>
    errorResponse(413, 'FILE_TOO_LARGE', `file must be <= ${MAX_FILE_BYTES} bytes.`)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge()
  const body = await readBodyWithin(req, MAX_BODY_BYTES)
  if (!body) return tooLarge()

  let form: FormData
  try {
    form = await new Response(body, {
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
    }).formData()
  } catch {
    return errorResponse(
      400,
      'INVALID_MULTIPART',
      'Expected multipart/form-data body.'
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return errorResponse(400, 'FILE_REQUIRED', 'file is required.')
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(
      413,
      'FILE_TOO_LARGE',
      `file must be <= ${MAX_FILE_BYTES} bytes.`
    )
  }

  const bomId = getFormString(form, 'bom_id')
  if (!bomId || !z.string().uuid().safeParse(bomId).success) {
    return errorResponse(422, 'INVALID_BOM_ID', 'bom_id must be a UUID.')
  }

  const source = (getFormString(form, 'source') ?? 'generic').toLowerCase()
  const drawingRevisionKey =
    getFormString(form, 'drawing_revision_key') ?? file.name
  const mode = getFormString(form, 'mode') ?? 'preview'
  if (mode !== 'preview' && mode !== 'commit') {
    return errorResponse(422, 'INVALID_MODE', 'mode must be preview or commit.')
  }

  const parsedMapping = parseMapping(getFormString(form, 'mapping'))
  if ('error' in parsedMapping) {
    return errorResponse(422, 'INVALID_MAPPING', parsedMapping.error)
  }

  const headerRowText = getFormString(form, 'header_row')
  const headerRow = headerRowText ? headerRowSchema.safeParse(headerRowText) : null
  if (headerRow && !headerRow.success) {
    return errorResponse(
      422,
      'INVALID_HEADER_ROW',
      `header_row must be a whole number from 1 to ${TAKEOFF_MAX_HEADER_ROW}.`
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsed
  try {
    parsed = await parseStructuredTakeoff(
      buffer,
      file.name,
      parsedMapping.mapping,
      {
        sheet: getFormString(form, 'sheet') ?? undefined,
        headerRow: headerRow?.data,
        sectionHeaders: getFormString(form, 'section_headers') !== 'off',
      }
    )
  } catch (error) {
    if (error instanceof TakeoffTooLargeError) {
      return errorResponse(413, 'TAKEOFF_TOO_LARGE', error.message)
    }
    if (error instanceof TakeoffBusyError) {
      const response = errorResponse(503, 'TAKEOFF_BUSY', error.message)
      response.headers.set('Retry-After', '10')
      return response
    }
    console.error('[takeoff-import] parse failed', error)
    return errorResponse(
      422,
      'TAKEOFF_PARSE_FAILED',
      safeActionError(error, 'The takeoff could not be parsed.')
    )
  }

  if (parsed.rows.length > TAKEOFF_IMPORT_MAX_ROWS) {
    return errorResponse(413, 'TAKEOFF_TOO_LARGE', TAKEOFF_TOO_MANY_ROWS_MESSAGE)
  }

  const mapping = Object.fromEntries(
    Object.entries(parsedMapping.mapping).filter(([, value]) => value)
  ) as Record<string, string>
  const coreResult = await executeTakeoffImportThroughCoreApi(
    {
      mode,
      target: 'existing_bom',
      bomId,
      source,
      drawingRevisionKey,
      fileName: file.name,
      contentSha256: sha256Digest(buffer),
      mapping,
      missingColumns: parsed.missingColumns,
      rows: parsed.rows,
    },
    profile.tenantId
  )
  if (!coreResult.ok || !coreResult.data) {
    const status = coreResult.status ?? 503
    return errorResponse(
      status,
      coreErrorCode(status),
      coreResult.error ?? 'Takeoff import was not completed.'
    )
  }

  // Spreadsheet facts only Web knows (sheets, skipped rows, amount checks)
  // ride along with Core's preview; Core never sees or trusts them.
  return NextResponse.json({
    ...coreResult.data,
    headerRow: parsed.headerRow,
    skippedRows: parsed.skippedRows,
    skippedAmountRows: parsed.skippedAmountRows,
    sectionRows: parsed.sectionRows,
    warnings: parsed.warnings,
    ...(parsed.workbook ? { workbook: parsed.workbook } : {}),
  })
}
