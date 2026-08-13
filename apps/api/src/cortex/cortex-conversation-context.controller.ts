import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  CortexConversationContextResolveQuery,
  CortexConversationContextResolveResponse,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexConversationContextPipe } from './cortex-conversation-context.pipe'
import { CortexConversationContextService } from './cortex-conversation-context.service'

@Controller('v1/cortex')
export class CortexConversationContextController {
  constructor(
    @Inject(CortexConversationContextService)
    private readonly context: CortexConversationContextService
  ) {}

  @Get('conversation-context')
  @RequireCapabilities('cortex.search')
  resolve(
    @Query(new CortexConversationContextPipe())
    query: CortexConversationContextResolveQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexConversationContextResolveResponse> {
    return this.context.resolve(query, principal)
  }
}
