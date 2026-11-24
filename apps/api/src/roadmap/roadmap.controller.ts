import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import {
  applyLandedCostCommandSchema,
  activatePriceListCommandSchema,
  calculateTaxCommandSchema,
  calculateTaxByProfileCommandSchema,
  createExchangeRateCommandSchema,
  createPriceListCommandSchema,
  createProcurementRequisitionCommandSchema,
  createTaxProfileCommandSchema,
  taxProfileWorkflowCommandSchema,
  fiscalPeriodCloseCommandSchema,
  inventoryReservationWorkflowCommandSchema,
  priceResolutionQuerySchema,
  procurementRequisitionWorkflowCommandSchema,
  providerDeliveryRequestSchema,
  reserveInventoryCommandSchema,
  sapPostingRequestSchema,
  generateStatutoryOutputCommandSchema,
  tenantCurrencyCommandSchema,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ZodBodyPipe } from '../common/zod-body.pipe'
import { ZodQueryPipe } from '../common/zod-query.pipe'
import { RoadmapService } from './roadmap.service'

function requireIdempotency(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  if (!normalized) throw new BadRequestException('Idempotency-Key header is required')
  if (normalized.length > 256) throw new BadRequestException('Idempotency-Key header is too long')
  return normalized
}

@Controller('v1/roadmap')
export class RoadmapController {
  constructor(@Inject(RoadmapService) private readonly roadmap: RoadmapService) {}

  @Post('procurement/requisitions')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('po.create')
  createRequisition(
    @Body(new ZodBodyPipe(createProcurementRequisitionCommandSchema)) body: ReturnType<typeof createProcurementRequisitionCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.createRequisition(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('procurement/requisitions/:requisitionId/workflow')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('po.create')
  transitionRequisition(
    @Param('requisitionId', new ParseUUIDPipe()) requisitionId: string,
    @Body(new ZodBodyPipe(procurementRequisitionWorkflowCommandSchema)) body: ReturnType<typeof procurementRequisitionWorkflowCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.transitionRequisition(requisitionId, body, principal, requireIdempotency(idempotencyKey))
  }

  @Get('procurement/requisitions/:requisitionId/trace')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('procurement.read')
  getProcurementTrace(
    @Param('requisitionId', new ParseUUIDPipe()) requisitionId: string,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.getProcurementTrace(requisitionId, principal)
  }

  @Post('inventory/reservations')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('inventory.manage')
  reserveInventory(
    @Body(new ZodBodyPipe(reserveInventoryCommandSchema)) body: ReturnType<typeof reserveInventoryCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.reserveInventory(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('inventory/reservations/:reservationId/workflow')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('inventory.manage')
  transitionReservation(
    @Param('reservationId', new ParseUUIDPipe()) reservationId: string,
    @Body(new ZodBodyPipe(inventoryReservationWorkflowCommandSchema)) body: ReturnType<typeof inventoryReservationWorkflowCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.transitionReservation(reservationId, body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('inventory/landed-cost')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('inventory.manage')
  applyLandedCost(
    @Body(new ZodBodyPipe(applyLandedCostCommandSchema)) body: ReturnType<typeof applyLandedCostCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.applyLandedCost(body, principal, requireIdempotency(idempotencyKey))
  }

  @Get('price-lists/resolve')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('po.create')
  resolvePrice(
    @Query(new ZodQueryPipe(priceResolutionQuerySchema)) query: ReturnType<typeof priceResolutionQuerySchema.parse>,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.resolvePrice(query, principal)
  }

  @Post('price-lists')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('po.create')
  createPriceList(
    @Body(new ZodBodyPipe(createPriceListCommandSchema)) body: ReturnType<typeof createPriceListCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.createPriceList(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('price-lists/:priceListId/workflow')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('po.approve')
  transitionPriceList(
    @Param('priceListId', new ParseUUIDPipe()) priceListId: string,
    @Body(new ZodBodyPipe(activatePriceListCommandSchema)) body: ReturnType<typeof activatePriceListCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.transitionPriceList(priceListId, body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('currency/rates')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('finance.manage')
  createExchangeRate(
    @Body(new ZodBodyPipe(createExchangeRateCommandSchema)) body: ReturnType<typeof createExchangeRateCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.createExchangeRate(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('currency/configuration')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('finance.manage')
  configureCurrency(
    @Body(new ZodBodyPipe(tenantCurrencyCommandSchema)) body: ReturnType<typeof tenantCurrencyCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.configureCurrency(body, principal, requireIdempotency(idempotencyKey))
  }

  @Get('currency/convert')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.read')
  convertCurrency(
    @Query() query: { amountMinorUnits?: string; fromCurrency?: string; toCurrency?: string; asOf?: string },
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    if (!query.amountMinorUnits || !query.fromCurrency || !query.toCurrency || !query.asOf) throw new BadRequestException('amountMinorUnits, fromCurrency, toCurrency and asOf are required')
    return this.roadmap.convertCurrency({ amountMinorUnits: query.amountMinorUnits, fromCurrency: query.fromCurrency, toCurrency: query.toCurrency, asOf: query.asOf }, principal)
  }

  @Post('tax/calculate')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage')
  calculateTax(
    @Body(new ZodBodyPipe(calculateTaxCommandSchema)) body: ReturnType<typeof calculateTaxCommandSchema.parse>,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.calculateTax(body, principal)
  }

  @Post('tax/profiles')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('finance.manage')
  createTaxProfile(
    @Body(new ZodBodyPipe(createTaxProfileCommandSchema)) body: ReturnType<typeof createTaxProfileCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.createTaxProfile(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('tax/profiles/:taxProfileId/workflow')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage')
  transitionTaxProfile(
    @Param('taxProfileId', new ParseUUIDPipe()) taxProfileId: string,
    @Body(new ZodBodyPipe(taxProfileWorkflowCommandSchema)) body: ReturnType<typeof taxProfileWorkflowCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.transitionTaxProfile(taxProfileId, body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('tax/calculate-from-profile')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage')
  calculateTaxByProfile(
    @Body(new ZodBodyPipe(calculateTaxByProfileCommandSchema)) body: ReturnType<typeof calculateTaxByProfileCommandSchema.parse>,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.calculateTaxByProfile(body, principal)
  }

  @Post('tax/statutory-outputs')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('finance.manage')
  generateStatutoryOutput(
    @Body(new ZodBodyPipe(generateStatutoryOutputCommandSchema)) body: ReturnType<typeof generateStatutoryOutputCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.generateStatutoryOutput(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('period-close')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.post')
  closePeriod(
    @Body(new ZodBodyPipe(fiscalPeriodCloseCommandSchema)) body: ReturnType<typeof fiscalPeriodCloseCommandSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.closePeriod(body, principal, requireIdempotency(idempotencyKey))
  }

  @Post('sap/postings')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCapabilities('finance.post')
  enqueueSap(
    @Body(new ZodBodyPipe(sapPostingRequestSchema)) body: ReturnType<typeof sapPostingRequestSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.enqueueSap(body, principal, requireIdempotency(idempotencyKey))
  }

  // Free-form recipient and body leave from the company sender, so only tenant administration may queue them.
  @Post('provider-delivery')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCapabilities('admin.system_config')
  enqueueProviderDelivery(
    @Body(new ZodBodyPipe(providerDeliveryRequestSchema)) body: ReturnType<typeof providerDeliveryRequestSchema.parse>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ) {
    return this.roadmap.enqueueProviderDelivery(body, principal, requireIdempotency(idempotencyKey))
  }
}
