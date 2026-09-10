'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  createSiteDiaryCommandSchema,
  submitSiteDiaryCommandSchema,
  updateSiteDiaryCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  createSiteDiaryThroughCoreApi,
  mutateSiteDiaryThroughCoreApi,
} from '@/lib/erp-core-client'

export interface SiteDiaryActionState {
  ok: boolean
  error?: string
  success?: string
}

const uuidSchema = z.string().uuid()

function refresh(projectId: string): void {
  revalidatePath(`/projects/${projectId}/diary`)
  revalidatePath(`/projects/${projectId}`)
}

export async function createSiteDiary(
  _previous: SiteDiaryActionState,
  formData: FormData,
): Promise<SiteDiaryActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.diary.manage')) {
    return { ok: false, error: 'You do not have permission to create site diary entries.' }
  }

  const command = createSiteDiaryCommandSchema.safeParse({
    projectId: formData.get('projectId'),
    clientRequestId: formData.get('clientRequestId'),
    diaryDate: formData.get('diaryDate'),
    weather: formData.get('weather'),
    manpowerCount: Number(formData.get('manpowerCount')),
    workCompleted: formData.get('workCompleted'),
    constraints: formData.get('constraints'),
    safetyNotes: formData.get('safetyNotes'),
  })
  if (!command.success) {
    return {
      ok: false,
      error: command.error.issues[0]?.message ?? 'Invalid site diary entry.',
    }
  }

  const result = await createSiteDiaryThroughCoreApi(command.data)
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? 'Site diary was not created.' }
  }
  if (
    result.data.projectId !== command.data.projectId ||
    result.data.entry.projectId !== command.data.projectId
  ) {
    return { ok: false, error: 'ERP Core API returned an invalid site diary scope.' }
  }
  refresh(command.data.projectId)
  return {
    ok: true,
    success: result.data.created
      ? `Diary for ${result.data.entry.diaryDate} created.`
      : `Diary for ${result.data.entry.diaryDate} was already created by this request.`,
  }
}

export async function updateSiteDiary(
  _previous: SiteDiaryActionState,
  formData: FormData,
): Promise<SiteDiaryActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.diary.manage')) {
    return { ok: false, error: 'You do not have permission to edit site diary entries.' }
  }

  const projectId = uuidSchema.safeParse(formData.get('projectId'))
  const entryId = uuidSchema.safeParse(formData.get('entryId'))
  const command = updateSiteDiaryCommandSchema.safeParse({
    expectedVersion: Number(formData.get('expectedVersion')),
    weather: formData.get('weather'),
    manpowerCount: Number(formData.get('manpowerCount')),
    workCompleted: formData.get('workCompleted'),
    constraints: formData.get('constraints'),
    safetyNotes: formData.get('safetyNotes'),
  })
  if (!projectId.success || !entryId.success || !command.success) {
    return { ok: false, error: 'Invalid site diary update.' }
  }
  const result = await mutateSiteDiaryThroughCoreApi(
    projectId.data,
    entryId.data,
    'update',
    command.data,
  )
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? 'Site diary was not updated.' }
  }
  if (result.data.projectId !== projectId.data || result.data.entry.projectId !== projectId.data || result.data.entry.id !== entryId.data) {
    return { ok: false, error: 'ERP Core API returned an invalid site diary scope.' }
  }
  refresh(projectId.data)
  return { ok: true, success: result.data.changed ? 'Diary updated.' : 'No changes to save.' }
}

export async function submitSiteDiary(
  _previous: SiteDiaryActionState,
  formData: FormData,
): Promise<SiteDiaryActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.diary.manage')) {
    return { ok: false, error: 'You do not have permission to submit site diary entries.' }
  }

  const projectId = uuidSchema.safeParse(formData.get('projectId'))
  const entryId = uuidSchema.safeParse(formData.get('entryId'))
  const command = submitSiteDiaryCommandSchema.safeParse({
    expectedVersion: Number(formData.get('expectedVersion')),
  })
  if (!projectId.success || !entryId.success || !command.success) {
    return { ok: false, error: 'Invalid site diary submit request.' }
  }
  const result = await mutateSiteDiaryThroughCoreApi(
    projectId.data,
    entryId.data,
    'submit',
    command.data,
  )
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? 'Site diary was not submitted.' }
  }
  if (result.data.projectId !== projectId.data || result.data.entry.projectId !== projectId.data || result.data.entry.id !== entryId.data) {
    return { ok: false, error: 'ERP Core API returned an invalid site diary scope.' }
  }
  refresh(projectId.data)
  return { ok: true, success: result.data.changed ? 'Diary submitted.' : 'Diary was already submitted.' }
}
