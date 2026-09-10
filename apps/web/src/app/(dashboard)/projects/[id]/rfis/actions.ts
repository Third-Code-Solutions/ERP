'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  createProjectRfiCommandSchema,
  projectRfiAnswerCommandSchema,
  projectRfiCloseCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  createProjectRfiThroughCoreApi,
  transitionProjectRfiThroughCoreApi,
} from '@/lib/erp-core-client'

export interface ProjectRfiActionState {
  ok: boolean
  error?: string
  success?: string
}

const uuidSchema = z.string().uuid()
const targetSchema = z.enum(['answer', 'close', 'reopen'])

function text(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * The UI collects a Philippine calendar date. Store the end of that date in
 * the application timezone so due-date sorting is deterministic for every
 * browser and does not depend on the Core host's local timezone.
 */
function dueAt(value: FormDataEntryValue | null): string | null | undefined {
  const raw = text(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T23:59:59.000+08:00`
  }
  return raw
}

function refresh(projectId: string): void {
  revalidatePath(`/projects/${projectId}/rfis`)
  revalidatePath(`/projects/${projectId}`)
}

export async function createProjectRfi(
  _previous: ProjectRfiActionState,
  formData: FormData,
): Promise<ProjectRfiActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.rfi.manage')) {
    return {
      ok: false,
      error: 'You do not have permission to create project RFIs.',
    }
  }

  const projectId = uuidSchema.safeParse(formData.get('projectId'))
  const clientRequestId = uuidSchema.safeParse(formData.get('clientRequestId'))
  const command = createProjectRfiCommandSchema.safeParse({
    projectId: projectId.success ? projectId.data : formData.get('projectId'),
    clientRequestId: clientRequestId.success
      ? clientRequestId.data
      : formData.get('clientRequestId'),
    subject: formData.get('subject'),
    question: formData.get('question'),
    priority: formData.get('priority'),
    // Assignment is deliberately nullable until the project member picker is
    // added; accepting arbitrary user IDs in a free-text field would be unsafe.
    assignedTo: null,
    dueAt: dueAt(formData.get('dueAt')),
  })
  if (!projectId.success || !clientRequestId.success) {
    return { ok: false, error: 'Invalid project RFI request.' }
  }
  if (!command.success) {
    return {
      ok: false,
      error: command.error.issues[0]?.message ?? 'Invalid project RFI request.',
    }
  }

  const result = await createProjectRfiThroughCoreApi(command.data)
  if (!result.ok || !result.data) {
    return {
      ok: false,
      error: result.error ?? 'Project RFI was not created.',
    }
  }
  if (
    result.data.projectId !== projectId.data ||
    result.data.rfi.projectId !== projectId.data
  ) {
    return {
      ok: false,
      error: 'ERP Core API returned an invalid project RFI scope.',
    }
  }

  refresh(projectId.data)
  return {
    ok: true,
    success: result.data.created
      ? `${result.data.rfi.rfiNumber} created.`
      : `${result.data.rfi.rfiNumber} was already created by this request.`,
  }
}

export async function transitionProjectRfi(
  _previous: ProjectRfiActionState,
  formData: FormData,
): Promise<ProjectRfiActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.rfi.manage')) {
    return {
      ok: false,
      error: 'You do not have permission to change project RFIs.',
    }
  }

  const projectId = uuidSchema.safeParse(formData.get('projectId'))
  const rfiId = uuidSchema.safeParse(formData.get('rfiId'))
  const target = targetSchema.safeParse(formData.get('target'))
  const expectedVersion = Number(formData.get('expectedVersion'))
  if (
    !projectId.success ||
    !rfiId.success ||
    !target.success ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    return { ok: false, error: 'Invalid project RFI transition target.' }
  }

  const command =
    target.data === 'answer'
      ? projectRfiAnswerCommandSchema.safeParse({
          expectedVersion,
          response: formData.get('response'),
        })
      : projectRfiCloseCommandSchema.safeParse({
          expectedVersion,
          reason: formData.get('reason'),
        })
  if (!command.success) {
    return {
      ok: false,
      error:
        command.error.issues[0]?.message ??
        'Complete the project RFI transition form.',
    }
  }

  const result = await transitionProjectRfiThroughCoreApi(
    projectId.data,
    rfiId.data,
    target.data,
    command.data,
  )
  if (!result.ok || !result.data) {
    return {
      ok: false,
      error: result.error ?? 'Project RFI transition was not committed.',
    }
  }
  if (
    result.data.projectId !== projectId.data ||
    result.data.rfi.projectId !== projectId.data ||
    result.data.rfi.id !== rfiId.data
  ) {
    return {
      ok: false,
      error: 'ERP Core API returned an invalid project RFI scope.',
    }
  }

  refresh(projectId.data)
  return {
    ok: true,
    success: result.data.changed
      ? target.data === 'answer'
        ? 'Response saved.'
        : target.data === 'close'
          ? 'RFI closed.'
          : 'RFI reopened.'
      : 'RFI was already in that state.',
  }
}
