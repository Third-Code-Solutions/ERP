import { createHash, randomUUID } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documents,
  documentUploadReservations,
} from '@third-code-erp/database'
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
} from 'drizzle-orm'
import { z } from 'zod'

import type { Environment } from '../config/environment'
import { DatabaseService } from '../database/database.service'
import {
  decodeDocumentUploadReservationReconciliationCursor,
  documentUploadReservationReconciliationJobSchema,
  encodeDocumentUploadReservationReconciliationCursor,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES,
  type DocumentUploadReservationReconciliationCursor,
  type DocumentUploadReservationReconciliationJob,
} from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationStorage } from './document-upload-reservation.storage'

type TerminalCleanupFinding = Readonly<{
  category: 'terminal_cleanup_incomplete'
  reservationId: string
  projectId: string
  state: 'released' | 'expired'
  cleanupAttemptCount: number
}>

type CompletedDocumentFinding = Readonly<{
  category: 'completed_document_inconsistent'
  reservationId: string
  projectId: string
  documentId: string | null
  inconsistency: 'document_missing' | 'storage_path_mismatch'
}>

type OrphanObjectFinding = Readonly<{
  category: 'orphan_reservation_object'
  reservationId: string
  projectId: string
  objectKeyHash: string
  createdAt: string
}>

export type DocumentUploadReservationReconciliationFinding =
  | TerminalCleanupFinding
  | CompletedDocumentFinding
  | OrphanObjectFinding

export type DocumentUploadReservationReconciliationResult = Readonly<{
  status: 'ignored' | 'succeeded'
  tenantId: string
  phase: 'terminal' | 'completed' | 'objects'
  scanned: number
  findings: readonly DocumentUploadReservationReconciliationFinding[]
  nextCursor?: string
  rolloverCursor?: string
}>

type ReconciliationCursorWithoutPage =
  | Omit<
      Extract<
        DocumentUploadReservationReconciliationCursor,
        { phase: 'terminal' }
      >,
      'page'
    >
  | Omit<
      Extract<
        DocumentUploadReservationReconciliationCursor,
        { phase: 'completed' }
      >,
      'page'
    >
  | Omit<
      Extract<
        DocumentUploadReservationReconciliationCursor,
        { phase: 'objects' }
      >,
      'page'
    >

const uuidSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase())
const canonicalReservationFileNameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/)
  .refine((fileName) => !fileName.includes('..'))

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function reconciliationContinuation(
  currentPage: number,
  cursor: ReconciliationCursorWithoutPage
): Readonly<{ nextCursor: string } | { rolloverCursor: string }> {
  const rollover =
    currentPage >= DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES
  const page = rollover ? 1 : currentPage + 1
  let encoded: string
  if (cursor.phase === 'terminal') {
    encoded = encodeDocumentUploadReservationReconciliationCursor({
      ...cursor,
      page,
    })
  } else if (cursor.phase === 'completed') {
    encoded = encodeDocumentUploadReservationReconciliationCursor({
      ...cursor,
      page,
    })
  } else {
    encoded = encodeDocumentUploadReservationReconciliationCursor({
      ...cursor,
      page,
    })
  }
  return rollover
    ? { rolloverCursor: encoded }
    : { nextCursor: encoded }
}

function reservationObjectIdentity(
  storagePath: string,
  tenantId: string
): Readonly<{ reservationId: string; projectId: string }> | null {
  const segments = storagePath.split('/')
  if (segments.length !== 3 || segments[0] !== tenantId) return null
  const projectId = uuidSchema.safeParse(segments[1])
  const objectName = segments[2]
  if (!objectName) return null
  const separator = 36
  if (
    !projectId.success ||
    objectName[separator] !== '-' ||
    separator === objectName.length - 1
  ) {
    return null
  }
  const reservationId = uuidSchema.safeParse(objectName.slice(0, separator))
  const fileName = canonicalReservationFileNameSchema.safeParse(
    objectName.slice(separator + 1)
  )
  if (!reservationId.success || !fileName.success) return null
  return { reservationId: reservationId.data, projectId: projectId.data }
}

@Injectable()
export class DocumentUploadReservationReconciliationService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(DocumentUploadReservationStorage)
    private readonly storage: DocumentUploadReservationStorage
  ) {}

  scopedTenantIds(): string[] {
    if (
      this.config.get(
        'ERP_DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ENABLED',
        { infer: true }
      ) !== true
    ) {
      return []
    }
    return [
      ...new Set(
        this.config.get(
          'ERP_DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_TENANT_IDS',
          { infer: true }
        ).map((tenantId) => tenantId.toLowerCase())
      ),
    ].sort()
  }

  async runPage(
    command: DocumentUploadReservationReconciliationJob,
    _traceId: string = randomUUID(),
    now: Date = new Date()
  ): Promise<DocumentUploadReservationReconciliationResult> {
    const parsed = documentUploadReservationReconciliationJobSchema.parse(command)
    const cursor = parsed.cursor
      ? decodeDocumentUploadReservationReconciliationCursor(
          parsed.cursor,
          parsed.tenantId
        )
      : undefined
    const phase = cursor?.phase ?? 'terminal'
    const currentPage = cursor?.page ?? 1
    if (!this.scopedTenantIds().includes(parsed.tenantId)) {
      return {
        status: 'ignored',
        tenantId: parsed.tenantId,
        phase,
        scanned: 0,
        findings: [],
      }
    }

    if (!cursor || cursor.phase === 'terminal') {
      return this.reportTerminalPage(parsed, cursor, currentPage)
    }
    if (cursor.phase === 'completed') {
      return this.reportCompletedPage(parsed, cursor, currentPage)
    }
    return this.reportObjectPage(parsed, cursor, currentPage, now)
  }

  private async reportTerminalPage(
    command: DocumentUploadReservationReconciliationJob,
    cursor: Extract<
      DocumentUploadReservationReconciliationCursor,
      { phase: 'terminal' }
    > | undefined,
    currentPage: number
  ): Promise<DocumentUploadReservationReconciliationResult> {
    const rows = await this.database.client
      .select({
        id: documentUploadReservations.id,
        projectId: documentUploadReservations.project_id,
        state: documentUploadReservations.state,
        cleanupAttemptCount:
          documentUploadReservations.cleanup_attempt_count,
        cleanupCompletedAt:
          documentUploadReservations.cleanup_completed_at,
      })
      .from(documentUploadReservations)
      .where(
        and(
          eq(documentUploadReservations.tenant_id, command.tenantId),
          inArray(documentUploadReservations.state, ['released', 'expired']),
          isNull(documentUploadReservations.cleanup_completed_at),
          cursor
            ? gt(documentUploadReservations.id, cursor.afterId)
            : undefined
        )
      )
      .orderBy(asc(documentUploadReservations.id))
      .limit(command.pageSize + 1)
    const page = rows.slice(0, command.pageSize)
    const hasNext = rows.length > command.pageSize
    const last = page.at(-1)
    const continuation = hasNext
      ? last &&
        reconciliationContinuation(currentPage, {
          schemaVersion: 1,
          tenantId: command.tenantId,
          phase: 'terminal',
          afterId: last.id,
        })
      : reconciliationContinuation(currentPage, {
          schemaVersion: 1,
          tenantId: command.tenantId,
          phase: 'completed',
        })

    return {
      status: 'succeeded',
      tenantId: command.tenantId,
      phase: 'terminal',
      scanned: page.length,
      findings: page.flatMap((row) =>
        row.cleanupCompletedAt === null &&
        (row.state === 'released' || row.state === 'expired')
          ? [
              {
                category: 'terminal_cleanup_incomplete' as const,
                reservationId: row.id,
                projectId: row.projectId,
                state: row.state,
                cleanupAttemptCount: row.cleanupAttemptCount,
              },
            ]
          : []
      ),
      ...continuation,
    }
  }

  private async reportCompletedPage(
    command: DocumentUploadReservationReconciliationJob,
    cursor: Extract<
      DocumentUploadReservationReconciliationCursor,
      { phase: 'completed' }
    >,
    currentPage: number
  ): Promise<DocumentUploadReservationReconciliationResult> {
    const rows = await this.database.client
      .select({
        id: documentUploadReservations.id,
        projectId: documentUploadReservations.project_id,
        storagePath: documentUploadReservations.storage_path,
        documentId: documentUploadReservations.document_id,
        linkedDocumentId: documents.id,
        linkedStoragePath: documents.storage_path,
      })
      .from(documentUploadReservations)
      .leftJoin(
        documents,
        and(
          eq(documents.id, documentUploadReservations.document_id),
          eq(documents.tenant_id, documentUploadReservations.tenant_id),
          eq(documents.project_id, documentUploadReservations.project_id)
        )
      )
      .where(
        and(
          eq(documentUploadReservations.tenant_id, command.tenantId),
          eq(documentUploadReservations.state, 'completed'),
          cursor.afterId
            ? gt(documentUploadReservations.id, cursor.afterId)
            : undefined
        )
      )
      .orderBy(asc(documentUploadReservations.id))
      .limit(command.pageSize + 1)
    const page = rows.slice(0, command.pageSize)
    const findings: CompletedDocumentFinding[] = []
    for (const row of page) {
      if (!row.documentId || !row.linkedDocumentId) {
        findings.push({
          category: 'completed_document_inconsistent',
          reservationId: row.id,
          projectId: row.projectId,
          documentId: row.documentId,
          inconsistency: 'document_missing',
        })
      } else if (row.linkedStoragePath !== row.storagePath) {
        findings.push({
          category: 'completed_document_inconsistent',
          reservationId: row.id,
          projectId: row.projectId,
          documentId: row.documentId,
          inconsistency: 'storage_path_mismatch',
        })
      }
    }
    const hasNext = rows.length > command.pageSize
    const last = page.at(-1)
    const continuation = hasNext
      ? last &&
        reconciliationContinuation(currentPage, {
          schemaVersion: 1,
          tenantId: command.tenantId,
          phase: 'completed',
          afterId: last.id,
        })
      : reconciliationContinuation(currentPage, {
          schemaVersion: 1,
          tenantId: command.tenantId,
          phase: 'objects',
        })

    return {
      status: 'succeeded',
      tenantId: command.tenantId,
      phase: 'completed',
      scanned: page.length,
      findings,
      ...continuation,
    }
  }

  private async reportObjectPage(
    command: DocumentUploadReservationReconciliationJob,
    cursor: Extract<
      DocumentUploadReservationReconciliationCursor,
      { phase: 'objects' }
    >,
    currentPage: number,
    now: Date
  ): Promise<DocumentUploadReservationReconciliationResult> {
    const page = await this.storage.listReservationObjects({
      tenantId: command.tenantId,
      cursor: cursor.storageCursor,
      limit: command.pageSize,
    })
    if (
      page.hasNext &&
      (!page.nextCursor || page.nextCursor === cursor.storageCursor)
    ) {
      throw new Error('Document upload object listing did not advance')
    }
    const olderThan = now.getTime() -
      DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS
    const candidates = page.objects.flatMap((object) => {
      const identity = reservationObjectIdentity(
        object.storagePath,
        command.tenantId
      )
      return identity && object.createdAt.getTime() < olderThan
        ? [{ ...identity, ...object }]
        : []
    })
    const candidateIds = [
      ...new Set(candidates.map(({ reservationId }) => reservationId)),
    ]
    const ledgerRows =
      candidateIds.length === 0
        ? []
        : await this.database.client
            .select({ id: documentUploadReservations.id })
            .from(documentUploadReservations)
            .where(
              and(
                eq(documentUploadReservations.tenant_id, command.tenantId),
                inArray(documentUploadReservations.id, candidateIds)
              )
            )
    const ledgerIds = new Set(ledgerRows.map(({ id }) => id))
    const findings: OrphanObjectFinding[] = candidates
      .filter(({ reservationId }) => !ledgerIds.has(reservationId))
      .map((candidate) => ({
        category: 'orphan_reservation_object',
        reservationId: candidate.reservationId,
        projectId: candidate.projectId,
        objectKeyHash: sha256(candidate.storagePath),
        createdAt: candidate.createdAt.toISOString(),
      }))

    return {
      status: 'succeeded',
      tenantId: command.tenantId,
      phase: 'objects',
      scanned: page.objects.length,
      findings,
      ...(page.hasNext && page.nextCursor
        ? reconciliationContinuation(currentPage, {
                schemaVersion: 1,
                tenantId: command.tenantId,
                phase: 'objects',
                storageCursor: page.nextCursor,
              })
        : {}),
    }
  }
}
