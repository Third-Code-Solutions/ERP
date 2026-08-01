import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import {
  documentProcessingQueueJobSchema,
  type DocumentProcessingQueueJob,
} from '@third-code-erp/shared-types'
import type { Job, Queue } from 'bullmq'
import {
  DOCUMENT_PROCESSING_ATTEMPTS,
  DOCUMENT_PROCESSING_BACKOFF_MS,
  DOCUMENT_PROCESSING_JOB,
  DOCUMENT_PROCESSING_QUEUE,
  documentProcessingJobId,
} from './document-processing.constants'

export interface DocumentProcessingEnqueueResult {
  jobId: string
  enqueued: boolean
}

@Injectable()
export class DocumentProcessingJobQueue {
  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly queue: Queue<DocumentProcessingQueueJob, void, string>
  ) {}

  async enqueue(jobId: string): Promise<DocumentProcessingEnqueueResult> {
    const parsed = documentProcessingQueueJobSchema.safeParse({
      schemaVersion: 1,
      jobId,
    })
    if (!parsed.success) {
      throw new Error('Invalid document processing job identity')
    }

    const transportJobId = documentProcessingJobId(parsed.data.jobId)
    if (await this.queue.getJob(transportJobId)) {
      return { jobId: parsed.data.jobId, enqueued: false }
    }

    try {
      await this.queue.add(DOCUMENT_PROCESSING_JOB, parsed.data, {
        jobId: transportJobId,
        attempts: DOCUMENT_PROCESSING_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: DOCUMENT_PROCESSING_BACKOFF_MS,
        },
        removeOnComplete: 1_000,
        removeOnFail: false,
      })
    } catch (error) {
      // Another request may have won the get/add race. Re-read the opaque
      // transport identity before surfacing a real Redis failure.
      if (await this.queue.getJob(transportJobId)) {
        return { jobId: parsed.data.jobId, enqueued: false }
      }
      throw error
    }

    return { jobId: parsed.data.jobId, enqueued: true }
  }
}

export type DocumentProcessingQueueJobRecord = Job<
  DocumentProcessingQueueJob,
  void,
  string
>
