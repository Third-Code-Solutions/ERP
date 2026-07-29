import type { Job, Queue } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RFQ_DISPATCH_DEAD_LETTER_JOB,
  RFQ_DISPATCH_JOB,
} from './rfq-dispatch.constants'
import { RfqDispatchProcessor } from './rfq-dispatch.processor'
import type { ProcurementService } from './procurement.service'

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
  })
  const deadLetterAdd = vi.fn().mockResolvedValue({})
  const processor = new RfqDispatchProcessor(
    { createFromApprovedBom } as unknown as ProcurementService,
    { add: deadLetterAdd } as unknown as Queue
  )
  return {
    processor,
    createFromApprovedBom,
    deadLetterAdd,
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
        jobId: `${JOB_ID}-dead-letter`,
        attempts: 1,
        removeOnComplete: 5_000,
        removeOnFail: false,
      }
    )
  })
})
