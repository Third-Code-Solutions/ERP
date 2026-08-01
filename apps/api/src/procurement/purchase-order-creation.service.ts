import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  CreatePurchaseOrderCommand,
  PurchaseOrderCreationResult,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

/**
 * Disabled PO command boundary.
 *
 * This intentionally performs no database work. The existing Next.js action
 * remains authoritative until the next slice adds durable idempotency and
 * proves project/vendor/cost-code transaction parity in disposable PostgreSQL.
 */
@Injectable()
export class PurchaseOrderCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async create(
    _command: CreatePurchaseOrderCommand,
    _principal: ErpPrincipal,
    _idempotencyKey: string
  ): Promise<PurchaseOrderCreationResult> {
    const enabled = this.config.get<boolean>(
      'ERP_PO_CREATE_WRITES_ENABLED',
      false
    )

    if (enabled !== true) {
      throw new ServiceUnavailableException(
        'Purchase Order command is not enabled; no Purchase Order was created.'
      )
    }

    // Keep fail-closed even if an operator accidentally sets the provisional
    // flag before durable idempotency and the official transaction exist.
    throw new ServiceUnavailableException(
      'Purchase Order command migration is not ready; no Purchase Order was created.'
    )
  }
}
