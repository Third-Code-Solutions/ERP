import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  TogalBomCommitCommand,
  TogalBomCommitResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { TogalBomCommitPipe } from './togal-bom-commit.pipe'
import { TogalBomCommitService } from './togal-bom-commit.service'

@Controller('v1/procurement/boms')
export class TogalBomCommitController {
  constructor(
    @Inject(TogalBomCommitService)
    private readonly togalBom: TogalBomCommitService
  ) {}

  @Post('togal-commit')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('bom.generate')
  commit(
    @Body(TogalBomCommitPipe) command: TogalBomCommitCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<TogalBomCommitResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.togalBom.commit(command, principal, idempotencyKey.trim())
  }
}
