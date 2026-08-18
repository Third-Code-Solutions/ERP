import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  TakeoffImportCommand,
  TakeoffImportResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { TakeoffImportPipe } from './takeoff-import.pipe'
import { TakeoffImportService } from './takeoff-import.service'

@Controller('v1/boms')
export class TakeoffImportController {
  constructor(
    @Inject(TakeoffImportService)
    private readonly takeoffImports: TakeoffImportService
  ) {}

  @Post('takeoff-import')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('bom.generate')
  execute(
    @Body(TakeoffImportPipe) command: TakeoffImportCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<TakeoffImportResult> {
    return this.takeoffImports.execute(command, principal)
  }
}
