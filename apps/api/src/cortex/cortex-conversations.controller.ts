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
  CortexConversationAssistantTurnClaimCommand,
  CortexConversationAssistantTurnClaimResult,
  CortexConversationAssistantTurnCompleteCommand,
  CortexConversationAssistantTurnCompleteResult,
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
import {
  CortexAssistantTurnClaimPipe,
  CortexAssistantTurnCompletePipe,
} from './cortex-assistant-turn.pipe'
import { CortexAssistantTurnsService } from './cortex-assistant-turns.service'

@Controller('v1/cortex/conversations')
export class CortexConversationsController {
  constructor(
    @Inject(CortexConversationsService)
    private readonly conversations: CortexConversationsService,
    @Inject(CortexConversationTurnsService)
    private readonly turns: CortexConversationTurnsService,
    @Inject(CortexAssistantTurnsService)
    private readonly assistantTurns: CortexAssistantTurnsService
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
  @RequireCapabilities('cortex.assistant.use')
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

  @Post('assistant-turns/claims')
  @RequireCapabilities('cortex.assistant.use')
  claimAssistantTurn(
    @Body(CortexAssistantTurnClaimPipe)
    command: CortexConversationAssistantTurnClaimCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-third-code-timestamp') timestamp: string | undefined,
    @Headers('x-third-code-cortex-signature') signature: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexConversationAssistantTurnClaimResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.assistantTurns.claim(command, principal, idempotencyKey, {
      timestamp,
      signature,
    })
  }

  @Post('assistant-turns/complete')
  @RequireCapabilities('cortex.assistant.use')
  completeAssistantTurn(
    @Body(CortexAssistantTurnCompletePipe)
    command: CortexConversationAssistantTurnCompleteCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-third-code-timestamp') timestamp: string | undefined,
    @Headers('x-third-code-cortex-signature') signature: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexConversationAssistantTurnCompleteResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.assistantTurns.complete(command, principal, idempotencyKey, {
      timestamp,
      signature,
    })
  }
}
