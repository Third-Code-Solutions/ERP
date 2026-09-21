import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { ROADMAP_INTEGRATION_QUEUE, ROADMAP_PROVIDER_SWEEP_JOB, ROADMAP_SAP_SWEEP_JOB } from './roadmap-integration.constants'
import { RoadmapIntegrationService } from './roadmap-integration.service'

@Processor(ROADMAP_INTEGRATION_QUEUE)
export class RoadmapIntegrationProcessor extends WorkerHost {
  private readonly logger = new Logger(RoadmapIntegrationProcessor.name)

  constructor(@Inject(RoadmapIntegrationService) private readonly integrations: RoadmapIntegrationService) {
    super()
  }

  async process(job: Job<unknown, unknown, string>): Promise<{ processed: number }> {
    if (job.name === ROADMAP_PROVIDER_SWEEP_JOB) {
      return { processed: await this.integrations.sweepProviderDeliveries() }
    }
    if (job.name === ROADMAP_SAP_SWEEP_JOB) {
      return { processed: await this.integrations.sweepSapPostings() }
    }
    this.logger.warn(`Ignoring unsupported roadmap integration job ${job.name}`)
    return { processed: 0 }
  }
}
