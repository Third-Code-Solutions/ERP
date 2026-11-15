import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { UnrecoverableError, type Job, type Queue } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RFQ_DISPATCH_DEAD_LETTER_JOB,
  RFQ_DISPATCH_JOB,
} from './rfq-dispatch.constants'
import { RfqDispatchProcessor } from './rfq-dispatch.processor'
import { RfqNotNeededException, type ProcurementService } from './procurement.service'
import type { NotificationDeliveryQueue } from './notification-delivery.queue'

const JOB_ID =
  'rfq1-22222222-2222-4222-8222-222222222222-88888888-8888-4888-8888-888888888888'
const DATA = {
  schemaVersion: 1 as const,
  tenantId: '22222222-2222-4222-8222-222222222222',
  actorId: '11111111-1111-4111-8111-111111111111',
  bomId: '88888888-8888-4888-8888-888888888888',
  source: 'bom_approved' as const,
}

function job(
  overrides: Partial<Job> = {}
): Job {
  return {
    id: JOB_ID,
    name: RFQ_DISPATCH_JOB,
    data: DATA,
    attemptsMade: 0,
    timestamp: 1_700_000_000_000,
    opts: { attempts: 5 },
    ...overrides,
  } as Job
}

function harness() {
  const createFromApprovedBom = vi.fn().mockResolvedValue({
    rfqId: '33333333-3333-4333-8333-333333333333',
    tenantId: DATA.tenantId,
    projectId: '99999999-9999-4999-8999-999999999999',
    lineCount: 2,
    created: true,
    notificationOutboxId:
      '77777777-7777-4777-8777-777777777777',
  })
  const deadLetterAdd = vi.fn().mockResolvedValue({})
  const enqueueOutbox = vi.fn().mockResolvedValue(2)
  const processor = new RfqDispatchProcessor(
    { createFromApprovedBom } as unknown as ProcurementService,
    { add: deadLetterAdd } as unknown as Queue,
    { enqueueOutbox } as unknown as NotificationDeliveryQueue
  )
  return {
    processor,
    createFromApprovedBom,
    deadLetterAdd,
    enqueueOutbox,
  }
}

describe('RfqDispatchProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates and sends strict job data to the official service', async () => {
    const probe = harness()

    await expect(probe.processor.process(job())).resolves.toMatchObject({
      created: true,
    })
    expect(probe.createFromApprovedBom).toHaveBeenCalledWith(DATA)
    expect(probe.enqueueOutbox).toHaveBeenCalledWith(
      DATA.tenantId,
      '77777777-7777-4777-8777-777777777777'
    )
  })

  it('rejects unsupported or malformed jobs before database authority', async () => {
    const probe = harness()

    await expect(
      probe.processor.process(job({ name: 'other' }))
    ).rejects.toThrow('Unsupported RFQ dispatch job')
    await expect(
      probe.processor.process(job({ data: { ...DATA, role: 'owner' } }))
    ).rejects.toThrow('Invalid RFQ dispatch job data')
    expect(probe.createFromApprovedBom).not.toHaveBeenCalled()
  })

  it('dead-letters only after the final bounded attempt', async () => {
    const probe = harness()
    const error = new Error('database unavailable')

    await probe.processor.onFailed(
      job({ attemptsMade: 4 }),
      error
    )
    expect(probe.deadLetterAdd).not.toHaveBeenCalled()

    await probe.processor.onFailed(
      job({ attemptsMade: 5 }),
      error
    )
    expect(probe.deadLetterAdd).toHaveBeenCalledWith(
      RFQ_DISPATCH_DEAD_LETTER_JOB,
      expect.objectContaining({
        schemaVersion: 1,
        sourceJobId: JOB_ID,
        sourceJobName: RFQ_DISPATCH_JOB,
        jobData: DATA,
        attemptsMade: 5,
        errorName: 'Error',
        errorMessage: 'database unavailable',
      }),
      {
        jobId: `${JOB_ID}-dead-letter-1700000000000`,
        attempts: 1,
        removeOnComplete: 5_000,
        removeOnFail: false,
      }
    )
  })

  it('fails a refusal of the BOM or actor at once instead of retrying it', async () => {
    for (const refusal of [
      new NotFoundException('BOM not found'),
      new ConflictException('BOM must be approved before automatic RFQ dispatch'),
      new ForbiddenException(),
    ]) {
      const probe = harness()
      probe.createFromApprovedBom.mockRejectedValueOnce(refusal)

      const failure = await probe.processor.process(job()).catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(UnrecoverableError)
      expect((failure as Error).message).toBe(`${refusal.name}: ${refusal.message}`)
      expect(probe.enqueueOutbox).not.toHaveBeenCalled()
    }
  })

  it('completes without an RFQ when every BOM line has a contracted rate', async () => {
    const probe = harness()
    probe.createFromApprovedBom.mockRejectedValueOnce(new RfqNotNeededException())

    await expect(probe.processor.process(job())).resolves.toBeNull()
    expect(probe.enqueueOutbox).not.toHaveBeenCalled()
    expect(probe.deadLetterAdd).not.toHaveBeenCalled()
  })

  it('keeps retrying an outage', async () => {
    for (const outage of [
      new ServiceUnavailableException('RFQ dispatch is not enabled'),
      new HttpException('Request timeout', HttpStatus.REQUEST_TIMEOUT),
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
      new Error('database unavailable'),
    ]) {
      const probe = harness()
      probe.createFromApprovedBom.mockRejectedValueOnce(outage)

      await expect(probe.processor.process(job())).rejects.toBe(outage)
    }
  })

  it('dead-letters an unrecoverable failure on its first attempt', async () => {
    const probe = harness()

    await probe.processor.onFailed(
      job({ attemptsMade: 1 }),
      new UnrecoverableError('NotFoundException: BOM not found')
    )

    expect(probe.deadLetterAdd).toHaveBeenCalledWith(
      RFQ_DISPATCH_DEAD_LETTER_JOB,
      expect.objectContaining({
        attemptsMade: 1,
        errorName: 'UnrecoverableError',
        errorMessage: 'NotFoundException: BOM not found',
      }),
      expect.objectContaining({ jobId: `${JOB_ID}-dead-letter-1700000000000` })
    )
  })

  it('dead-letters an UnrecoverableError raised by BullMQ itself on its first attempt', async () => {
    const probe = harness()
    const stalled = Object.assign(new Error('job stalled more than allowable limit'), {
      name: 'UnrecoverableError',
    })

    await probe.processor.onFailed(job({ attemptsMade: 1 }), stalled)

    expect(probe.deadLetterAdd).toHaveBeenCalledTimes(1)
  })
})
