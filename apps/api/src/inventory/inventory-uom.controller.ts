import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import type {
  CreateInventoryUomCommand,
  InventoryUomUpdateResult,
  InventoryUomCreationResult,
  UpdateInventoryUomCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryUomCreatePipe } from './inventory-uom-create.pipe'
import { InventoryUomCreationService } from './inventory-uom-creation.service'
import { InventoryUomUpdatePipe } from './inventory-uom-update.pipe'
import { InventoryUomUpdateService } from './inventory-uom-update.service'

@Controller('v1/inventory/uoms')
export class InventoryUomController {
  constructor(
    @Inject(InventoryUomCreationService)
    private readonly uoms: InventoryUomCreationService,
    @Inject(InventoryUomUpdateService)
    private readonly updates: InventoryUomUpdateService
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

  @Patch(':uomId')
  @RequireCapabilities('inventory.manage')
  update(
    @Param('uomId', new ParseUUIDPipe()) uomId: string,
    @Body(InventoryUomUpdatePipe) command: UpdateInventoryUomCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryUomUpdateResult> {
    return this.updates.update(uomId, command, principal)
  }
}
