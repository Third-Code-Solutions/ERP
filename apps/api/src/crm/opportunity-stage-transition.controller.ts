import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  OpportunityStageTransitionCommand,
  OpportunityStageTransitionResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { OpportunityStageTransitionPipe } from './opportunity-stage-transition.pipe'
import { OpportunityStageTransitionService } from './opportunity-stage-transition.service'

@Controller('v1/crm/opportunities')
export class OpportunityStageTransitionController {
  constructor(
    @Inject(OpportunityStageTransitionService)
    private readonly stages: OpportunityStageTransitionService
  ) {}

  @Post(':opportunityId/stage-transition')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('opportunity.stage_change')
  transition(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body(OpportunityStageTransitionPipe)
    command: OpportunityStageTransitionCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<OpportunityStageTransitionResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.stages.transition(
      opportunityId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
