import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { executeTakeoffImportThroughCoreApi } from '@/lib/erp-core-client'
import { safeActionError } from '@/lib/safe-action-error'
import {
  parseStructuredTakeoff,
  sha256Digest,
  type TakeoffColumnMapping,
} from '@/lib/operations/integrations/takeoff'

const MAX_FILE_BYTES = 25 * 1024 * 1024

const mappingSchema = z.object({
  sourceRowKey: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1),
  quantity: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  division: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  itemNo: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
})

const DEFAULT_MAPPING: TakeoffColumnMapping = {
  sourceRowKey: 'row',
  description: 'description',
  quantity: 'quantity',
  unit: 'uom',
  division: 'division',
  location: 'location',
  itemNo: 'item no',
  notes: 'notes',
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

  let form: FormData
  try {
    form = await req.formData()
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

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsed
  try {
    parsed = await parseStructuredTakeoff(
      buffer,
      file.name,
      parsedMapping.mapping
    )
  } catch (error) {
    console.error('[takeoff-import] parse failed', error)
    return errorResponse(
      422,
      'TAKEOFF_PARSE_FAILED',
      safeActionError(error, 'The takeoff could not be parsed.')
    )
  }

  const mapping = Object.fromEntries(
    Object.entries(parsedMapping.mapping).filter(([, value]) => value !== undefined)
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

  return NextResponse.json(coreResult.data)
}
