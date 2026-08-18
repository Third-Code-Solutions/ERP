import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  InspectionPhotoCommand,
  InspectionPhotoResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InspectionPhotoPipe } from './inspection-photo.pipe'
import { InspectionPhotoService } from './inspection-photo.service'

@Controller('v1/opportunities')
export class InspectionPhotoController {
  constructor(
    @Inject(InspectionPhotoService)
    private readonly photos: InspectionPhotoService
  ) {}

  @Post(':opportunityId/inspection-photos')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('site_inspection.submit')
  create(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body(InspectionPhotoPipe) command: InspectionPhotoCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InspectionPhotoResult> {
    if (command.opportunityId !== opportunityId) {
      throw new BadRequestException('Opportunity id does not match the request path')
    }
    return this.photos.create(command, principal)
  }
}
