// Issues a short-lived Supabase signed URL for a stored document and 302s to
// it. Auth + tenant scoping happen here so the underlying object can stay
// private; the signed URL is the only thing the browser ever sees.
//
//   GET /api/documents/<uuid>             → opens inline (image/pdf preview)
//   GET /api/documents/<uuid>?download=1  → forces "Save As" with original name
//
// The signed URL TTL is intentionally short — long enough for the browser to
// follow the redirect and start fetching, short enough that a leaked URL is
// useless within minutes.

import { NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { safeActionError } from '@/lib/safe-action-error'

const SIGNED_URL_TTL_SECONDS = 60 * 5 // 5 minutes

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await ctx.params

  // Basic shape guard so a malformed path doesn't reach the DB.
  if (!/^[0-9a-fA-F-]{36}$/.test(documentId)) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 })
  }

  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.tenantId) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
  }

  const [doc] = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      storage_path: documents.storage_path,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenant_id, profile.tenantId)
      )
    )

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1'

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(
      doc.storage_path,
      SIGNED_URL_TTL_SECONDS,
      // Passing `download: <fileName>` adds a Content-Disposition: attachment
      // response header pointing at the original filename. Omitting it returns
      // the file inline so browsers preview images / PDFs in a new tab.
      wantsDownload ? { download: doc.file_name } : undefined
    )

  if (error || !data?.signedUrl) {
    console.error('[documents] signed URL creation failed', error)
    return NextResponse.json(
      { error: safeActionError(error, 'Failed to open document.') },
      { status: 500 }
    )
  }

  return NextResponse.redirect(data.signedUrl, { status: 302 })
}
