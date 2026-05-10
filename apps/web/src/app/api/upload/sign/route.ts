import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@buildops/auth'
import { createSupabaseAdminClient } from '@buildops/auth/server'
import { db } from '@buildops/database'
import { users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'

const SignSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { projectId, fileName } = parsed.data

  // Sanitize filename (storage path is server-controlled to prevent traversal)
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  const storagePath = `${userRow.tenant_id}/${projectId}/${crypto.randomUUID()}-${safeName}`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    return NextResponse.json(
      { error: `Failed to create signed upload URL: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path,
    originalFileName: fileName,
  })
}
