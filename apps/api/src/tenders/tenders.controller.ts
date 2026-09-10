import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import {
  bindTenderBomCommandSchema,
  createOpportunityTenderCommandSchema,
  createTenderCriterionCommandSchema,
  createTenderDeviationCommandSchema,
  createTenderVendorProfileCommandSchema,
  tenderStatusCommandSchema,
  updateOpportunityTenderCommandSchema,
  updateTenderCriterionCommandSchema,
  updateTenderDeviationCommandSchema,
  updateTenderVendorProfileCommandSchema,
  upsertTenderEvaluationScoreCommandSchema,
} from '@third-code-erp/shared-types'
import { RequireAnyCapabilities, RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { TendersService } from './tenders.service'

@Controller('v1/opportunities')
export class TendersController {
  constructor(@Inject(TendersService) private readonly tenders: TendersService) {}

  @Get(':opportunityId/tender')
  @RequireCapabilities('tender.read')
  detail(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @CurrentPrincipal() principal: ErpPrincipal) {
    return this.tenders.detail(opportunityId, principal)
  }

  @Post(':opportunityId/tender')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('tender.manage')
  create(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = createOpportunityTenderCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender command')
    if (parsed.data.opportunityId !== opportunityId) throw new BadRequestException('Opportunity id does not match route')
    return this.tenders.create(parsed.data, principal)
  }

  @Patch(':opportunityId/tender/:tenderId')
  @RequireCapabilities('tender.manage')
  update(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = updateOpportunityTenderCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender update')
    return this.tenders.update(opportunityId, tenderId, parsed.data, principal)
  }

  @Post(':opportunityId/tender/:tenderId/status')
  @HttpCode(HttpStatus.OK)
  @RequireAnyCapabilities('tender.manage', 'tender.evaluate')
  transition(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = tenderStatusCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender status command')
    return this.tenders.transition(opportunityId, tenderId, parsed.data, principal)
  }

  @Post(':opportunityId/tender/:tenderId/bind-bom')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('tender.manage')
  bindBom(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = bindTenderBomCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender BOM binding')
    return this.tenders.bindBom(opportunityId, tenderId, parsed.data, principal)
  }

  @Post(':opportunityId/tender/:tenderId/deviations')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('tender.manage')
  createDeviation(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = createTenderDeviationCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender deviation')
    return this.tenders.createDeviation(opportunityId, tenderId, parsed.data, principal)
  }

  @Patch(':opportunityId/tender/:tenderId/deviations/:deviationId')
  @RequireCapabilities('tender.manage')
  updateDeviation(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Param('deviationId', new ParseUUIDPipe()) deviationId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = updateTenderDeviationCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender deviation update')
    return this.tenders.updateDeviation(opportunityId, tenderId, deviationId, parsed.data, principal)
  }

  @Post(':opportunityId/tender/:tenderId/criteria')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('tender.manage')
  createCriterion(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = createTenderCriterionCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender criterion')
    return this.tenders.createCriterion(opportunityId, tenderId, parsed.data, principal)
  }

  @Patch(':opportunityId/tender/:tenderId/criteria/:criterionId')
  @RequireCapabilities('tender.manage')
  updateCriterion(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Param('criterionId', new ParseUUIDPipe()) criterionId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = updateTenderCriterionCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender criterion update')
    return this.tenders.updateCriterion(opportunityId, tenderId, criterionId, parsed.data, principal)
  }

  @Post(':opportunityId/tender/:tenderId/vendor-profiles')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('tender.manage')
  createVendorProfile(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = createTenderVendorProfileCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender vendor profile')
    return this.tenders.createVendorProfile(opportunityId, tenderId, parsed.data, principal)
  }

  @Patch(':opportunityId/tender/:tenderId/vendor-profiles/:profileId')
  @RequireCapabilities('tender.manage')
  updateVendorProfile(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Param('profileId', new ParseUUIDPipe()) profileId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = updateTenderVendorProfileCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender vendor profile update')
    return this.tenders.updateVendorProfile(opportunityId, tenderId, profileId, parsed.data, principal)
  }

  @Post(':opportunityId/tender/:tenderId/evaluation-scores')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('tender.evaluate')
  upsertScore(@Param('opportunityId', new ParseUUIDPipe()) opportunityId: string, @Param('tenderId', new ParseUUIDPipe()) tenderId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal) {
    const parsed = upsertTenderEvaluationScoreCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid tender evaluation score')
    return this.tenders.upsertScore(opportunityId, tenderId, parsed.data, principal)
  }
}
