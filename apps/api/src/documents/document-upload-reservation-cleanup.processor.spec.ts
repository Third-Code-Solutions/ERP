import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB } from './document-upload-reservation-cleanup.constants'
import { DocumentUploadReservationCleanupProcessor } from './document-upload-reservation-cleanup.processor'
import type { DocumentUploadReservationCleanupService } from './document-upload-reservation-cleanup.service'

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'document-upload-reservation-cleanup-scheduler-v1',
    name: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB,
    data: { schemaVersion: 1 },
    attemptsMade: 0,
    opts: { attempts: 1 },
    ...overrides,
  } as Job
}

function harness() {
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
  const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  const cleanup = {
    runBatch: vi.fn().mockResolvedValue({
      status: 'succeeded',
      expired: 1,
      claimed: 1,
      removed: 1,
      failed: 0,
      cleanupRetries: 0,
      exhausted: 0,
      oldestExpiredAgeSeconds: 4,
    }),
  } as unknown as DocumentUploadReservationCleanupService
  return {
    cleanup,
    log,
    error,
    processor: new DocumentUploadReservationCleanupProcessor(cleanup),
  }
}

describe('DocumentUploadReservationCleanupProcessor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts only the versioned cleanup command and returns its bounded result', async () => {
    const probe = harness()

    await expect(probe.processor.process(job())).resolves.toEqual({
      status: 'succeeded',
      expired: 1,
      claimed: 1,
      removed: 1,
      failed: 0,
      cleanupRetries: 0,
      exhausted: 0,
      oldestExpiredAgeSeconds: 4,
    })
    const event = JSON.parse(String(probe.log.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >
    expect(event).toMatchObject({
      event: 'erp.document.upload_cleanup.job',
      tenant_id: null,
      actor_id: null,
      action: 'document.upload_cleanup',
      outcome: 'succeeded',
      cleanup_retries_total: 0,
      cleanup_exhausted_total: 0,
      oldest_expired_age_seconds: 4,
    })
    expect(event.trace_id).toEqual(expect.stringMatching(/^[a-f0-9-]{36}$/))
    expect(probe.cleanup.runBatch).toHaveBeenCalledWith(event.trace_id)
    expect(probe.error).not.toHaveBeenCalled()
  })

  it('rejects unknown job names without invoking cleanup', async () => {
    const probe = harness()

    await expect(
      probe.processor.process(job({ name: 'unexpected-cleanup' }))
    ).rejects.toThrow('Unsupported document upload reservation cleanup job')
    expect(probe.cleanup.runBatch).not.toHaveBeenCalled()
  })

  it('rejects unversioned or over-posted job data without invoking cleanup', async () => {
    const probe = harness()

    await expect(probe.processor.process(job({ data: {} }))).rejects.toThrow(
      'Invalid document upload reservation cleanup job data'
    )
    await expect(
      probe.processor.process(
        job({ data: { schemaVersion: 1, tenantId: 'attacker-controlled' } })
      )
    ).rejects.toThrow('Invalid document upload reservation cleanup job data')
    await expect(
      probe.processor.process(job({ data: { schemaVersion: 2 } }))
    ).rejects.toThrow('Invalid document upload reservation cleanup job data')
    expect(probe.cleanup.runBatch).not.toHaveBeenCalled()
  })
})
