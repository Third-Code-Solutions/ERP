import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  CostEntryCreationResult,
  CreateCostEntryCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CreateCostEntryPipe } from './create-cost-entry.pipe'
import { CostEntryCreationService } from './cost-entry-creation.service'

@Controller('v1/projects')
export class CostEntryCreationController {
  constructor(
    @Inject(CostEntryCreationService)
    private readonly costs: CostEntryCreationService
  ) {}

  @Post(':projectId/cost-entries')
  @RequireCapabilities('cost.record')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(CreateCostEntryPipe) command: CreateCostEntryCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CostEntryCreationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.costs.create(projectId, command, principal, idempotencyKey)
  }
}
