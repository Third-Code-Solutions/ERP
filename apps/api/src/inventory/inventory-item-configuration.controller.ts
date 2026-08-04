import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import type {
  ConfigureInventoryItemCommand,
  InventoryItemConfigurationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryItemConfigurationPipe } from './inventory-item-configuration.pipe'
import { InventoryItemConfigurationService } from './inventory-item-configuration.service'

@Controller('v1/inventory/items')
export class InventoryItemConfigurationController {
  constructor(
    @Inject(InventoryItemConfigurationService)
    private readonly configurations: InventoryItemConfigurationService
  ) {}

  @Patch(':materialItemId/configuration')
  @RequireCapabilities('inventory.manage')
  configure(
    @Param('materialItemId', new ParseUUIDPipe()) materialItemId: string,
    @Body(InventoryItemConfigurationPipe)
    command: ConfigureInventoryItemCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryItemConfigurationResult> {
    return this.configurations.configure(materialItemId, command, principal)
  }
}
