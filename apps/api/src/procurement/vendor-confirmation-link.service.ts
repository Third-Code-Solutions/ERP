import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { vendorConfirmationSessions } from '@third-code-erp/database/schema'
import { and, eq, gt } from 'drizzle-orm'
import type { DatabaseTransaction } from '../database/database.service'
import { deriveVendorConfirmationToken } from './vendor-confirmation-token'

export interface BuildVendorConfirmationLinkInput {
  transaction: DatabaseTransaction
  tenantId: string
  purchaseOrderId: string
  sessionId: string | null
}

/**
 * Reconstructs a public confirmation URL only at email-send time. The raw
 * token never enters a database row, audit diff, or outbox payload.
 */
@Injectable()
export class VendorConfirmationLinkService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async buildUrl(
    input: BuildVendorConfirmationLinkInput
  ): Promise<string | null> {
    if (!input.sessionId) return null

    const linkDeliveryEnabled = this.config.get<boolean>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED',
      false
    )
    const linkTenantIds = this.config.get<string[]>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS',
      []
    )
    const writesEnabled = this.config.get<boolean>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED',
      false
    )
    const writeTenantIds = this.config.get<string[]>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS',
      []
    )
    if (
      !linkDeliveryEnabled ||
      !linkTenantIds.includes(input.tenantId) ||
      !writesEnabled ||
      !writeTenantIds.includes(input.tenantId)
    ) {
      return null
    }

    const secret = this.config.get<string>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET'
    )
    const baseUrl = this.config.get<string>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL'
    )
    if (!secret || secret.length < 32 || !baseUrl) {
      throw new ServiceUnavailableException(
        'Supplier confirmation link delivery is not configured; no link was sent.'
      )
    }

    let parsedBaseUrl: URL
    try {
      parsedBaseUrl = new URL(baseUrl)
    } catch {
      throw new ServiceUnavailableException(
        'Supplier confirmation link delivery base URL is invalid; no link was sent.'
      )
    }
    if (parsedBaseUrl.protocol !== 'https:') {
      throw new ServiceUnavailableException(
        'Supplier confirmation link delivery requires an HTTPS base URL; no link was sent.'
      )
    }

    const [session] = await input.transaction
      .select({
        id: vendorConfirmationSessions.id,
      })
      .from(vendorConfirmationSessions)
      .where(
        and(
          eq(vendorConfirmationSessions.id, input.sessionId),
          eq(vendorConfirmationSessions.tenant_id, input.tenantId),
          eq(
            vendorConfirmationSessions.purchase_order_id,
            input.purchaseOrderId
          ),
          eq(vendorConfirmationSessions.state, 'pending'),
          gt(vendorConfirmationSessions.expires_at, new Date())
        )
      )
      .limit(1)
      .for('share')

    if (!session) return null

    const token = deriveVendorConfirmationToken(
      secret,
      input.tenantId,
      session.id
    )
    const url = new URL(
      `/v1/public/purchase-orders/${token}/confirmation`,
      parsedBaseUrl
    )
    return url.toString()
  }
}
