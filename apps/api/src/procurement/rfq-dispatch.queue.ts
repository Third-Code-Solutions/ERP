import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type {
  CreateRfqCommand,
  RfqCreationResult,
  RfqDispatchJob,
  RfqDispatchResult,
} from '@third-code-erp/shared-types'
import type { Queue } from 'bullmq'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import {
  RFQ_DISPATCH_ATTEMPTS,
  RFQ_DISPATCH_BACKOFF_MS,
  RFQ_DISPATCH_JOB,
  RFQ_DISPATCH_QUEUE,
  rfqDispatchJobId,
} from './rfq-dispatch.constants'

@Injectable()
export class RfqDispatchQueue {
  constructor(
    @InjectQueue(RFQ_DISPATCH_QUEUE)
    private readonly queue: Queue<
      RfqDispatchJob,
      RfqCreationResult,
      string
    >
  ) {}

  async enqueue(
    command: CreateRfqCommand,
    principal: ErpPrincipal
  ): Promise<RfqDispatchResult> {
    const jobId = rfqDispatchJobId(
      principal.tenantId,
      command.bomId
    )
    const existing = await this.queue.getJob(jobId)
    if (existing) return { jobId, enqueued: false }

    const data: RfqDispatchJob = {
      schemaVersion: 1,
      tenantId: principal.tenantId,
      actorId: principal.userId,
      bomId: command.bomId,
      source: 'bom_approved',
    }
    const job = await this.queue.add(RFQ_DISPATCH_JOB, data, {
      jobId,
      attempts: RFQ_DISPATCH_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: RFQ_DISPATCH_BACKOFF_MS,
      },
      removeOnComplete: 1_000,
      removeOnFail: false,
    })

    return {
      jobId: String(job.id),
      enqueued: true,
    }
  }
}
