'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { createSupabaseAdminClient } from '@buildops/auth/server'
import { db } from '@buildops/database'
import { documents, users } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'

export interface DeleteResult {
  ok: boolean
  error?: string
}

export async function deleteDocument(formData: FormData): Promise<DeleteResult> {
  const documentId = formData.get('document_id')
  const projectId = formData.get('project_id')

  if (typeof documentId !== 'string' || !documentId) {
    return { ok: false, error: 'Missing document_id' }
  }
  if (typeof projectId !== 'string' || !projectId) {
    return { ok: false, error: 'Missing project_id' }
  }

  const user = await getUser()
  if (!user) return { ok: false, error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { ok: false, error: 'No tenant' }

  // Load doc, verify it belongs to the caller's tenant
  const [doc] = await db
    .select({
      id: documents.id,
      storage_path: documents.storage_path,
      tenant_id: documents.tenant_id,
      project_id: documents.project_id,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenant_id, userRow.tenant_id)))

  if (!doc) return { ok: false, error: 'Document not found' }

  // Best-effort storage cleanup. If the object is already gone we still want
  // to drop the DB row so the UI clears.
  try {
    const supabase = createSupabaseAdminClient()
    const { error: storageErr } = await supabase.storage
      .from('documents')
      .remove([doc.storage_path])
    if (storageErr) {
      console.warn('[documents/delete] storage remove warning:', storageErr.message)
    }
  } catch (err) {
    console.warn('[documents/delete] storage remove failed:', err)
  }

  await db.delete(documents).where(eq(documents.id, doc.id))

  revalidatePath(`/projects/${projectId}/documents`)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}
