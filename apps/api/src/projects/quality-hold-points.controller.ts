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
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  createQualityHoldPointCommandSchema,
  qualityHoldPointAcceptCommandSchema,
  qualityHoldPointListQuerySchema,
  qualityHoldPointReadyCommandSchema,
  qualityHoldPointPunchlistHandoffCommandSchema,
  qualityHoldPointRejectCommandSchema,
  qualityHoldPointSubmitCommandSchema,
  updateQualityHoldPointCommandSchema,
  type QualityHoldPointCreateResult,
  type QualityHoldPointListResult,
  type QualityHoldPointMutationResult,
  type QualityHoldPointPunchlistHandoffResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { QualityHoldPointsService } from './quality-hold-points.service'

@Controller('v1/projects')
export class QualityHoldPointsController {
  constructor(
    @Inject(QualityHoldPointsService)
    private readonly quality: QualityHoldPointsService,
  ) {}

  @Get(':projectId/quality')
  @RequireCapabilities('project.quality.read')
  list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointListResult> {
    const parsed = qualityHoldPointListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid quality filters')
    return this.quality.list(projectId, parsed.data, principal)
  }

  @Post(':projectId/quality')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.quality.manage')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointCreateResult> {
    const parsed = createQualityHoldPointCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality request')
    if (parsed.data.projectId !== projectId) throw new BadRequestException('Project id does not match route')
    return this.quality.create(parsed.data, principal)
  }

  @Patch(':projectId/quality/:entryId')
  @RequireCapabilities('project.quality.manage')
  update(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    const parsed = updateQualityHoldPointCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality update')
    return this.quality.update(projectId, entryId, parsed.data, principal)
  }

  @Post(':projectId/quality/:entryId/ready')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.quality.manage')
  ready(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    const parsed = qualityHoldPointReadyCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality ready command')
    return this.quality.prepare(projectId, entryId, parsed.data, principal)
  }

  @Post(':projectId/quality/:entryId/submit')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.quality.manage')
  submit(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    const parsed = qualityHoldPointSubmitCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality submit command')
    return this.quality.submit(projectId, entryId, parsed.data, principal)
  }

  @Post(':projectId/quality/:entryId/accept')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.quality.approve')
  accept(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    const parsed = qualityHoldPointAcceptCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality acceptance command')
    return this.quality.accept(projectId, entryId, parsed.data, principal)
  }

  @Post(':projectId/quality/:entryId/reject')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.quality.manage')
  reject(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    const parsed = qualityHoldPointRejectCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality rejection command')
    return this.quality.reject(projectId, entryId, parsed.data, principal)
  }

  @Post(':projectId/quality/:entryId/punchlist')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('punchlist.manage')
  async handoffToPunchlist(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Headers('x-erp-receipt-version') receiptVersion?: string,
  ): Promise<QualityHoldPointPunchlistHandoffResult | Omit<QualityHoldPointPunchlistHandoffResult, 'clientRequestId'>> {
    if (receiptVersion !== undefined && receiptVersion !== '1') {
      throw new BadRequestException('Unsupported punchlist receipt version')
    }
    const parsed = qualityHoldPointPunchlistHandoffCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid quality punchlist handoff command')
    const result = await this.quality.handoffToPunchlist(projectId, entryId, parsed.data, principal)
    if (receiptVersion === '1') return result
    // Older strict clients must keep their original response during rolling deployment.
    return {
      projectId: result.projectId,
      qualityHoldPointId: result.qualityHoldPointId,
      handoffId: result.handoffId,
      created: result.created,
      changed: result.changed,
      source: result.source,
      items: result.items,
    }
  }
}
