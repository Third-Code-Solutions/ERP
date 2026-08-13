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
  OpportunityProjectConversionCommand,
  OpportunityProjectConversionResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { OpportunityProjectConversionPipe } from './opportunity-project-conversion.pipe'
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'

@Controller('v1/crm/opportunities')
export class OpportunityProjectConversionController {
  constructor(
    @Inject(OpportunityProjectConversionService)
    private readonly conversion: OpportunityProjectConversionService
  ) {}

  @Post(':opportunityId/convert-to-project')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('opportunity.convert')
  convert(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body(OpportunityProjectConversionPipe)
    command: OpportunityProjectConversionCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<OpportunityProjectConversionResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.conversion.convert(
      opportunityId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
