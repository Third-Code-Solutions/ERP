import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
  type DocumentUploadReservationReconciliationJob,
} from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationReconciliationProcessor } from './document-upload-reservation-reconciliation.processor'
import type { DocumentUploadReservationReconciliationQueue } from './document-upload-reservation-reconciliation.queue'
import type { DocumentUploadReservationReconciliationService } from './document-upload-reservation-reconciliation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RESERVATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'scheduled-job-id',
    name: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
    data: { schemaVersion: 1, tenantId: TENANT_ID, pageSize: 25 },
    attemptsMade: 0,
    opts: { attempts: 1 },
    ...overrides,
  } as Job
}

function harness() {
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
  const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  const reconciliation = {
    runPage: vi.fn().mockResolvedValue({
      status: 'succeeded',
      tenantId: TENANT_ID,
      phase: 'terminal',
      scanned: 1,
      findings: [
        {
          category: 'terminal_cleanup_incomplete',
          reservationId: RESERVATION_ID,
          projectId: PROJECT_ID,
          state: 'expired',
          cleanupAttemptCount: 2,
        },
      ],
      nextCursor: 'opaque-next-cursor',
    }),
  } as unknown as DocumentUploadReservationReconciliationService
  const queue = {
    enqueueContinuation: vi.fn().mockResolvedValue(undefined),
    persistRollover: vi.fn().mockResolvedValue(undefined),
    resetCheckpoint: vi.fn().mockResolvedValue(undefined),
  } as unknown as DocumentUploadReservationReconciliationQueue
  return {
    reconciliation,
    queue,
    log,
    error,
    processor: new DocumentUploadReservationReconciliationProcessor(
      reconciliation,
      queue
    ),
  }
}

describe('DocumentUploadReservationReconciliationProcessor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs only bounded report metadata and chains a finite continuation', async () => {
    const probe = harness()

    const result = await probe.processor.process(job() as Job<
      DocumentUploadReservationReconciliationJob,
      unknown,
      string
    >)

    expect(result.findings).toHaveLength(1)
    const event = JSON.parse(String(probe.log.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >
    expect(event).toMatchObject({
      event: 'erp.document.upload_reconciliation.job',
      tenant_id: TENANT_ID,
      actor_id: null,
      action: 'document.upload_reconciliation',
      outcome: 'succeeded',
      phase: 'terminal',
      scanned_total: 1,
      reported_total: 1,
      terminal_cleanup_incomplete_total: 1,
      completed_document_inconsistent_total: 0,
      orphan_reservation_object_total: 0,
      has_more: true,
      rollover_scheduled: false,
    })
    expect(event.trace_id).toEqual(expect.stringMatching(/^[a-f0-9-]{36}$/))
    expect(event.finding_ids_hash).toEqual(
      expect.stringMatching(/^[a-f0-9]{64}$/)
    )
    expect(probe.queue.enqueueContinuation).toHaveBeenCalledWith(
      {
        schemaVersion: 1,
        tenantId: TENANT_ID,
        pageSize: 25,
        cursor: 'opaque-next-cursor',
      },
      'scheduled-job-id'
    )
    expect(JSON.stringify(event)).not.toContain('storagePath')
    expect(probe.error).not.toHaveBeenCalled()
  })

  it('persists a rollover for the next scheduled run and resets after object completion', async () => {
    const probe = harness()
    vi.mocked(probe.reconciliation.runPage).mockResolvedValueOnce({
      status: 'succeeded',
      tenantId: TENANT_ID,
      phase: 'objects',
      scanned: 25,
      findings: [],
      rolloverCursor: 'opaque-rollover-cursor',
    })

    await probe.processor.process(job() as never)

    expect(probe.queue.persistRollover).toHaveBeenCalledWith({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      pageSize: 25,
      cursor: 'opaque-rollover-cursor',
    })
    expect(probe.queue.enqueueContinuation).not.toHaveBeenCalled()
    expect(probe.queue.resetCheckpoint).not.toHaveBeenCalled()
    const rolloverEvent = JSON.parse(String(probe.log.mock.calls[0]?.[0]))
    expect(rolloverEvent).toMatchObject({
      has_more: true,
      rollover_scheduled: true,
    })

    vi.mocked(probe.reconciliation.runPage).mockResolvedValueOnce({
      status: 'succeeded',
      tenantId: TENANT_ID,
      phase: 'objects',
      scanned: 0,
      findings: [],
    })
    await probe.processor.process(job({ id: 'later-scheduled-job' }) as never)

    expect(probe.queue.resetCheckpoint).toHaveBeenCalledWith(TENANT_ID, 25)
  })

  it('rejects malformed jobs without exposing untrusted tenant data', async () => {
    const probe = harness()

    await expect(
      probe.processor.process(
        job({
          data: {
            schemaVersion: 2,
            tenantId: 'attacker-tenant-path-or-token',
            pageSize: 999,
          },
        }) as never
      )
    ).rejects.toThrow('Document upload reconciliation failed')
    expect(probe.reconciliation.runPage).not.toHaveBeenCalled()
    expect(probe.queue.enqueueContinuation).not.toHaveBeenCalled()
    expect(probe.queue.persistRollover).not.toHaveBeenCalled()
    expect(probe.queue.resetCheckpoint).not.toHaveBeenCalled()
    const event = JSON.parse(String(probe.error.mock.calls[0]?.[0]))
    expect(event).toMatchObject({ tenant_id: null, outcome: 'failed' })
    expect(JSON.stringify(event)).not.toContain('attacker-tenant')
  })

  it('redacts provider failures from logs and the queued job failure', async () => {
    const probe = harness()
    vi.mocked(probe.reconciliation.runPage).mockRejectedValue(
      new Error('provider-secret-token private/object/path.pdf')
    )

    await expect(
      probe.processor.process(job() as never)
    ).rejects.toThrow('Document upload reconciliation failed')
    const event = String(probe.error.mock.calls[0]?.[0])
    expect(event).not.toContain('provider-secret-token')
    expect(event).not.toContain('private/object/path.pdf')
    expect(probe.queue.enqueueContinuation).not.toHaveBeenCalled()
    expect(probe.queue.persistRollover).not.toHaveBeenCalled()
    expect(probe.queue.resetCheckpoint).not.toHaveBeenCalled()
  })
})
