'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import {
  msProjectXmlCommitCommandSchema, msProjectXmlPreviewCommandSchema,
  msProjectXmlPreviewResultSchema, msProjectXmlImportResultSchema,
  type MsProjectXmlImportResult, type MsProjectXmlPreviewResult,
} from '@third-code-erp/shared-types'
import { importMsProjectXmlThroughCoreApi, previewMsProjectXmlThroughCoreApi } from '@/lib/erp-core-client'

const uuid = z.string().guid().transform(value => value.toLowerCase())
const scopeSchema = z.object({ tenantId: uuid, actorId: uuid }).strict()
type Input = { command: unknown; expectedScope: { tenantId: string; actorId: string } }
type Result<T> = { ok: true; data: T; refreshWarning?: string } | { ok: false; error: string; outcomeUnknown?: boolean }

async function admission(input: Input) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'project.schedule.manage')
  const scope = scopeSchema.parse(input.expectedScope)
  if (scope.tenantId !== profile.tenantId.toLowerCase() || scope.actorId !== profile.user.id.toLowerCase()) {
    throw new Error('STALE_SCOPE')
  }
  return scope
}

export async function previewMsProjectXmlAction(input: Input): Promise<Result<MsProjectXmlPreviewResult>> {
  const traceId = randomUUID()
  let scope: z.infer<typeof scopeSchema> | undefined
  let outcome = 'rejected'
  try {
    scope = await admission(input)
    const command = msProjectXmlPreviewCommandSchema.safeParse(input.command)
    if (!command.success) return { ok: false, error: 'Choose a valid exported XML file within the 1 MiB limit.' }
    const result = await previewMsProjectXmlThroughCoreApi(command.data)
    if (!result.ok) return { ok: false, error: result.error ?? 'Schedule preview is unavailable.' }
    const parsed = msProjectXmlPreviewResultSchema.safeParse(result.data)
    const expectedHash = createHash('sha256').update(Buffer.from(command.data.sourceBase64, 'base64')).digest('hex')
    if (!parsed.success || parsed.data.tenantId.toLowerCase() !== scope.tenantId ||
      parsed.data.actorId.toLowerCase() !== scope.actorId || parsed.data.projectId.toLowerCase() !== command.data.projectId.toLowerCase() ||
      (parsed.data.preview.sourceHash !== null && parsed.data.preview.sourceHash !== expectedHash)) {
      return { ok: false, error: 'Preview did not match this file and account. Reload and preview again.' }
    }
    outcome = 'succeeded'
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, error: 'Preview unavailable. Check your account context and schedule permissions, then retry.' }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: scope?.tenantId ?? null, actor_id: scope?.actorId ?? null, action: 'project_schedule.xml_preview', outcome }))
  }
}

export async function importMsProjectXmlAction(input: Input): Promise<Result<MsProjectXmlImportResult>> {
  const traceId = randomUUID()
  let scope: z.infer<typeof scopeSchema> | undefined
  let dispatched = false
  let outcome = 'rejected'
  const uncertain = (): Result<MsProjectXmlImportResult> => ({ ok: false, outcomeUnknown: true, error: 'Import outcome is unconfirmed. Retry the unchanged command to recover its receipt.' })
  try {
    scope = await admission(input)
    const parsedCommand = msProjectXmlCommitCommandSchema.safeParse(input.command)
    if (!parsedCommand.success) return { ok: false, error: 'Invalid reviewed import command. Preview the source and review all mappings.' }
    const command = parsedCommand.data
    const expectedHash = createHash('sha256').update(Buffer.from(command.sourceBase64, 'base64')).digest('hex')
    if (expectedHash !== command.sourceHash) return { ok: false, error: 'Source changed since preview. Preview the selected file again.' }
    dispatched = true
    const result = await importMsProjectXmlThroughCoreApi(command)
    if (!result.ok) {
      outcome = result.outcomeUnknown ? 'unconfirmed' : 'rejected'
      return { ok: false, error: result.error ?? 'Import was not confirmed.', ...(result.outcomeUnknown ? { outcomeUnknown: true } : {}) }
    }
    outcome = 'unconfirmed'
    const parsed = msProjectXmlImportResultSchema.safeParse(result.data)
    if (!parsed.success) return uncertain()
    const data = parsed.data
    const receipt = data.receipt
    if (receipt.tenantId.toLowerCase() !== scope.tenantId || receipt.actorId.toLowerCase() !== scope.actorId ||
      [data.projectId, receipt.projectId].some(id => id.toLowerCase() !== command.projectId.toLowerCase()) ||
      [data.requestId, receipt.requestId].some(id => id.toLowerCase() !== command.requestId.toLowerCase()) ||
      data.sourceHash !== command.sourceHash || receipt.sourceHash !== command.sourceHash ||
      data.parserVersion !== command.parserVersion || receipt.parserVersion !== command.parserVersion ||
      receipt.mappings.length !== command.mappings.length || receipt.tasks.length !== command.mappings.length ||
      new Set(receipt.mappings.map(row => row.sourceUid)).size !== receipt.mappings.length ||
      new Set(receipt.tasks.map(row => row.sourceUid)).size !== receipt.tasks.length ||
      new Set(receipt.tasks.map(row => row.taskId.toLowerCase())).size !== receipt.tasks.length ||
      command.mappings.some(mapping => {
        const returned = receipt.mappings.find(row => row.sourceUid === mapping.sourceUid)
        const task = receipt.tasks.find(row => row.sourceUid === mapping.sourceUid)
        return !returned || !task || returned.sourceOutlineLevel !== mapping.sourceOutlineLevel ||
          returned.level !== mapping.level || task.level !== mapping.level ||
          (returned.ownerId?.toLowerCase() ?? null) !== (mapping.ownerId?.toLowerCase() ?? null) ||
          (task.ownerId?.toLowerCase() ?? null) !== (mapping.ownerId?.toLowerCase() ?? null) || task.version !== 1
      })) return uncertain()
    try {
      revalidatePath(`/projects/${command.projectId}/schedule`)
      revalidatePath(`/projects/${command.projectId}`)
    } catch {
      outcome = 'succeeded_refresh_pending'
      return { ok: true, data, refreshWarning: 'Import committed. Reload to see the updated schedule.' }
    }
    outcome = 'succeeded'
    return { ok: true, data }
  } catch {
    outcome = dispatched ? 'unconfirmed' : 'rejected'
    return dispatched ? uncertain() : { ok: false, error: 'Import unavailable. Check your account context and schedule permissions.' }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: scope?.tenantId ?? null, actor_id: scope?.actorId ?? null, action: 'project_schedule.xml_import', outcome }))
  }
}
