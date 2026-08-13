import { Controller, Get, Inject, Param } from '@nestjs/common'
import type {
  CortexEntityFoundResponse,
  CortexEntityParams,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexEntityPipe } from './cortex-entity.pipe'
import { CortexEntityService } from './cortex-entity.service'

@Controller('v1/cortex')
export class CortexEntityController {
  constructor(
    @Inject(CortexEntityService)
    private readonly cortex: CortexEntityService
  ) {}

  @Get('entity/:refTable/:refId')
  @RequireCapabilities('cortex.search')
  entity(
    @Param(new CortexEntityPipe()) params: CortexEntityParams,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexEntityFoundResponse> {
    return this.cortex.read(params, principal)
  }
}
