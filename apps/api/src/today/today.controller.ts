import { Controller, Get, Inject, Query } from '@nestjs/common'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  type TodayQuery,
  type TodayCommandCenterResult,
} from '@third-code-erp/shared-types'
import { TodayPipe } from './today.pipe'
import { TodayService } from './today.service'

@Controller('v1/today')
export class TodayController {
  constructor(
    @Inject(TodayService)
    private readonly today: TodayService
  ) {}

  @Get()
  @RequireCapabilities('today.read')
  read(
    @Query(new TodayPipe()) query: TodayQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<TodayCommandCenterResult> {
    return this.today.read(query, principal)
  }
}
