import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import {
  inspectionRfiQuerySchema,
  inspectionRfiTransitionCommandSchema,
  type InspectionRfiListResult,
  type InspectionRfiTransitionResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { InspectionRfisService } from './inspection-rfis.service'

@Controller('v1/crm/opportunities')
export class InspectionRfisController {
  constructor(
    @Inject(InspectionRfisService) private readonly rfis: InspectionRfisService
  ) {}

  @Get(':opportunityId/inspection-rfis')
  @RequireCapabilities('opportunity.read')
  list(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InspectionRfiListResult> {
    const parsed = inspectionRfiQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid inspection RFI filters')
    return this.rfis.list(opportunityId, parsed.data, principal)
  }

  @Post(':opportunityId/inspection-rfis/:rfiId/resolve')
  @HttpCode(200)
  @RequireCapabilities('site_inspection.submit')
  resolve(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Param('rfiId', new ParseUUIDPipe()) rfiId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InspectionRfiTransitionResult> {
    return this.transition(opportunityId, rfiId, 'resolved', body, principal)
  }

  @Post(':opportunityId/inspection-rfis/:rfiId/reopen')
  @HttpCode(200)
  @RequireCapabilities('site_inspection.submit')
  reopen(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Param('rfiId', new ParseUUIDPipe()) rfiId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InspectionRfiTransitionResult> {
    return this.transition(opportunityId, rfiId, 'open', body, principal)
  }

  private transition(
    opportunityId: string,
    rfiId: string,
    target: 'open' | 'resolved',
    body: unknown,
    principal: ErpPrincipal
  ): Promise<InspectionRfiTransitionResult> {
    const parsed = inspectionRfiTransitionCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid inspection RFI transition')
    return this.rfis.transition(opportunityId, rfiId, target, parsed.data, principal)
  }
}
