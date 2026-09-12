'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  createQualityHoldPointCommandSchema,
  qualityHoldPointAcceptCommandSchema,
  qualityHoldPointReadyCommandSchema,
  qualityHoldPointRejectCommandSchema,
  qualityHoldPointSubmitCommandSchema,
  qualityHoldPointPunchlistHandoffCommandSchema,
  updateQualityHoldPointCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  createQualityHoldPointThroughCoreApi,
  mutateQualityHoldPointThroughCoreApi,
  handoffQualityHoldPointToPunchlistThroughCoreApi,
} from '@/lib/erp-core-client'

export interface QualityActionState {
  ok: boolean
  error?: string
  success?: string
}

export type QualityPunchlistHandoffActionState =
  | { ok: false; outcome: 'rejected' | 'unknown'; error: string }
  | {
      ok: true
      outcome: 'confirmed'
      success: string
      receipt: { projectId: string; entryId: string; clientRequestId: string; actorId: string; tenantId: string }
      refreshWarning?: string
    }

const uuidSchema = z.string().uuid()

function refresh(projectId: string): void {
  revalidatePath(`/projects/${projectId}/quality`)
  revalidatePath(`/projects/${projectId}`)
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function optionalUuid(formData: FormData, name: string): string | null {
  const value = text(formData, name).trim()
  return value || null
}

function optionalDate(formData: FormData, name: string): string | null {
  const value = text(formData, name).trim()
  return value || null
}

function booleanValue(formData: FormData, name: string): boolean {
  return text(formData, name) === 'true'
}

function nullableText(formData: FormData, name: string): string | null {
  const value = text(formData, name).trim()
  return value || null
}

function optionalIsoDate(formData: FormData, name: string): string | null {
  const value = nullableText(formData, name)
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? value
    : date.toISOString()
}

export async function createQualityHoldPoint(
  _previous: QualityActionState,
  formData: FormData,
): Promise<QualityActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'project.quality.manage')) {
    return { ok: false, error: 'You do not have permission to create quality requests.' }
  }
  const command = createQualityHoldPointCommandSchema.safeParse({
    projectId: text(formData, 'projectId'),
    clientRequestId: text(formData, 'clientRequestId'),
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    discipline: text(formData, 'discipline'),
    location: text(formData, 'location'),
    planReference: text(formData, 'planReference'),
    holdPoint: booleanValue(formData, 'holdPoint'),
    inspectionDate: optionalDate(formData, 'inspectionDate'),
    assignedTo: optionalUuid(formData, 'assignedTo'),
  })
  if (!command.success) return { ok: false, error: command.error.issues[0]?.message ?? 'Invalid quality request.' }
  const result = await createQualityHoldPointThroughCoreApi(command.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Quality request was not created.' }
  if (result.data.projectId !== command.data.projectId || result.data.entry.projectId !== command.data.projectId) {
    return { ok: false, error: 'ERP Core API returned an invalid quality scope.' }
  }
  refresh(command.data.projectId)
  return { ok: true, success: result.data.created ? `${result.data.entry.iwrNumber} created.` : `${result.data.entry.iwrNumber} was already created by this request.` }
}

export async function updateQualityHoldPoint(
  _previous: QualityActionState,
  formData: FormData,
): Promise<QualityActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.quality.manage')) return { ok: false, error: 'You do not have permission to edit quality requests.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId'))
  const entryId = uuidSchema.safeParse(text(formData, 'entryId'))
  const command = updateQualityHoldPointCommandSchema.safeParse({
    expectedVersion: Number(text(formData, 'expectedVersion')),
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    discipline: text(formData, 'discipline'),
    location: text(formData, 'location'),
    planReference: text(formData, 'planReference'),
    holdPoint: booleanValue(formData, 'holdPoint'),
    inspectionDate: optionalDate(formData, 'inspectionDate'),
    assignedTo: optionalUuid(formData, 'assignedTo'),
  })
  if (!projectId.success || !entryId.success || !command.success) return { ok: false, error: 'Invalid quality update.' }
  return executeMutation(projectId.data, entryId.data, 'update', command.data)
}

export async function transitionQualityHoldPoint(
  _previous: QualityActionState,
  formData: FormData,
): Promise<QualityActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  const parsedTarget = z.enum(['ready', 'submit', 'accept', 'reject']).safeParse(text(formData, 'target'))
  if (!parsedTarget.success) return { ok: false, error: 'Invalid quality transition target.' }
  const target = parsedTarget.data
  const requiredCapability = target === 'accept' ? 'project.quality.approve' : 'project.quality.manage'
  if (!can(profile.role, requiredCapability)) return { ok: false, error: 'You do not have permission for this quality transition.' }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId'))
  const entryId = uuidSchema.safeParse(text(formData, 'entryId'))
  if (!projectId.success || !entryId.success) return { ok: false, error: 'Invalid quality transition scope.' }
  const expectedVersion = Number(text(formData, 'expectedVersion'))
  const command = target === 'ready'
    ? qualityHoldPointReadyCommandSchema.safeParse({ expectedVersion })
    : target === 'submit'
      ? qualityHoldPointSubmitCommandSchema.safeParse({ expectedVersion, requestNotes: text(formData, 'requestNotes') })
      : target === 'accept'
        ? qualityHoldPointAcceptCommandSchema.safeParse({ expectedVersion, findings: text(formData, 'findings'), acceptanceNotes: text(formData, 'acceptanceNotes') })
        : qualityHoldPointRejectCommandSchema.safeParse({ expectedVersion, findings: text(formData, 'findings'), reason: text(formData, 'reason') })
  if (!command.success) return { ok: false, error: command.error.issues[0]?.message ?? 'Invalid quality transition.' }
  return executeMutation(projectId.data, entryId.data, target, command.data)
}

/** Converts a rejected IWR into durable punchlist work through Core. */
export async function handoffQualityHoldPointToPunchlist(
  _previous: QualityActionState,
  formData: FormData,
  expectedOwner?: { actorId: string; tenantId: string },
): Promise<QualityPunchlistHandoffActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, outcome: 'rejected', error: 'Unauthorized.' }
  if (expectedOwner !== undefined) {
    const owner = z.object({ actorId: uuidSchema, tenantId: uuidSchema }).strict().safeParse(expectedOwner)
    if (!owner.success || owner.data.actorId.toLowerCase() !== profile.user.id.toLowerCase() || owner.data.tenantId.toLowerCase() !== profile.tenantId.toLowerCase()) {
      return { ok: false, outcome: 'rejected', error: 'The signed-in account changed. Reload before preparing new work.' }
    }
  }
  if (!can(profile.role, 'punchlist.manage')) {
    return { ok: false, outcome: 'rejected', error: 'You do not have permission to create punchlist work.' }
  }
  const projectId = uuidSchema.safeParse(text(formData, 'projectId'))
  const entryId = uuidSchema.safeParse(text(formData, 'entryId'))
  if (!projectId.success || !entryId.success) return { ok: false, outcome: 'rejected', error: 'Invalid punchlist handoff scope.' }

  const descriptions = text(formData, 'descriptions')
    .split(/\r?\n/u)
    .map((description) => description.trim())
    .filter((description) => description.length > 0)
  const command = qualityHoldPointPunchlistHandoffCommandSchema.safeParse({
    clientRequestId: text(formData, 'clientRequestId'),
    planDocumentId: nullableText(formData, 'planDocumentId'),
    items: descriptions.map((description) => ({
      description,
      location: nullableText(formData, 'location'),
      trade: nullableText(formData, 'trade'),
      priority: text(formData, 'priority') || 'medium',
      dueDate: optionalIsoDate(formData, 'dueDate'),
      assignedToUserId: nullableText(formData, 'assignedToUserId'),
      assignedToText: nullableText(formData, 'assignedToText'),
    })),
  })
  if (!command.success) return { ok: false, outcome: 'rejected', error: command.error.issues[0]?.message ?? 'Invalid punchlist handoff.' }

  let result: Awaited<ReturnType<typeof handoffQualityHoldPointToPunchlistThroughCoreApi>>
  try {
    result = await handoffQualityHoldPointToPunchlistThroughCoreApi(projectId.data, entryId.data, command.data)
  } catch {
    return { ok: false, outcome: 'unknown', error: 'Punchlist handoff outcome is unconfirmed. Retry the unchanged request.' }
  }
  if (!result.ok) return { ok: false, outcome: result.outcome, error: result.error }
  if (result.data.projectId.toLowerCase() !== projectId.data.toLowerCase() || result.data.qualityHoldPointId.toLowerCase() !== entryId.data.toLowerCase() || result.data.clientRequestId?.toLowerCase() !== command.data.clientRequestId.toLowerCase()) {
    return { ok: false, outcome: 'unknown', error: 'ERP Core API returned an unconfirmed punchlist handoff scope.' }
  }
  let refreshWarning: string | undefined
  try {
    refresh(projectId.data)
  } catch {
    refreshWarning = 'Punchlist handoff is confirmed, but the page could not refresh. Reload to see current records.'
  }
  const count = result.data.items.length
  return {
    ok: true,
    outcome: 'confirmed',
    receipt: {
      projectId: projectId.data,
      entryId: entryId.data,
      clientRequestId: command.data.clientRequestId,
      actorId: profile.user.id,
      tenantId: profile.tenantId,
    },
    ...(refreshWarning ? { refreshWarning } : {}),
    success: result.data.created
      ? `${count} punchlist item${count === 1 ? '' : 's'} created from ${result.data.source.iwrNumber}.`
      : `${result.data.source.iwrNumber} is already linked to ${count} punchlist item${count === 1 ? '' : 's'}.`,
  }
}

async function executeMutation(
  projectId: string,
  entryId: string,
  target: 'update' | 'ready' | 'submit' | 'accept' | 'reject',
  command: unknown,
): Promise<QualityActionState> {
  const result = await mutateQualityHoldPointThroughCoreApi(projectId, entryId, target, command)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Quality mutation was not committed.' }
  if (result.data.projectId !== projectId || result.data.entry.projectId !== projectId || result.data.entry.id !== entryId) {
    return { ok: false, error: 'ERP Core API returned an invalid quality scope.' }
  }
  refresh(projectId)
  const messages: Record<typeof target, string> = {
    update: result.data.changed ? 'Quality request updated.' : 'No changes to save.',
    ready: result.data.changed ? 'Quality request marked ready.' : 'Quality request was already ready.',
    submit: result.data.changed ? 'IWR submitted for inspection.' : 'IWR was already submitted.',
    accept: result.data.changed ? 'Inspection accepted.' : 'Inspection was already accepted.',
    reject: result.data.changed ? 'Inspection rejected with a recorded reason.' : 'Inspection was already rejected.',
  }
  return { ok: true, success: messages[target] }
}
