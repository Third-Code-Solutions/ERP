import Link from 'next/link'
import { isStockReceiptReceivablePoStatus } from '@third-code-erp/shared-types'

interface ReceiveLineFormProps {
  purchaseOrderId: string
  purchaseOrderStatus: string
  /** The viewer holds `inventory.manage`, which the receipt page requires. */
  canReceive: boolean
  quantity: number
  receivedQty: number
}

export function ReceiveLineForm({
  purchaseOrderId,
  purchaseOrderStatus,
  canReceive,
  quantity,
  receivedQty,
}: ReceiveLineFormProps) {
  const fullyReceived = receivedQty >= quantity
  const showReceive =
    !fullyReceived &&
    canReceive &&
    isStockReceiptReceivablePoStatus(purchaseOrderStatus)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          color: fullyReceived
            ? 'var(--color-green-700, #047857)'
            : 'var(--color-neutral-600)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          fontWeight: 650,
        }}
      >
        {receivedQty} / {quantity}
      </span>
      {showReceive && (
        <Link
          href={`/inventory/receipts/new?po=${encodeURIComponent(purchaseOrderId)}`}
          className="finance-text-button"
          title="Create controlled Stock Receipt"
        >
          Receive
        </Link>
      )}
    </div>
  )
}
