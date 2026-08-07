import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  CortexAssistantGenerationStartCommand,
  CortexAssistantGenerationStatus,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { CortexAssistantTurnSignatureHeaders } from './cortex-assistant-turns.service'
import { CortexAssistantTurnsService } from './cortex-assistant-turns.service'
import { CortexAssistantGenerationStateService } from './cortex-assistant-generation.state'

@Injectable()
export class CortexAssistantGenerationService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(CortexAssistantTurnsService)
    private readonly assistantTurns: CortexAssistantTurnsService,
    @Inject(CortexAssistantGenerationStateService)
    private readonly state: CortexAssistantGenerationStateService
  ) {}

  async start(
    command: CortexAssistantGenerationStartCommand,
    principal: ErpPrincipal,
    idempotencyKey: string | undefined,
    headers: CortexAssistantTurnSignatureHeaders
  ): Promise<{ status: CortexAssistantGenerationStatus; enqueue: boolean }> {
    this.assertJobsEnabled(principal.tenantId)
    const validatedKey = this.assistantTurns.authorizeGenerationStart(
      command,
      principal,
      idempotencyKey,
      headers
    )
    return this.state.start(command, principal, validatedKey)
  }

  status(
    jobId: string,
    principal: ErpPrincipal
  ): Promise<CortexAssistantGenerationStatus> {
    this.assertJobsEnabled(principal.tenantId)
    return this.state.status(jobId, principal)
  }

  cancel(
    jobId: string,
    principal: ErpPrincipal
  ): Promise<CortexAssistantGenerationStatus> {
    this.assertJobsEnabled(principal.tenantId)
    return this.state.cancel(jobId, principal)
  }

  private assertJobsEnabled(tenantId: string): void {
    if (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED',
        false
      ) !== true ||
      !this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS',
          []
        )
        .includes(tenantId)
    ) {
      throw new ServiceUnavailableException(
        'Cortex assistant generation jobs are not enabled for this tenant.'
      )
    }
  }
}
