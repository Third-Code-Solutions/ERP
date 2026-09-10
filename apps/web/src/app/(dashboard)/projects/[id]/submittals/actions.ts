'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  createProjectSubmittalCommandSchema,
  projectSubmittalDecisionCommandSchema,
  projectSubmittalReviewStartCommandSchema,
  projectSubmittalSubmitCommandSchema,
  updateProjectSubmittalCommandSchema,
  projectSubmittalDocumentLinkCommandSchema,
  projectSubmittalDocumentUnlinkCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  createProjectSubmittalThroughCoreApi,
  linkProjectSubmittalDocumentThroughCoreApi,
  mutateProjectSubmittalThroughCoreApi,
  unlinkProjectSubmittalDocumentThroughCoreApi,
} from '@/lib/erp-core-client'

export interface ProjectSubmittalActionState { ok: boolean; error?: string; success?: string }
const uuidSchema = z.string().uuid()
const text = (form: FormData, name: string): string => { const value = form.get(name); return typeof value === 'string' ? value : '' }
const optional = (form: FormData, name: string): string | null => text(form, name).trim() || null
function refresh(projectId: string): void { revalidatePath(`/projects/${projectId}/submittals`); revalidatePath(`/projects/${projectId}`) }

export async function createProjectSubmittal(_previous: ProjectSubmittalActionState, formData: FormData): Promise<ProjectSubmittalActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.submittal.manage')) return { ok: false, error: 'You do not have permission to create submittals.' }
  const command = createProjectSubmittalCommandSchema.safeParse({ projectId: text(formData, 'projectId'), clientRequestId: text(formData, 'clientRequestId'), title: text(formData, 'title'), description: text(formData, 'description'), specSection: text(formData, 'specSection'), discipline: text(formData, 'discipline'), planReference: text(formData, 'planReference'), dueDate: optional(formData, 'dueDate'), assignedTo: optional(formData, 'assignedTo') })
  if (!command.success) return { ok: false, error: command.error.issues[0]?.message ?? 'Invalid submittal.' }
  const result = await createProjectSubmittalThroughCoreApi(command.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Submittal was not created.' }
  if (result.data.projectId !== command.data.projectId || result.data.submittal.projectId !== command.data.projectId) return { ok: false, error: 'ERP Core API returned an invalid submittal scope.' }
  refresh(command.data.projectId)
  return { ok: true, success: result.data.created ? `${result.data.submittal.submittalNumber} created.` : `${result.data.submittal.submittalNumber} was already created by this request.` }
}

export async function updateProjectSubmittal(_previous: ProjectSubmittalActionState, formData: FormData): Promise<ProjectSubmittalActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.submittal.manage')) return { ok: false, error: 'You do not have permission to edit submittals.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId')); const submittalId = uuidSchema.safeParse(text(formData, 'submittalId'))
  const command = updateProjectSubmittalCommandSchema.safeParse({ expectedVersion: Number(text(formData, 'expectedVersion')), title: text(formData, 'title'), description: text(formData, 'description'), specSection: text(formData, 'specSection'), discipline: text(formData, 'discipline'), planReference: text(formData, 'planReference'), dueDate: optional(formData, 'dueDate'), assignedTo: optional(formData, 'assignedTo') })
  if (!projectId.success || !submittalId.success || !command.success) return { ok: false, error: 'Invalid submittal update.' }
  return executeMutation(projectId.data, submittalId.data, 'update', command.data)
}

export async function transitionProjectSubmittal(_previous: ProjectSubmittalActionState, formData: FormData): Promise<ProjectSubmittalActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  const target = z.enum(['submit', 'start-review', 'review']).safeParse(text(formData, 'target'))
  if (!target.success) return { ok: false, error: 'Invalid submittal transition target.' }
  const capability = target.data === 'review' || target.data === 'start-review' ? 'project.submittal.review' : 'project.submittal.manage'
  if (!can(profile.role, capability)) return { ok: false, error: 'You do not have permission for this submittal transition.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId')); const submittalId = uuidSchema.safeParse(text(formData, 'submittalId'))
  if (!projectId.success || !submittalId.success) return { ok: false, error: 'Invalid submittal transition scope.' }
  const expectedVersion = Number(text(formData, 'expectedVersion'))
  const command = target.data === 'submit'
    ? projectSubmittalSubmitCommandSchema.safeParse({ expectedVersion, submissionNotes: text(formData, 'submissionNotes') })
    : target.data === 'start-review'
      ? projectSubmittalReviewStartCommandSchema.safeParse({ expectedVersion })
      : projectSubmittalDecisionCommandSchema.safeParse({ expectedVersion, decision: text(formData, 'decision'), reviewNotes: text(formData, 'reviewNotes'), rejectionReason: text(formData, 'rejectionReason') })
  if (!command.success) return { ok: false, error: command.error.issues[0]?.message ?? 'Invalid submittal transition.' }
  return executeMutation(projectId.data, submittalId.data, target.data, command.data)
}

async function executeMutation(projectId: string, submittalId: string, target: 'update' | 'submit' | 'start-review' | 'review', command: unknown): Promise<ProjectSubmittalActionState> {
  const result = await mutateProjectSubmittalThroughCoreApi(projectId, submittalId, target, command)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Submittal mutation was not committed.' }
  if (result.data.projectId !== projectId || result.data.submittal.projectId !== projectId || result.data.submittal.id !== submittalId) return { ok: false, error: 'ERP Core API returned an invalid submittal scope.' }
  refresh(projectId)
  const status = result.data.submittal.status
  const success = target === 'update' ? result.data.changed ? 'Submittal updated.' : 'No changes to save.' : target === 'submit' ? 'Submittal submitted.' : target === 'start-review' ? 'Submittal is under review.' : status === 'approved' ? 'Submittal approved.' : 'Submittal rejected with a reason.'
  return { ok: true, success }
}

export async function linkProjectSubmittalDocument(_previous: ProjectSubmittalActionState, formData: FormData): Promise<ProjectSubmittalActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.submittal.manage')) return { ok: false, error: 'You do not have permission to link submittal documents.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId'))
  const submittalId = uuidSchema.safeParse(text(formData, 'submittalId'))
  const command = projectSubmittalDocumentLinkCommandSchema.safeParse({ documentId: text(formData, 'documentId'), role: text(formData, 'role'), caption: text(formData, 'caption'), expectedVersion: Number(text(formData, 'expectedVersion')), clientRequestId: text(formData, 'clientRequestId') })
  if (!projectId.success || !submittalId.success || !command.success) return { ok: false, error: 'Invalid submittal document link.' }
  const result = await linkProjectSubmittalDocumentThroughCoreApi(projectId.data, submittalId.data, command.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Document was not linked.' }
  if (result.data.projectId !== projectId.data || result.data.submittalId !== submittalId.data) return { ok: false, error: 'ERP Core API returned an invalid document link scope.' }
  refresh(projectId.data)
  return { ok: true, success: result.data.changed ? 'Document linked to submittal.' : 'Document link already exists for this request.' }
}

export async function unlinkProjectSubmittalDocument(_previous: ProjectSubmittalActionState, formData: FormData): Promise<ProjectSubmittalActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.submittal.manage')) return { ok: false, error: 'You do not have permission to unlink submittal documents.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId'))
  const submittalId = uuidSchema.safeParse(text(formData, 'submittalId'))
  const linkId = uuidSchema.safeParse(text(formData, 'linkId'))
  const command = projectSubmittalDocumentUnlinkCommandSchema.safeParse({ expectedVersion: Number(text(formData, 'expectedVersion')) })
  if (!projectId.success || !submittalId.success || !linkId.success || !command.success) return { ok: false, error: 'Invalid submittal document unlink.' }
  const result = await unlinkProjectSubmittalDocumentThroughCoreApi(projectId.data, submittalId.data, linkId.data, command.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Document link was not removed.' }
  if (result.data.projectId !== projectId.data || result.data.submittalId !== submittalId.data || result.data.linkId !== linkId.data) return { ok: false, error: 'ERP Core API returned an invalid document unlink scope.' }
  refresh(projectId.data)
  return { ok: true, success: result.data.changed ? 'Document unlinked from submittal.' : 'Document link was already removed.' }
}
