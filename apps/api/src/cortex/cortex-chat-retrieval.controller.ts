import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  CortexChatRetrievalQuery,
  CortexChatRetrievalResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexChatRetrievalPipe } from './cortex-chat-retrieval.pipe'
import { CortexChatRetrievalService } from './cortex-chat-retrieval.service'

@Controller('v1/cortex')
export class CortexChatRetrievalController {
  constructor(
    @Inject(CortexChatRetrievalService)
    private readonly cortex: CortexChatRetrievalService
  ) {}

  @Get('chat-retrieval')
  @RequireCapabilities('cortex.search')
  retrieve(
    @Query(new CortexChatRetrievalPipe()) query: CortexChatRetrievalQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexChatRetrievalResult> {
    return this.cortex.read(query, principal)
  }
}
