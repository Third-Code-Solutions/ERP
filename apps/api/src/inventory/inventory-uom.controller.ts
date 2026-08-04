import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  CreateInventoryUomCommand,
  InventoryUomCreationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryUomCreatePipe } from './inventory-uom-create.pipe'
import { InventoryUomCreationService } from './inventory-uom-creation.service'

@Controller('v1/inventory/uoms')
export class InventoryUomController {
  constructor(
    @Inject(InventoryUomCreationService)
    private readonly uoms: InventoryUomCreationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('inventory.manage')
  create(
    @Body(InventoryUomCreatePipe) command: CreateInventoryUomCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryUomCreationResult> {
    return this.uoms.create(command, principal)
  }
}
