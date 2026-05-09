import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@buildops/auth'
import { createSupabaseAdminClient } from '@buildops/auth/server'
import { db } from '@buildops/database'
import { documents, users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'
import { inngest } from '@/lib/inngest'

const ALLOWED_MIME_TYPES = new Set([
  'image/vnd.dxf',
  'application/dxf',
  'application/octet-stream', // DXF files often come as this
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB

type DocumentType = 'dxf' | 'pdf' | 'image' | 'contract' | 'bom' | 'invoice' | 'po' | 'other'

function inferDocumentType(fileName: string, mimeType: string): DocumentType {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'dxf') return 'dxf'
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

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

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const projectId = formData.get('project_id')
  const description = formData.get('description')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (typeof projectId !== 'string' || !projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 413 })
  }

  const mimeType = file.type || 'application/octet-stream'
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const docType = inferDocumentType(fileName, mimeType)
  const storagePath = `${userRow.tenant_id}/${projectId}/${crypto.randomUUID()}-${fileName}`

  // Upload to Supabase Storage
  const supabase = createSupabaseAdminClient()
  const bytes = await file.arrayBuffer()

  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    })

  if (storageError) {
    return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 })
  }

  // Insert document row
  const [doc] = await db
    .insert(documents)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      uploaded_by: user.id,
      document_type: docType,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: file.size,
      description: typeof description === 'string' && description ? description : null,
    })
    .returning({ id: documents.id })

  // Emit Inngest event for DXF files so the parser picks it up
  if (docType === 'dxf') {
    await inngest.send({
      name: 'document/dxf.uploaded',
      data: {
        documentId: doc!.id,
        projectId,
        tenantId: userRow.tenant_id,
        storagePath,
      },
    })
  }

  return NextResponse.json({ id: doc!.id, storagePath, documentType: docType })
}
