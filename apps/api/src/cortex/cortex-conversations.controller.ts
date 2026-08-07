import { Controller, Get, Inject, Param } from '@nestjs/common'
import type {
  CortexConversationDetailResponse,
  CortexConversationListResponse,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexConversationIdPipe } from './cortex-conversations.pipe'
import { CortexConversationsService } from './cortex-conversations.service'

@Controller('v1/cortex/conversations')
export class CortexConversationsController {
  constructor(
    @Inject(CortexConversationsService)
    private readonly conversations: CortexConversationsService
  ) {}

  @Get()
  @RequireCapabilities('cortex.search')
  list(
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexConversationListResponse> {
    return this.conversations.list(principal)
  }

  @Get(':id')
  @RequireCapabilities('cortex.search')
  read(
    @Param('id', new CortexConversationIdPipe()) id: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexConversationDetailResponse> {
    return this.conversations.read(id, principal)
  }
}
