import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  CortexAssistantProviderHealthQuery,
  CortexAssistantProviderHealthResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexAssistantProviderHealthPipe } from './cortex-assistant-provider-health.pipe'
import { CortexAssistantProviderHealthService } from './cortex-assistant-provider-health.service'

@Controller('v1/cortex/provider-health')
export class CortexAssistantProviderHealthController {
  constructor(
    @Inject(CortexAssistantProviderHealthService)
    private readonly health: CortexAssistantProviderHealthService
  ) {}

  @Get()
  @RequireCapabilities('cortex.provider.health.read')
  read(
    @Query(CortexAssistantProviderHealthPipe)
    query: CortexAssistantProviderHealthQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexAssistantProviderHealthResult> {
    return this.health.read(query, principal)
  }
}
