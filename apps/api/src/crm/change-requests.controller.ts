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
  ChangeRequestCreationResult,
  CreateChangeRequestCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CreateChangeRequestPipe } from './change-request.pipe'
import { ChangeRequestCreationService } from './change-request-creation.service'

@Controller('v1/crm/opportunities')
export class ChangeRequestsController {
  constructor(
    @Inject(ChangeRequestCreationService)
    private readonly changeRequests: ChangeRequestCreationService
  ) {}

  @Post(':opportunityId/change-requests')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('change_request.create')
  create(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body(CreateChangeRequestPipe) command: CreateChangeRequestCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ChangeRequestCreationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.changeRequests.create(
      opportunityId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
