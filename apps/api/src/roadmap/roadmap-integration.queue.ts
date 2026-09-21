import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Queue } from 'bullmq'
import {
  ROADMAP_INTEGRATION_QUEUE,
  ROADMAP_PROVIDER_SCHEDULER,
  ROADMAP_PROVIDER_SWEEP_JOB,
  ROADMAP_SAP_SCHEDULER,
  ROADMAP_SAP_SWEEP_JOB,
} from './roadmap-integration.constants'

@Injectable()
export class RoadmapIntegrationQueue implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(ROADMAP_INTEGRATION_QUEUE)
    private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const interval = this.config.get<number>('ERP_ROADMAP_INTEGRATION_SWEEP_INTERVAL_MS', 60_000)
    if (this.config.get<boolean>('ERP_ROADMAP_PROVIDER_DELIVERY_WORKER_ENABLED', false) === true) {
      await this.queue.upsertJobScheduler(ROADMAP_PROVIDER_SCHEDULER, { every: interval }, { name: ROADMAP_PROVIDER_SWEEP_JOB, data: { schemaVersion: 1 }, opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 } })
    }
    if (this.config.get<boolean>('ERP_ROADMAP_SAP_POSTING_WORKER_ENABLED', false) === true) {
      await this.queue.upsertJobScheduler(ROADMAP_SAP_SCHEDULER, { every: interval }, { name: ROADMAP_SAP_SWEEP_JOB, data: { schemaVersion: 1 }, opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 } })
    }
  }
}
