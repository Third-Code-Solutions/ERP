'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  createProjectScheduleTaskCommandSchema,
  importLegacyProjectScheduleCommandSchema,
  type LegacyProjectSchedulePreview,
  projectScheduleTaskStatusCommandSchema,
  updateProjectScheduleTaskCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  createProjectScheduleTaskThroughCoreApi,
  previewLegacyProjectScheduleThroughCoreApi,
  importLegacyProjectScheduleThroughCoreApi,
  mutateProjectScheduleTaskThroughCoreApi,
} from '@/lib/erp-core-client'

export interface ProjectScheduleActionState { ok: boolean; error?: string; success?: string }
export interface LegacyScheduleActionState extends ProjectScheduleActionState { preview?: LegacyProjectSchedulePreview }

export async function previewLegacySchedule(_previous: LegacyScheduleActionState, form: FormData): Promise<LegacyScheduleActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.schedule.manage')) return { ok: false, error: 'You do not have permission to import schedules.' }
  const projectId = z.string().uuid().safeParse(form.get('projectId'))
  if (!projectId.success) return { ok: false, error: 'Invalid project identifier.' }
  const result = await previewLegacyProjectScheduleThroughCoreApi(projectId.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Preview unavailable.' }
  if (result.data.projectId !== projectId.data) return { ok: false, error: 'Invalid preview scope.' }
  return { ok: true, preview: result.data }
}

export async function importLegacySchedule(_previous: ProjectScheduleActionState, form: FormData): Promise<ProjectScheduleActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.schedule.manage')) return { ok: false, error: 'You do not have permission to import schedules.' }
  const projectId = z.string().uuid().safeParse(form.get('projectId'))
  const command = importLegacyProjectScheduleCommandSchema.safeParse({ sourceScheduleId: form.get('sourceScheduleId'), sourceHash: form.get('sourceHash') })
  if (!projectId.success || !command.success) return { ok: false, error: 'Preview the stored schedule before importing.' }
  const result = await importLegacyProjectScheduleThroughCoreApi(projectId.data, command.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Import failed.' }
  if (result.data.projectId !== projectId.data || result.data.sourceScheduleId !== command.data.sourceScheduleId || result.data.rows.some((row) => row.projectId !== projectId.data || row.source !== 'legacy_l1')) return { ok: false, error: 'Invalid import scope.' }
  refresh(projectId.data)
  return { ok: true, success: result.data.created ? `${result.data.rows.length} L1 tasks imported.` : 'This schedule was already imported. Existing task edits were preserved.' }
}
const uuidSchema = z.string().uuid()
const text = (form: FormData, name: string): string => { const value = form.get(name); return typeof value === 'string' ? value : '' }
const optional = (form: FormData, name: string): string | null => text(form, name).trim() || null
function refresh(projectId: string): void { revalidatePath(`/projects/${projectId}/schedule`); revalidatePath(`/projects/${projectId}/progress`); revalidatePath(`/projects/${projectId}`) }

export async function createProjectScheduleTask(_previous: ProjectScheduleActionState, formData: FormData): Promise<ProjectScheduleActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.schedule.manage')) return { ok: false, error: 'You do not have permission to manage schedules.' }
  const command = createProjectScheduleTaskCommandSchema.safeParse({ projectId: text(formData, 'projectId'), clientRequestId: text(formData, 'clientRequestId'), level: text(formData, 'level'), taskCode: text(formData, 'taskCode'), name: text(formData, 'name'), description: text(formData, 'description'), parentTaskId: optional(formData, 'parentTaskId'), predecessorTaskId: optional(formData, 'predecessorTaskId'), plannedStart: text(formData, 'plannedStart'), plannedFinish: text(formData, 'plannedFinish'), plannedLaborMinutes: Number(text(formData, 'plannedLaborMinutes')), ownerId: optional(formData, 'ownerId'), commitmentWeek: optional(formData, 'commitmentWeek'), commitmentStatus: text(formData, 'commitmentStatus') || 'not_set', constraintReason: text(formData, 'constraintReason') })
  if (!command.success) return { ok: false, error: command.error.issues[0]?.message ?? 'Invalid schedule task.' }
  const result = await createProjectScheduleTaskThroughCoreApi(command.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Schedule task was not created.' }
  if (result.data.projectId !== command.data.projectId || result.data.task.projectId !== command.data.projectId) return { ok: false, error: 'ERP Core API returned an invalid schedule scope.' }
  refresh(command.data.projectId)
  return { ok: true, success: result.data.created ? `${result.data.task.taskCode} created.` : `${result.data.task.taskCode} already exists for this request.` }
}

export async function updateProjectScheduleTask(_previous: ProjectScheduleActionState, formData: FormData): Promise<ProjectScheduleActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.schedule.manage')) return { ok: false, error: 'You do not have permission to edit schedules.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId')); const taskId = uuidSchema.safeParse(text(formData, 'taskId'))
  const command = updateProjectScheduleTaskCommandSchema.safeParse({ expectedVersion: Number(text(formData, 'expectedVersion')), level: text(formData, 'level'), taskCode: text(formData, 'taskCode'), name: text(formData, 'name'), description: text(formData, 'description'), parentTaskId: optional(formData, 'parentTaskId'), predecessorTaskId: optional(formData, 'predecessorTaskId'), plannedStart: text(formData, 'plannedStart'), plannedFinish: text(formData, 'plannedFinish'), plannedLaborMinutes: Number(text(formData, 'plannedLaborMinutes')), ownerId: optional(formData, 'ownerId'), commitmentWeek: optional(formData, 'commitmentWeek'), commitmentStatus: text(formData, 'commitmentStatus') || 'not_set', constraintReason: text(formData, 'constraintReason') })
  if (!projectId.success || !taskId.success || !command.success) return { ok: false, error: command.success ? 'Invalid schedule scope.' : command.error.issues[0]?.message ?? 'Invalid schedule update.' }
  return executeMutation(projectId.data, taskId.data, 'update', command.data)
}

export async function updateProjectScheduleTaskStatus(_previous: ProjectScheduleActionState, formData: FormData): Promise<ProjectScheduleActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.schedule.manage')) return { ok: false, error: 'You do not have permission to update schedule status.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId')); const taskId = uuidSchema.safeParse(text(formData, 'taskId'))
  const command = projectScheduleTaskStatusCommandSchema.safeParse({ expectedVersion: Number(text(formData, 'expectedVersion')), status: text(formData, 'status'), percentComplete: Number(text(formData, 'percentComplete')), actualStart: optional(formData, 'actualStart'), actualFinish: optional(formData, 'actualFinish'), actualLaborMinutes: Number(text(formData, 'actualLaborMinutes')), commitmentWeek: optional(formData, 'commitmentWeek'), commitmentStatus: text(formData, 'commitmentStatus') || 'not_set', constraintReason: text(formData, 'constraintReason') })
  if (!projectId.success || !taskId.success || !command.success) return { ok: false, error: command.success ? 'Invalid schedule scope.' : command.error.issues[0]?.message ?? 'Invalid schedule status update.' }
  return executeMutation(projectId.data, taskId.data, 'status', command.data)
}

async function executeMutation(projectId: string, taskId: string, target: 'update' | 'status', command: unknown): Promise<ProjectScheduleActionState> {
  const result = await mutateProjectScheduleTaskThroughCoreApi(projectId, taskId, target, command)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Schedule mutation was not committed.' }
  if (result.data.projectId !== projectId || result.data.task.projectId !== projectId || result.data.task.id !== taskId) return { ok: false, error: 'ERP Core API returned an invalid schedule scope.' }
  refresh(projectId)
  return { ok: true, success: target === 'update' ? (result.data.changed ? 'Schedule task updated.' : 'No changes to save.') : (result.data.changed ? 'Schedule status updated.' : 'No changes to save.') }
}
