import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { getProjectDetailAccess } from '@/app/(dashboard)/projects/[id]/project-detail-access'
import { boqExportFileName, buildBoqWorkbook } from '@/lib/operations/boq-excel/workbook'
import { loadBoqExport } from './bom-export-data'

export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: RESPONSE_HEADERS })
}

/** BOQ workbook for one BOM, for anyone allowed to view that BOM page. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let profile: Awaited<ReturnType<typeof getUserProfile>>
  try {
    profile = await getUserProfile()
  } catch {
    return jsonError('Export unavailable', 500)
  }

  if (!profile) return jsonError('Unauthorized', 401)
  if (!getProjectDetailAccess(profile.role).bom) return jsonError('Forbidden', 403)

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return jsonError('Not found', 404)

  let data: Awaited<ReturnType<typeof loadBoqExport>>
  try {
    data = await loadBoqExport(profile.tenantId, id)
  } catch {
    return jsonError('Export unavailable', 500)
  }
  if (!data) return jsonError('Not found', 404)

  const exportedAt = new Date()
  const buffer = await buildBoqWorkbook(data, exportedAt).xlsx.writeBuffer()
  return new Response(buffer, {
    status: 200,
    headers: {
      ...RESPONSE_HEADERS,
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${boqExportFileName(data, exportedAt)}"`,
    },
  })
}
