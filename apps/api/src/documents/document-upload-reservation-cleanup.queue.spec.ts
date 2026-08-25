import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_INTERVAL_MS,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER_REMOVE_TIMEOUT_MS,
} from './document-upload-reservation-cleanup.constants'
import { DocumentUploadReservationCleanupQueue } from './document-upload-reservation-cleanup.queue'
import type { DocumentUploadReservationCleanupService } from './document-upload-reservation-cleanup.service'

function harness(tenantIds: readonly string[]) {
  const queue = {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  } as unknown as Queue
  const cleanup = {
    scopedTenantIds: vi.fn().mockReturnValue([...tenantIds]),
  } as unknown as DocumentUploadReservationCleanupService
  return {
    queue,
    cleanup,
    producer: new DocumentUploadReservationCleanupQueue(queue, cleanup),
  }
}

describe('DocumentUploadReservationCleanupQueue', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not create a scheduler while the cleanup scope is closed', async () => {
    const probe = harness([])

    await expect(probe.producer.onApplicationBootstrap()).resolves.toBeUndefined()

    expect(probe.cleanup.scopedTenantIds).toHaveBeenCalledOnce()
    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
    expect(probe.queue.removeJobScheduler).toHaveBeenCalledWith(
      DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER
    )
  })

  it('creates one deterministic scheduler for an explicitly scoped cleanup lane', async () => {
    const probe = harness(['22222222-2222-4222-8222-222222222222'])

    await expect(probe.producer.onApplicationBootstrap()).resolves.toBeUndefined()

    expect(probe.queue.upsertJobScheduler).toHaveBeenCalledWith(
      DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER,
      { every: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_INTERVAL_MS },
      {
        name: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB,
        data: { schemaVersion: 1 },
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
    expect(probe.queue.removeJobScheduler).not.toHaveBeenCalled()
  })

  it('keeps the closed data plane safe when scheduler removal is unavailable', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const probe = harness([])
    vi.mocked(probe.queue.removeJobScheduler).mockRejectedValue(
      new Error('redis secret')
    )

    await expect(probe.producer.onApplicationBootstrap()).resolves.toBeUndefined()

    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('redis secret')
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      action: 'document.upload_cleanup_scheduler_remove',
      outcome: 'failed',
      error_code: 'SCHEDULER_REMOVE_FAILED',
    })
  })

  it('bounds rollback scheduler reconciliation when Redis does not settle', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const probe = harness([])
    vi.mocked(probe.queue.removeJobScheduler).mockReturnValue(
      new Promise<boolean>(() => {})
    )

    const bootstrap = probe.producer.onApplicationBootstrap()
    await vi.advanceTimersByTimeAsync(
      DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER_REMOVE_TIMEOUT_MS
    )

    await expect(bootstrap).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    expect(probe.queue.upsertJobScheduler).not.toHaveBeenCalled()
  })
})
