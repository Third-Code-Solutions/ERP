import 'reflect-metadata'

import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'

import {
  encodeDocumentUploadReservationReconciliationCursor,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_PAGE_SIZE,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX,
} from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationReconciliationQueue } from './document-upload-reservation-reconciliation.queue'
import type { DocumentUploadReservationReconciliationService } from './document-upload-reservation-reconciliation.service'

const TENANT_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdef'

function harness(
  tenantIds: readonly string[],
  existingScheduler?: Record<string, unknown>
) {
  const queue = {
    add: vi.fn().mockResolvedValue(undefined),
    getJobScheduler: vi.fn().mockResolvedValue(existingScheduler),
    setGlobalConcurrency: vi.fn().mockResolvedValue(1),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue
  const reconciliation = {
    scopedTenantIds: vi.fn().mockReturnValue([...tenantIds]),
  } as unknown as DocumentUploadReservationReconciliationService
  return {
    queue,
    producer: new DocumentUploadReservationReconciliationQueue(
      queue,
      reconciliation
    ),
  }
}

describe('DocumentUploadReservationReconciliationQueue', () => {
  it('creates no scheduler while the exact-tenant selector is closed', async () => {
    const probe = harness([])

    await expect(probe.producer.onApplicationBootstrap()).resolves.toBeUndefined()
    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
    expect(probe.queue.setGlobalConcurrency).not.toHaveBeenCalled()
  })

  it('creates one deterministic versioned scheduler per selected tenant', async () => {
    const probe = harness([TENANT_ID.toUpperCase(), TENANT_ID])

    await probe.producer.onApplicationBootstrap()

    expect(probe.queue.setGlobalConcurrency).toHaveBeenCalledWith(1)
    expect(probe.queue.getJobScheduler).toHaveBeenCalledWith(
      `${DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX}-${TENANT_ID}`
    )
    expect(probe.queue.upsertJobScheduler).toHaveBeenCalledWith(
      `${DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX}-${TENANT_ID}`,
      { every: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS },
      {
        name: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
        data: {
          schemaVersion: 1,
          tenantId: TENANT_ID,
          pageSize: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_PAGE_SIZE,
        },
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
    expect(probe.queue.upsertJobScheduler).toHaveBeenCalledTimes(1)
  })

  it('preserves a valid rollover checkpoint across application bootstrap', async () => {
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 1,
      storageCursor: 'tail-page',
    })
    const probe = harness([TENANT_ID], {
      name: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
      every: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS,
      template: {
        data: { schemaVersion: 1, tenantId: TENANT_ID, pageSize: 25, cursor },
      },
    })

    await expect(probe.producer.onApplicationBootstrap()).resolves.toBeUndefined()

    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
  })

  it('fails closed for a scheduler checkpoint that is not at a run boundary', async () => {
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 2,
      storageCursor: 'tail-page',
    })
    const probe = harness([TENANT_ID], {
      name: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
      every: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS,
      template: {
        data: { schemaVersion: 1, tenantId: TENANT_ID, pageSize: 25, cursor },
      },
    })

    await expect(probe.producer.onApplicationBootstrap()).rejects.toThrow(
      'Invalid document upload reconciliation scheduler'
    )
    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
  })

  it('persists rollover progress and resets only after a completed scan', async () => {
    const probe = harness([])
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 1,
      storageCursor: 'tail-page',
    })

    await probe.producer.persistRollover({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      pageSize: 25,
      cursor,
    })
    await probe.producer.resetCheckpoint(TENANT_ID, 25)

    expect(probe.queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      1,
      `${DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX}-${TENANT_ID}`,
      { every: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS },
      expect.objectContaining({
        data: { schemaVersion: 1, tenantId: TENANT_ID, pageSize: 25, cursor },
      })
    )
    expect(probe.queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      2,
      `${DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX}-${TENANT_ID}`,
      { every: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS },
      expect.objectContaining({
        data: { schemaVersion: 1, tenantId: TENANT_ID, pageSize: 25 },
      })
    )
  })

  it('enqueues a strictly validated continuation with a stable source-bound identity', async () => {
    const probe = harness([])
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'completed',
      page: 1,
    })
    const command = {
      schemaVersion: 1 as const,
      tenantId: TENANT_ID,
      pageSize: 25,
      cursor,
    }

    await probe.producer.enqueueContinuation(command, 'source-job')
    await probe.producer.enqueueContinuation(command, 'source-job')

    expect(probe.queue.add).toHaveBeenCalledTimes(2)
    const firstOptions = vi.mocked(probe.queue.add).mock.calls[0]?.[2]
    const secondOptions = vi.mocked(probe.queue.add).mock.calls[1]?.[2]
    expect(firstOptions?.jobId).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/))
    expect(secondOptions?.jobId).toBe(firstOptions?.jobId)
    expect(probe.queue.add).toHaveBeenCalledWith(
      DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
      command,
      expect.objectContaining({ attempts: 1 })
    )
  })

  it('rejects missing cursors and out-of-contract continuations before Redis', async () => {
    const probe = harness([])

    await expect(
      probe.producer.enqueueContinuation(
        { schemaVersion: 1, tenantId: TENANT_ID, pageSize: 25 },
        'source-job'
      )
    ).rejects.toThrow('continuation')
    await expect(
      probe.producer.enqueueContinuation(
        {
          schemaVersion: 1,
          tenantId: TENANT_ID,
          pageSize: 51,
          cursor: 'opaque',
        },
        'source-job'
      )
    ).rejects.toThrow()
    await expect(
      probe.producer.enqueueContinuation(
        {
          schemaVersion: 1,
          tenantId: TENANT_ID,
          pageSize: 25,
          cursor: 'opaque',
        },
        'source-job'
      )
    ).rejects.toThrow('cursor')
    expect(probe.queue.add).not.toHaveBeenCalled()
  })

  it('rejects a non-reset rollover cursor before changing scheduler state', async () => {
    const probe = harness([])
    const cursor = encodeDocumentUploadReservationReconciliationCursor({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      phase: 'objects',
      page: 2,
      storageCursor: 'tail-page',
    })

    await expect(
      probe.producer.persistRollover({
        schemaVersion: 1,
        tenantId: TENANT_ID,
        pageSize: 25,
        cursor,
      })
    ).rejects.toThrow('rollover')
    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
  })
})
