import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  CostEntryDeletionResult,
  DeleteCostEntryBody,
  CostEntryRestoreResult,
  RestoreCostEntryBody,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CostEntryDeletionService } from './cost-entry-deletion.service'
import { DeleteCostEntryPipe } from './delete-cost-entry.pipe'
import { RestoreCostEntryPipe } from './restore-cost-entry.pipe'

@Controller('v1/projects')
export class CostEntryDeletionController {
  constructor(
    @Inject(CostEntryDeletionService)
    private readonly costs: CostEntryDeletionService
  ) {}

  @Delete(':projectId/cost-entries/:costEntryId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('cost.record')
  delete(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('costEntryId', new ParseUUIDPipe()) costEntryId: string,
    @Body(DeleteCostEntryPipe) command: DeleteCostEntryBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CostEntryDeletionResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.costs.delete(
      projectId,
      costEntryId,
      command.reason,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':projectId/cost-entries/:costEntryId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('cost.record')
  restore(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('costEntryId', new ParseUUIDPipe()) costEntryId: string,
    @Body(RestoreCostEntryPipe) command: RestoreCostEntryBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CostEntryRestoreResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.costs.restore(
      projectId,
      costEntryId,
      command.reason,
      principal,
      idempotencyKey.trim()
    )
  }
}
