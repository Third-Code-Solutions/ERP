import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common'
import {
  vendorPerformanceQuerySchema,
  type VendorPerformanceResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { VendorPerformanceService } from './vendor-performance.service'

@Controller('v1/procurement/vendors')
export class VendorPerformanceController {
  constructor(
    @Inject(VendorPerformanceService)
    private readonly performance: VendorPerformanceService,
  ) {}

  @Get('performance')
  @RequireCapabilities('procurement.vendor_performance.read')
  read(
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<VendorPerformanceResult> {
    const parsed = vendorPerformanceQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid vendor performance query')
    return this.performance.read(parsed.data, principal)
  }
}
