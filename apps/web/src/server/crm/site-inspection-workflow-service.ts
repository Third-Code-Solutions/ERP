import { createHash } from 'node:crypto'

import { z } from 'zod'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db, type Database } from '@third-code-erp/database'
import {
  auditLog,
  documents,
  notifications,
  opportunities,
  pprfSubmissions,
  siteInspectionPhotos,
  siteInspectionRfis,
  siteInspections,
  slaLogs,
  users,
} from '@third-code-erp/database/schema'
import {
  roleHasCapability,
  type ErpRole,
} from '@third-code-erp/shared-types'

import { writeAuditLogInTransaction } from '@/lib/audit'
import { SLA_CONFIG } from '@/lib/operations/sla-clock'

const HASH = /^[a-f0-9]{64}$/
const MAX_PHOTOS = 10
const INSPECTION_SOURCE = 'site_inspection_workflow_service'
const RFI_SOURCE = 'site_inspection_rfi_workflow_service'

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  )
}

const optionalText = (max: number) => z.string().trim().max(max).default('')
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || isCalendarDate(value), {
    message: 'must be empty or a valid YYYY-MM-DD calendar date',
  })
  .default('')

export const siteInspectionPayloadSchema = z
  .object({
    siteAddress: z.string().trim().min(2).max(500),
    floorAreaSqm: optionalText(64),
    landlordContact: optionalText(255),
    asBuiltAvailable: z.enum(['yes', 'partial', 'no']).default('no'),
    expectedStartDate: optionalDate,
    weather: optionalText(255),
    accessibilityNotes: optionalText(5_000),
    observations: optionalText(20_000),
  })
  .strict()

const uniquePhotoIdsSchema = z
  .array(z.string().uuid())
  .max(MAX_PHOTOS)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'photo document IDs must be unique',
      })
    }
  })

export const siteInspectionSubmissionCommandSchema = z
  .object({
    kind: z.literal('inspection_submission'),
    submissionId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    payload: siteInspectionPayloadSchema,
    photoDocumentIds: uniquePhotoIdsSchema,
  })
  .strict()

export const siteInspectionRfiCommandSchema = z
  .object({
    kind: z.literal('rfi_creation'),
    submissionId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    description: z.string().trim().min(2).max(2_000),
    priority: z.enum(['minor', 'major']),
  })
  .strict()

const principalSchema = z
  .object({ tenantId: z.string().uuid(), userId: z.string().uuid() })
  .strict()

export const siteInspectionReceiptSchema = z
  .object({
    source: z.literal(INSPECTION_SOURCE),
    receipt_version: z.literal(1),
    submission_kind: z.literal('inspection_submission'),
    idempotency_key_hash: z.string().regex(HASH),
    command_hash: z.string().regex(HASH),
    tenant_id: z.string().uuid(),
    actor_id: z.string().uuid(),
    opportunity_id: z.string().uuid(),
    inspection_id: z.string().uuid(),
    status: z.literal('submitted'),
    submitted_at: z.string().datetime(),
    linked_photo_count: z.number().int().min(0).max(MAX_PHOTOS),
    notification_recipient_set_hash: z.string().regex(HASH),
    notification_recipient_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()

export const siteInspectionRfiReceiptSchema = z
  .object({
    source: z.literal(RFI_SOURCE),
    receipt_version: z.literal(1),
    submission_kind: z.literal('rfi_creation'),
    idempotency_key_hash: z.string().regex(HASH),
    command_hash: z.string().regex(HASH),
    tenant_id: z.string().uuid(),
    actor_id: z.string().uuid(),
    opportunity_id: z.string().uuid(),
    inspection_id: z.string().uuid(),
    rfi_id: z.string().uuid(),
    priority: z.enum(['minor', 'major']),
    created_at: z.string().datetime(),
  })
  .strict()

const inspectionSuccessSchema = z
  .object({
    ok: z.literal(true),
    kind: z.literal('inspection_submission'),
    tenantId: z.string().uuid(),
    actorId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    status: z.literal('submitted'),
    submittedAt: z.string().datetime(),
    linkedPhotoCount: z.number().int().min(0).max(MAX_PHOTOS),
    replayed: z.boolean(),
  })
  .strict()

const rfiSuccessSchema = z
  .object({
    ok: z.literal(true),
    kind: z.literal('rfi_creation'),
    tenantId: z.string().uuid(),
    actorId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    rfiId: z.string().uuid(),
    priority: z.enum(['minor', 'major']),
    createdAt: z.string().datetime(),
    replayed: z.boolean(),
  })
  .strict()

const failureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          'VALIDATION_ERROR',
          'FORBIDDEN',
          'NOT_FOUND',
          'PPRF_REQUIRED',
          'CONFLICT',
          'INTERNAL_ERROR',
        ]),
        message: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict()

export const siteInspectionWorkflowResultSchema = z.union([
  inspectionSuccessSchema,
  rfiSuccessSchema,
  failureSchema,
])

export type SiteInspectionPayload = z.infer<typeof siteInspectionPayloadSchema>
export type SiteInspectionSubmissionCommand = z.infer<
  typeof siteInspectionSubmissionCommandSchema
>
export type SiteInspectionRfiCommand = z.infer<
  typeof siteInspectionRfiCommandSchema
>
export type SiteInspectionWorkflowResult = z.infer<
  typeof siteInspectionWorkflowResultSchema
>
export interface SiteInspectionWorkflowPrincipal {
  tenantId: string
  userId: string
}

type ReceiptKind = 'inspection_submission' | 'rfi_creation'
type ReceiptRow = { entityId: string; diff: unknown }

export interface SiteInspectionWorkflowTransaction {
  lockMembership(principal: SiteInspectionWorkflowPrincipal): Promise<{
    tenantId: string
    role: ErpRole
  } | null>
  lockCommand(tenantId: string, keyHash: string): Promise<void>
  lockOpportunity(tenantId: string, opportunityId: string): Promise<{
    id: string
    tenantId: string
    projectId: string | null
  } | null>
  hasPprf(tenantId: string, opportunityId: string): Promise<boolean>
  findInspectionBySubmission(
    tenantId: string,
    submissionId: string
  ): Promise<{ id: string; opportunityId: string } | null>
  findReceipts(
    tenantId: string,
    kind: ReceiptKind,
    keyHash: string
  ): Promise<ReceiptRow[]>
  loadInspection(tenantId: string, inspectionId: string): Promise<{
    id: string
    tenantId: string
    opportunityId: string
    status: string
    submittedAt: Date | null
  } | null>
  lockInspection(tenantId: string, inspectionId: string): Promise<{
    id: string
    tenantId: string
    opportunityId: string
  } | null>
  loadRfi(tenantId: string, rfiId: string): Promise<{
    id: string
    tenantId: string
    inspectionId: string
    priority: string
    createdAt: Date
  } | null>
  loadPhotoDocuments(
    tenantId: string,
    documentIds: readonly string[]
  ): Promise<Array<{
    id: string
    tenantId: string
    opportunityId: string | null
    projectId: string | null
  }>>
  countInspectionPhotos(tenantId: string, inspectionId: string): Promise<number>
  hasOpenDesignHandoffSla(
    tenantId: string,
    opportunityId: string
  ): Promise<boolean>
  findDesignRecipients(
    tenantId: string
  ): Promise<Array<{ id: string; email: string; role: ErpRole }>>
  findNotifiedDesignRecipientIds(
    tenantId: string,
    opportunityId: string,
    inspectionId: string
  ): Promise<string[]>
  createInspection(input: {
    tenantId: string
    actorId: string
    opportunityId: string
    submissionId: string
    payload: Record<string, string>
    submittedAt: Date
  }): Promise<{ id: string } | null>
  createPhotoLinks(rows: Array<{
    tenantId: string
    inspectionId: string
    documentId: string
  }>): Promise<void>
  writeAudit(input: {
    tenantId: string
    actorId: string
    entityType: 'site_inspection' | 'site_inspection_rfi'
    entityId: string
    action: 'create'
    diff: Record<string, unknown>
  }): Promise<void>
  ensureDesignHandoffSla(tenantId: string, opportunityId: string): Promise<void>
  createNotification(input: {
    tenantId: string
    recipientUserId: string
    recipientEmail: string
    subject: string
    body: string
    linkUrl: string
    inspectionId: string
  }): Promise<void>
  createRfi(input: {
    tenantId: string
    inspectionId: string
    description: string
    priority: 'minor' | 'major'
    createdAt: Date
  }): Promise<{ id: string } | null>
}

export interface SiteInspectionWorkflowStore {
  transaction<T>(
    callback: (transaction: SiteInspectionWorkflowTransaction) => Promise<T>
  ): Promise<T>
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeJson(entry)])
  )
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value))
}

function notificationRecipientSetHash(recipientIds: readonly string[]): string {
  return sha256(canonicalJson([...recipientIds].sort()))
}

function failure(
  code: Extract<SiteInspectionWorkflowResult, { ok: false }>['error']['code'],
  message: string
): Extract<SiteInspectionWorkflowResult, { ok: false }> {
  return { ok: false, error: { code, message } }
}

function persistedPayload(payload: SiteInspectionPayload): Record<string, string> {
  return {
    site_address: payload.siteAddress,
    floor_area_sqm: payload.floorAreaSqm,
    landlord_contact: payload.landlordContact,
    as_built_available: payload.asBuiltAvailable,
    expected_start_date: payload.expectedStartDate,
    weather: payload.weather,
    accessibility_notes: payload.accessibilityNotes,
    observations: payload.observations,
  }
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  )
}

export class SiteInspectionWorkflowService {
  constructor(
    private readonly store: SiteInspectionWorkflowStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async submitInspection(
    principalInput: SiteInspectionWorkflowPrincipal,
    commandInput: SiteInspectionSubmissionCommand
  ): Promise<SiteInspectionWorkflowResult> {
    const principal = principalSchema.safeParse(principalInput)
    const command = siteInspectionSubmissionCommandSchema.safeParse(commandInput)
    if (!principal.success || !command.success) {
      return failure('VALIDATION_ERROR', 'Invalid site inspection command')
    }

    const photoDocumentIds = [...command.data.photoDocumentIds].sort()
    const normalizedCommand = { ...command.data, photoDocumentIds }
    const keyHash = sha256(
      canonicalJson({ tenantId: principal.data.tenantId, submissionId: command.data.submissionId })
    )
    const commandHash = sha256(
      canonicalJson({
        tenantId: principal.data.tenantId,
        actorId: principal.data.userId,
        command: normalizedCommand,
      })
    )

    try {
      return await this.store.transaction(async (transaction) => {
        const membership = await transaction.lockMembership(principal.data)
        if (
          !membership ||
          membership.tenantId !== principal.data.tenantId ||
          !roleHasCapability(membership.role, 'site_inspection.submit')
        ) {
          return siteInspectionWorkflowResultSchema.parse(
            failure('FORBIDDEN', 'Site inspection submission is not permitted')
          )
        }

        await transaction.lockCommand(membership.tenantId, keyHash)
        const opportunity = await transaction.lockOpportunity(
          membership.tenantId,
          command.data.opportunityId
        )
        if (!opportunity || opportunity.tenantId !== membership.tenantId) {
          return siteInspectionWorkflowResultSchema.parse(
            failure('NOT_FOUND', 'Opportunity was not found')
          )
        }

        const existing = await transaction.findInspectionBySubmission(
          membership.tenantId,
          command.data.submissionId
        )
        const receipts = await transaction.findReceipts(
          membership.tenantId,
          'inspection_submission',
          keyHash
        )
        if (existing || receipts.length > 0) {
          return this.replayInspection(transaction, {
            tenantId: membership.tenantId,
            actorId: principal.data.userId,
            opportunityId: opportunity.id,
            keyHash,
            commandHash,
            existing,
            receipts,
          })
        }

        if (!(await transaction.hasPprf(membership.tenantId, opportunity.id))) {
          return siteInspectionWorkflowResultSchema.parse(
            failure(
              'PPRF_REQUIRED',
              'PPRF must be submitted before logging a site inspection'
            )
          )
        }

        const photoRows = await transaction.loadPhotoDocuments(
          membership.tenantId,
          photoDocumentIds
        )
        const photosAreSafe =
          photoRows.length === photoDocumentIds.length &&
          sameMembers(photoRows.map((row) => row.id), photoDocumentIds) &&
          photoRows.every(
            (row) =>
              row.tenantId === membership.tenantId &&
              (row.opportunityId === opportunity.id ||
                (opportunity.projectId !== null &&
                  row.projectId === opportunity.projectId))
          )
        if (!photosAreSafe) {
          return siteInspectionWorkflowResultSchema.parse(
            failure('NOT_FOUND', 'One or more inspection photos were not found')
          )
        }

        const submittedAt = this.now()
        const inspection = await transaction.createInspection({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          opportunityId: opportunity.id,
          submissionId: command.data.submissionId,
          payload: persistedPayload(command.data.payload),
          submittedAt,
        })
        if (!inspection) throw new Error('Inspection insert returned no row')

        if (photoDocumentIds.length > 0) {
          await transaction.createPhotoLinks(
            photoDocumentIds.map((documentId) => ({
              tenantId: membership.tenantId,
              inspectionId: inspection.id,
              documentId,
            }))
          )
        }

        const recipients = await transaction.findDesignRecipients(
          membership.tenantId
        )
        const uniqueRecipients = [
          ...new Map(recipients.map((recipient) => [recipient.id, recipient])).values(),
        ]
        for (const recipient of uniqueRecipients) {
          if (
            recipient.role !== 'design' ||
            !recipient.id ||
            !recipient.email
          ) {
            throw new Error('Design recipient result is invalid')
          }
        }
        const notificationRecipientIds = uniqueRecipients
          .map((recipient) => recipient.id)
          .sort()

        const receipt = siteInspectionReceiptSchema.parse({
          source: INSPECTION_SOURCE,
          receipt_version: 1,
          submission_kind: 'inspection_submission',
          idempotency_key_hash: keyHash,
          command_hash: commandHash,
          tenant_id: membership.tenantId,
          actor_id: principal.data.userId,
          opportunity_id: opportunity.id,
          inspection_id: inspection.id,
          status: 'submitted',
          submitted_at: submittedAt.toISOString(),
          linked_photo_count: photoDocumentIds.length,
          notification_recipient_set_hash: notificationRecipientSetHash(
            notificationRecipientIds
          ),
          notification_recipient_count: notificationRecipientIds.length,
        })
        await transaction.writeAudit({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          entityType: 'site_inspection',
          entityId: inspection.id,
          action: 'create',
          diff: receipt,
        })
        await transaction.ensureDesignHandoffSla(
          membership.tenantId,
          opportunity.id
        )
        for (const recipient of uniqueRecipients) {
          await transaction.createNotification({
            tenantId: membership.tenantId,
            recipientUserId: recipient.id,
            recipientEmail: recipient.email,
            subject: 'Site Inspection ready for design',
            body: 'A new site inspection report has been submitted. Design can begin layouts.',
            linkUrl: `/crm/opportunities/${opportunity.id}/proposal/inspection`,
            inspectionId: inspection.id,
          })
        }

        return siteInspectionWorkflowResultSchema.parse({
          ok: true,
          kind: 'inspection_submission',
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          opportunityId: opportunity.id,
          inspectionId: inspection.id,
          status: 'submitted',
          submittedAt: submittedAt.toISOString(),
          linkedPhotoCount: photoDocumentIds.length,
          replayed: false,
        })
      })
    } catch {
      return failure(
        'INTERNAL_ERROR',
        'Site inspection could not be saved. Retry the submission.'
      )
    }
  }

  async createRfi(
    principalInput: SiteInspectionWorkflowPrincipal,
    commandInput: SiteInspectionRfiCommand
  ): Promise<SiteInspectionWorkflowResult> {
    const principal = principalSchema.safeParse(principalInput)
    const command = siteInspectionRfiCommandSchema.safeParse(commandInput)
    if (!principal.success || !command.success) {
      return failure('VALIDATION_ERROR', 'Invalid inspection RFI command')
    }

    const keyHash = sha256(
      canonicalJson({ tenantId: principal.data.tenantId, submissionId: command.data.submissionId })
    )
    const commandHash = sha256(
      canonicalJson({
        tenantId: principal.data.tenantId,
        actorId: principal.data.userId,
        command: command.data,
      })
    )

    try {
      return await this.store.transaction(async (transaction) => {
        const membership = await transaction.lockMembership(principal.data)
        if (
          !membership ||
          membership.tenantId !== principal.data.tenantId ||
          !roleHasCapability(membership.role, 'site_inspection.submit')
        ) {
          return siteInspectionWorkflowResultSchema.parse(
            failure('FORBIDDEN', 'Inspection RFI creation is not permitted')
          )
        }

        await transaction.lockCommand(membership.tenantId, keyHash)
        const opportunity = await transaction.lockOpportunity(
          membership.tenantId,
          command.data.opportunityId
        )
        if (!opportunity || opportunity.tenantId !== membership.tenantId) {
          return siteInspectionWorkflowResultSchema.parse(
            failure('NOT_FOUND', 'Inspection was not found')
          )
        }
        const inspection = await transaction.lockInspection(
          membership.tenantId,
          command.data.inspectionId
        )
        if (
          !inspection ||
          inspection.tenantId !== membership.tenantId ||
          inspection.opportunityId !== opportunity.id
        ) {
          return siteInspectionWorkflowResultSchema.parse(
            failure('NOT_FOUND', 'Inspection was not found')
          )
        }

        const receipts = await transaction.findReceipts(
          membership.tenantId,
          'rfi_creation',
          keyHash
        )
        if (receipts.length > 0) {
          return this.replayRfi(transaction, {
            tenantId: membership.tenantId,
            actorId: principal.data.userId,
            opportunityId: opportunity.id,
            inspectionId: inspection.id,
            keyHash,
            commandHash,
            receipts,
          })
        }

        const createdAt = this.now()
        const rfi = await transaction.createRfi({
          tenantId: membership.tenantId,
          inspectionId: inspection.id,
          description: command.data.description,
          priority: command.data.priority,
          createdAt,
        })
        if (!rfi) throw new Error('RFI insert returned no row')

        const receipt = siteInspectionRfiReceiptSchema.parse({
          source: RFI_SOURCE,
          receipt_version: 1,
          submission_kind: 'rfi_creation',
          idempotency_key_hash: keyHash,
          command_hash: commandHash,
          tenant_id: membership.tenantId,
          actor_id: principal.data.userId,
          opportunity_id: opportunity.id,
          inspection_id: inspection.id,
          rfi_id: rfi.id,
          priority: command.data.priority,
          created_at: createdAt.toISOString(),
        })
        await transaction.writeAudit({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          entityType: 'site_inspection_rfi',
          entityId: rfi.id,
          action: 'create',
          diff: receipt,
        })

        return siteInspectionWorkflowResultSchema.parse({
          ok: true,
          kind: 'rfi_creation',
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          opportunityId: opportunity.id,
          inspectionId: inspection.id,
          rfiId: rfi.id,
          priority: command.data.priority,
          createdAt: createdAt.toISOString(),
          replayed: false,
        })
      })
    } catch {
      return failure(
        'INTERNAL_ERROR',
        'Inspection RFI could not be saved. Retry the submission.'
      )
    }
  }

  private async replayInspection(
    transaction: SiteInspectionWorkflowTransaction,
    input: {
      tenantId: string
      actorId: string
      opportunityId: string
      keyHash: string
      commandHash: string
      existing: { id: string; opportunityId: string } | null
      receipts: ReceiptRow[]
    }
  ): Promise<SiteInspectionWorkflowResult> {
    if (!input.existing || input.receipts.length !== 1) {
      return failure('CONFLICT', 'Inspection submission receipt is invalid')
    }
    const receipt = siteInspectionReceiptSchema.safeParse(input.receipts[0]?.diff)
    if (
      !receipt.success ||
      input.receipts[0]?.entityId !== receipt.data.inspection_id ||
      input.existing.id !== receipt.data.inspection_id ||
      input.existing.opportunityId !== receipt.data.opportunity_id ||
      receipt.data.tenant_id !== input.tenantId ||
      receipt.data.actor_id !== input.actorId ||
      receipt.data.opportunity_id !== input.opportunityId ||
      receipt.data.idempotency_key_hash !== input.keyHash
    ) {
      return failure('CONFLICT', 'Inspection submission receipt is invalid')
    }
    if (receipt.data.command_hash !== input.commandHash) {
      return failure(
        'CONFLICT',
        'Submission ID was already used for a different command'
      )
    }
    const inspection = await transaction.loadInspection(
      input.tenantId,
      receipt.data.inspection_id
    )
    const photoCount = await transaction.countInspectionPhotos(
      input.tenantId,
      receipt.data.inspection_id
    )
    const hasSla = await transaction.hasOpenDesignHandoffSla(
      input.tenantId,
      input.opportunityId
    )
    const notified = await transaction.findNotifiedDesignRecipientIds(
      input.tenantId,
      input.opportunityId,
      receipt.data.inspection_id
    )
    const notifiedRecipientSetIsComplete =
      new Set(notified).size === notified.length &&
      notified.length === receipt.data.notification_recipient_count &&
      notificationRecipientSetHash(notified) ===
        receipt.data.notification_recipient_set_hash
    if (
      !inspection ||
      inspection.tenantId !== input.tenantId ||
      inspection.opportunityId !== input.opportunityId ||
      inspection.status !== receipt.data.status ||
      inspection.submittedAt?.toISOString() !== receipt.data.submitted_at ||
      photoCount !== receipt.data.linked_photo_count ||
      !hasSla ||
      !notifiedRecipientSetIsComplete
    ) {
      return failure('CONFLICT', 'Inspection durable result is incomplete')
    }
    return siteInspectionWorkflowResultSchema.parse({
      ok: true,
      kind: 'inspection_submission',
      tenantId: input.tenantId,
      actorId: input.actorId,
      opportunityId: input.opportunityId,
      inspectionId: inspection.id,
      status: 'submitted',
      submittedAt: receipt.data.submitted_at,
      linkedPhotoCount: photoCount,
      replayed: true,
    })
  }

  private async replayRfi(
    transaction: SiteInspectionWorkflowTransaction,
    input: {
      tenantId: string
      actorId: string
      opportunityId: string
      inspectionId: string
      keyHash: string
      commandHash: string
      receipts: ReceiptRow[]
    }
  ): Promise<SiteInspectionWorkflowResult> {
    if (input.receipts.length !== 1) {
      return failure('CONFLICT', 'Inspection RFI receipt is ambiguous')
    }
    const receipt = siteInspectionRfiReceiptSchema.safeParse(
      input.receipts[0]?.diff
    )
    if (
      !receipt.success ||
      input.receipts[0]?.entityId !== receipt.data.rfi_id ||
      receipt.data.tenant_id !== input.tenantId ||
      receipt.data.actor_id !== input.actorId ||
      receipt.data.opportunity_id !== input.opportunityId ||
      receipt.data.inspection_id !== input.inspectionId ||
      receipt.data.idempotency_key_hash !== input.keyHash
    ) {
      return failure('CONFLICT', 'Inspection RFI receipt is invalid')
    }
    if (receipt.data.command_hash !== input.commandHash) {
      return failure(
        'CONFLICT',
        'Submission ID was already used for a different command'
      )
    }
    const rfi = await transaction.loadRfi(input.tenantId, receipt.data.rfi_id)
    if (
      !rfi ||
      rfi.tenantId !== input.tenantId ||
      rfi.inspectionId !== input.inspectionId ||
      rfi.priority !== receipt.data.priority ||
      rfi.createdAt.toISOString() !== receipt.data.created_at
    ) {
      return failure('CONFLICT', 'Inspection RFI durable result is incomplete')
    }
    return siteInspectionWorkflowResultSchema.parse({
      ok: true,
      kind: 'rfi_creation',
      tenantId: input.tenantId,
      actorId: input.actorId,
      opportunityId: input.opportunityId,
      inspectionId: input.inspectionId,
      rfiId: rfi.id,
      priority: receipt.data.priority,
      createdAt: receipt.data.created_at,
      replayed: true,
    })
  }
}

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

class DrizzleSiteInspectionWorkflowTransaction
  implements SiteInspectionWorkflowTransaction
{
  constructor(private readonly transaction: DatabaseTransaction) {}

  async lockMembership(principal: SiteInspectionWorkflowPrincipal) {
    const [row] = await this.transaction
      .select({ tenantId: users.tenant_id, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    return row ?? null
  }

  async lockCommand(tenantId: string, keyHash: string): Promise<void> {
    await this.transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'site-inspection-command:' + tenantId + ':' + keyHash}, 0))`
    )
  }

  async lockOpportunity(tenantId: string, opportunityId: string) {
    const [row] = await this.transaction
      .select({
        id: opportunities.id,
        tenantId: opportunities.tenant_id,
        projectId: opportunities.project_id,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenant_id, tenantId),
          eq(opportunities.id, opportunityId)
        )
      )
      .limit(1)
      .for('update')
    return row ?? null
  }

  async hasPprf(tenantId: string, opportunityId: string): Promise<boolean> {
    const [row] = await this.transaction
      .select({ id: pprfSubmissions.id })
      .from(pprfSubmissions)
      .where(
        and(
          eq(pprfSubmissions.tenant_id, tenantId),
          eq(pprfSubmissions.opportunity_id, opportunityId)
        )
      )
      .limit(1)
    return Boolean(row)
  }

  async findInspectionBySubmission(tenantId: string, submissionId: string) {
    const [row] = await this.transaction
      .select({
        id: siteInspections.id,
        opportunityId: siteInspections.opportunity_id,
      })
      .from(siteInspections)
      .where(
        and(
          eq(siteInspections.tenant_id, tenantId),
          eq(siteInspections.client_submission_id, submissionId)
        )
      )
      .limit(1)
    return row ?? null
  }

  async findReceipts(
    tenantId: string,
    kind: ReceiptKind,
    keyHash: string
  ) {
    const entityType =
      kind === 'inspection_submission' ? 'site_inspection' : 'site_inspection_rfi'
    const source = kind === 'inspection_submission' ? INSPECTION_SOURCE : RFI_SOURCE
    return this.transaction
      .select({ entityId: auditLog.entity_id, diff: auditLog.diff })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenant_id, tenantId),
          eq(auditLog.entity_type, entityType),
          eq(auditLog.action, 'create'),
          sql`${auditLog.diff} ->> 'source' = ${source}`,
          sql`${auditLog.diff} ->> 'submission_kind' = ${kind}`,
          sql`${auditLog.diff} ->> 'idempotency_key_hash' = ${keyHash}`
        )
      )
      .limit(2)
  }

  async loadInspection(tenantId: string, inspectionId: string) {
    const [row] = await this.transaction
      .select({
        id: siteInspections.id,
        tenantId: siteInspections.tenant_id,
        opportunityId: siteInspections.opportunity_id,
        status: siteInspections.status,
        submittedAt: siteInspections.submitted_at,
      })
      .from(siteInspections)
      .where(
        and(
          eq(siteInspections.tenant_id, tenantId),
          eq(siteInspections.id, inspectionId)
        )
      )
      .limit(1)
    return row ?? null
  }

  async lockInspection(tenantId: string, inspectionId: string) {
    const [row] = await this.transaction
      .select({
        id: siteInspections.id,
        tenantId: siteInspections.tenant_id,
        opportunityId: siteInspections.opportunity_id,
      })
      .from(siteInspections)
      .where(
        and(
          eq(siteInspections.tenant_id, tenantId),
          eq(siteInspections.id, inspectionId)
        )
      )
      .limit(1)
      .for('update')
    return row ?? null
  }

  async loadRfi(tenantId: string, rfiId: string) {
    const [row] = await this.transaction
      .select({
        id: siteInspectionRfis.id,
        tenantId: siteInspectionRfis.tenant_id,
        inspectionId: siteInspectionRfis.inspection_id,
        priority: siteInspectionRfis.priority,
        createdAt: siteInspectionRfis.created_at,
      })
      .from(siteInspectionRfis)
      .where(
        and(
          eq(siteInspectionRfis.tenant_id, tenantId),
          eq(siteInspectionRfis.id, rfiId)
        )
      )
      .limit(1)
    return row ?? null
  }

  async loadPhotoDocuments(tenantId: string, documentIds: readonly string[]) {
    if (documentIds.length === 0) return []
    return this.transaction
      .select({
        id: documents.id,
        tenantId: documents.tenant_id,
        opportunityId: documents.opportunity_id,
        projectId: documents.project_id,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenant_id, tenantId),
          inArray(documents.id, [...documentIds])
        )
      )
  }

  async countInspectionPhotos(tenantId: string, inspectionId: string) {
    const rows = await this.transaction
      .select({ id: siteInspectionPhotos.id })
      .from(siteInspectionPhotos)
      .where(
        and(
          eq(siteInspectionPhotos.tenant_id, tenantId),
          eq(siteInspectionPhotos.inspection_id, inspectionId)
        )
      )
    return rows.length
  }

  async hasOpenDesignHandoffSla(tenantId: string, opportunityId: string) {
    const [row] = await this.transaction
      .select({ id: slaLogs.id })
      .from(slaLogs)
      .where(
        and(
          eq(slaLogs.tenant_id, tenantId),
          eq(slaLogs.entity_type, 'opportunity'),
          eq(slaLogs.entity_id, opportunityId),
          eq(slaLogs.sla_label, 'inspection.design_handoff'),
          isNull(slaLogs.completed_at)
        )
      )
      .limit(1)
    return Boolean(row)
  }

  async findDesignRecipients(tenantId: string) {
    return this.transaction
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.tenant_id, tenantId), eq(users.role, 'design')))
  }

  async findNotifiedDesignRecipientIds(
    tenantId: string,
    opportunityId: string,
    inspectionId: string
  ) {
    const rows = await this.transaction
      .select({ id: notifications.recipient_user_id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenant_id, tenantId),
          eq(notifications.channel, 'in_app'),
          eq(notifications.subject, 'Site Inspection ready for design'),
          eq(
            notifications.link_url,
            `/crm/opportunities/${opportunityId}/proposal/inspection`
          ),
          sql`${notifications.payload} ->> 'source' = ${INSPECTION_SOURCE}`,
          sql`${notifications.payload} ->> 'inspection_id' = ${inspectionId}`
        )
      )
    return rows.flatMap((row) => (row.id ? [row.id] : []))
  }

  async createInspection(
    input: Parameters<SiteInspectionWorkflowTransaction['createInspection']>[0]
  ) {
    const [row] = await this.transaction
      .insert(siteInspections)
      .values({
        tenant_id: input.tenantId,
        opportunity_id: input.opportunityId,
        client_submission_id: input.submissionId,
        status: 'submitted',
        payload: input.payload,
        submitted_at: input.submittedAt,
        submitted_by: input.actorId,
      })
      .returning({ id: siteInspections.id })
    return row ?? null
  }

  async createPhotoLinks(
    rows: Parameters<SiteInspectionWorkflowTransaction['createPhotoLinks']>[0]
  ): Promise<void> {
    if (rows.length === 0) return
    await this.transaction.insert(siteInspectionPhotos).values(
      rows.map((row) => ({
        tenant_id: row.tenantId,
        inspection_id: row.inspectionId,
        document_id: row.documentId,
      }))
    )
  }

  async writeAudit(
    input: Parameters<SiteInspectionWorkflowTransaction['writeAudit']>[0]
  ): Promise<void> {
    await writeAuditLogInTransaction(this.transaction, input)
  }

  async ensureDesignHandoffSla(
    tenantId: string,
    opportunityId: string
  ): Promise<void> {
    if (await this.hasOpenDesignHandoffSla(tenantId, opportunityId)) return
    await this.transaction.insert(slaLogs).values({
      tenant_id: tenantId,
      entity_type: 'opportunity',
      entity_id: opportunityId,
      sla_label: 'inspection.design_handoff',
      sla_seconds: SLA_CONFIG['inspection.design_handoff'],
    })
  }

  async createNotification(
    input: Parameters<SiteInspectionWorkflowTransaction['createNotification']>[0]
  ): Promise<void> {
    await this.transaction.insert(notifications).values({
      tenant_id: input.tenantId,
      recipient_user_id: input.recipientUserId,
      recipient_email: input.recipientEmail,
      channel: 'in_app',
      subject: input.subject,
      body: input.body,
      link_url: input.linkUrl,
      payload: {
        source: INSPECTION_SOURCE,
        inspection_id: input.inspectionId,
      },
    })
  }

  async createRfi(
    input: Parameters<SiteInspectionWorkflowTransaction['createRfi']>[0]
  ) {
    const [row] = await this.transaction
      .insert(siteInspectionRfis)
      .values({
        tenant_id: input.tenantId,
        inspection_id: input.inspectionId,
        description: input.description,
        priority: input.priority,
        created_at: input.createdAt,
      })
      .returning({ id: siteInspectionRfis.id })
    return row ?? null
  }
}

const drizzleSiteInspectionWorkflowStore: SiteInspectionWorkflowStore = {
  transaction: (callback) =>
    db.transaction((transaction) =>
      callback(new DrizzleSiteInspectionWorkflowTransaction(transaction))
    ),
}

export const siteInspectionWorkflowService = new SiteInspectionWorkflowService(
  drizzleSiteInspectionWorkflowStore
)
