import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
} from '@nestjs/common'
import type {
  CortexConversationDetailResponse,
  CortexConversationListResponse,
  CortexConversationUserTurnCommand,
  CortexConversationUserTurnResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexConversationIdPipe } from './cortex-conversations.pipe'
import { CortexConversationsService } from './cortex-conversations.service'
import { CortexConversationTurnPipe } from './cortex-conversation-turn.pipe'
import { CortexConversationTurnsService } from './cortex-conversation-turns.service'

@Controller('v1/cortex/conversations')
export class CortexConversationsController {
  constructor(
    @Inject(CortexConversationsService)
    private readonly conversations: CortexConversationsService,
    @Inject(CortexConversationTurnsService)
    private readonly turns: CortexConversationTurnsService
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

  @Post('user-turns')
  @RequireCapabilities('cortex.search')
  appendUserTurn(
    @Body(CortexConversationTurnPipe)
    command: CortexConversationUserTurnCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexConversationUserTurnResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.turns.appendUserTurn(command, principal, idempotencyKey)
  }
}
