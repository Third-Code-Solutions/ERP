'use server'

import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { revalidatePath } from 'next/cache'
import { can, getUserProfile } from '@third-code-erp/auth'
import {
  createProjectWeeklyProgressCommandSchema,
  lockProjectWeeklyProgressCommandSchema,
  projectWeeklyProgressMutationResultSchema,
  projectWeeklyProgressLockResultSchema,
  weeklyProgressCapturePayload,
  weeklyProgressLockPayload,
  weeklyProgressCutoffAt,
  type ProjectWeeklyProgressCommandReceipt,
} from '@third-code-erp/shared-types'
import type { ErpCapability } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
import {
  createProjectWeeklyProgressThroughCoreApi,
  lockProjectWeeklyProgressThroughCoreApi,
  projectWeeklyProgressWritesUseCoreApi,
} from '@/lib/erp-core-client'

export interface WeeklyCommandScope { tenantId: string; actorId: string; projectId: string }
export type WeeklyProgressCommandActionResult =
  | { ok: true; receipt: ProjectWeeklyProgressCommandReceipt; changed: boolean; warning?: string }
  | { ok: false; outcome: 'rejected' | 'unknown'; error: string }

type Failure = Extract<WeeklyProgressCommandActionResult, { ok: false }>
const uuid = z.string().uuid().transform(value => value.toLowerCase())
const scopeSchema = z.object({ tenantId: uuid, actorId: uuid, projectId: uuid }).strict()
const keyedLockSchema = lockProjectWeeklyProgressCommandSchema.extend({ clientRequestId: uuid })
const rejected = (error: string): Failure => ({ ok: false, outcome: 'rejected', error })
const unconfirmed = (): Failure => ({ ok: false, outcome: 'unknown', error: 'The weekly command could not be confirmed. Keep this page open and retry the unchanged command to recover its receipt.' })
const hash = (payload: string): string => createHash('sha256').update(payload).digest('hex')

async function admit(rawScope: unknown, capability: ErpCapability): Promise<WeeklyCommandScope | Failure> {
  const parsed = scopeSchema.safeParse(rawScope)
  if (!parsed.success) return rejected('Invalid weekly progress scope. Refresh the project page.')
  const profile = await getUserProfile().catch(() => null)
  if (!profile || !can(profile.role, capability)) return rejected('Your current session cannot perform this weekly progress action.')
  if (profile.tenantId.toLowerCase() !== parsed.data.tenantId || profile.user.id.toLowerCase() !== parsed.data.actorId) {
    return rejected('Your account or workspace changed. Refresh the project page.')
  }
  if (!projectWeeklyProgressWritesUseCoreApi(profile.tenantId)) return rejected('Core weekly commands are not enabled for this workspace. Refresh the project page.')
  return parsed.data
}

function failedCommand(result: { status?: number; outcomeUnknown?: boolean }): Failure {
  if (result.outcomeUnknown === true || (result.outcomeUnknown !== false && (result.status === undefined || result.status >= 500 || result.status === 408))) return unconfirmed()
  return rejected(result.status === 409
    ? 'The weekly command conflicts with current evidence, cutoff or a historical request. Review the ledger; an unconfirmed command must keep its original retry key.'
    : 'The weekly command was not sent or was rejected. Check your session, permissions and submitted values.')
}

function validScope(receipt: ProjectWeeklyProgressCommandReceipt, scope: WeeklyCommandScope, requestId: string, payloadHash: string): boolean {
  return receipt.tenantId === scope.tenantId && receipt.actorId === scope.actorId
    && receipt.projectId === scope.projectId && receipt.row.projectId === scope.projectId
    && receipt.clientRequestId === requestId && receipt.payloadHash === payloadHash
    && receipt.row.cutoffAt === weeklyProgressCutoffAt(receipt.row.weekEnding)
    && Date.parse(receipt.row.updatedAt) >= Date.parse(receipt.row.createdAt)
}

function confirmed(receipt: ProjectWeeklyProgressCommandReceipt, changed: boolean): WeeklyProgressCommandActionResult {
  try {
    revalidatePath(`/projects/${receipt.projectId}/progress`)
    revalidatePath(`/projects/${receipt.projectId}/billing`)
    return { ok: true, receipt, changed }
  } catch {
    return { ok: true, receipt, changed, warning: 'The command is confirmed, but the page could not refresh. Refresh to see the latest ledger; do not submit a replacement command.' }
  }
}

async function captureCommand(rawScope: unknown, command: unknown, admitted: (scope: WeeklyCommandScope) => void): Promise<WeeklyProgressCommandActionResult> {
  const parsed = createProjectWeeklyProgressCommandSchema.safeParse(command)
  if (!parsed.success) return rejected('Check the week, percentages, notes and request identifier.')
  const scope = await admit(rawScope, 'project.weekly_progress.submit')
  if ('ok' in scope) return scope
  admitted(scope)
  const input = { ...parsed.data, projectId: parsed.data.projectId.toLowerCase(), clientRequestId: parsed.data.clientRequestId.toLowerCase() }
  if (input.projectId !== scope.projectId) return rejected('The capture project does not match the current page.')
  try {
    const result = await createProjectWeeklyProgressThroughCoreApi(input)
    if (!result.ok) return failedCommand(result)
    const evidence = projectWeeklyProgressMutationResultSchema.safeParse(result.data)
    if (!evidence.success || !evidence.data.receipt) return unconfirmed()
    const data = evidence.data
    const receipt = data.receipt!
    const row = receipt.row
    if (receipt.operation !== 'capture' || !validScope(receipt, scope, input.clientRequestId, hash(weeklyProgressCapturePayload(input)))
      || data.projectId !== scope.projectId || !isDeepStrictEqual(data.row, row)
      || data.created !== (data.changed ? receipt.created : false)
      || row.clientRequestId !== input.clientRequestId || row.weekEnding !== input.weekEnding
      || row.notes !== input.notes || !isDeepStrictEqual(row.percentByCategory, input.percentByCategory)
      || row.status !== 'open' || row.warSnapshot !== null || row.lockedAt !== null || row.lockedBy !== null || row.lockReason !== ''
      || Date.parse(row.updatedAt) >= Date.parse(row.cutoffAt)
      || (receipt.created ? row.version !== 1 || row.createdBy !== scope.actorId : row.version < 2)) return unconfirmed()
    return confirmed(receipt, data.changed)
  } catch {
    return unconfirmed()
  }
}

async function lockCommand(rawScope: unknown, periodId: unknown, command: unknown, admitted: (scope: WeeklyCommandScope) => void): Promise<WeeklyProgressCommandActionResult> {
  const parsedPeriod = uuid.safeParse(periodId)
  const parsed = keyedLockSchema.safeParse(command)
  if (!parsedPeriod.success || !parsed.success) return rejected('Check the WAR period, expected version and request identifier.')
  const scope = await admit(rawScope, 'precon.manage_checklist')
  if ('ok' in scope) return scope
  admitted(scope)
  try {
    const result = await lockProjectWeeklyProgressThroughCoreApi(scope.projectId, parsedPeriod.data, parsed.data)
    if (!result.ok) return failedCommand(result)
    const evidence = projectWeeklyProgressLockResultSchema.safeParse(result.data)
    if (!evidence.success || !evidence.data.receipt) return unconfirmed()
    const data = evidence.data
    const receipt = data.receipt!
    const row = receipt.row
    const snapshot = row.warSnapshot
    if (receipt.operation !== 'lock' || !validScope(receipt, scope, parsed.data.clientRequestId, hash(weeklyProgressLockPayload(scope.projectId, parsedPeriod.data, parsed.data)))
      || data.projectId !== scope.projectId || !isDeepStrictEqual(data.row, row)
      || receipt.expectedVersion !== parsed.data.expectedVersion || row.id !== parsedPeriod.data
      || row.version !== parsed.data.expectedVersion + 1 || row.status !== 'locked' || row.lockedBy !== scope.actorId
      || row.lockReason !== parsed.data.lockReason || !row.lockedAt || row.updatedAt !== row.lockedAt || Date.parse(row.lockedAt) < Date.parse(row.cutoffAt)
      || !snapshot || snapshot.weekEnding !== row.weekEnding || snapshot.notes !== row.notes
      || snapshot.overallPct !== row.percentByCategory.overall_pct || !isDeepStrictEqual(snapshot.percentByCategory, row.percentByCategory)
      || Date.parse(snapshot.capturedAt) !== Date.parse(row.lockedAt)) return unconfirmed()
    return confirmed(receipt, data.changed)
  } catch {
    return unconfirmed()
  }
}

async function observedCommand(
  operation: 'capture' | 'lock',
  execute: (admitted: (scope: WeeklyCommandScope) => void) => Promise<WeeklyProgressCommandActionResult>,
): Promise<WeeklyProgressCommandActionResult> {
  const traceId = randomUUID()
  let scope: WeeklyCommandScope | undefined
  let outcome = 'unknown'
  try {
    const result = await execute(value => { scope = value })
    outcome = result.ok ? (result.warning ? 'succeeded_refresh_pending' : 'succeeded') : result.outcome
    return result
  } catch {
    return unconfirmed()
  } finally {
    // Only admitted identity belongs in operational logs; never command notes.
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: scope?.tenantId ?? null, actor_id: scope?.actorId ?? null, action: `project_weekly_progress.${operation}`, outcome }))
  }
}

export async function captureWeeklyProgressCommand(rawScope: unknown, command: unknown): Promise<WeeklyProgressCommandActionResult> {
  return observedCommand('capture', admitted => captureCommand(rawScope, command, admitted))
}

export async function lockWeeklyProgressCommand(rawScope: unknown, periodId: unknown, command: unknown): Promise<WeeklyProgressCommandActionResult> {
  return observedCommand('lock', admitted => lockCommand(rawScope, periodId, command, admitted))
}
