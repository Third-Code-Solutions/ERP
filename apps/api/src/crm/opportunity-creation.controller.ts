import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  OpportunityCreationCommand,
  OpportunityCreationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { OpportunityCreationPipe } from './opportunity-creation.pipe'
import { OpportunityCreationService } from './opportunity-creation.service'

@Controller('v1/crm/opportunities')
export class OpportunityCreationController {
  constructor(
    @Inject(OpportunityCreationService)
    private readonly opportunities: OpportunityCreationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('opportunity.create')
  create(
    @Body(OpportunityCreationPipe) command: OpportunityCreationCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<OpportunityCreationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.opportunities.create(command, principal, idempotencyKey.trim())
  }
}
