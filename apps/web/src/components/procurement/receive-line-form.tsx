import Link from 'next/link'
import { isStockReceiptReceivablePoStatus } from '@third-code-erp/shared-types'

interface ReceiveLineFormProps {
  purchaseOrderId: string
  purchaseOrderStatus: string
  /** The viewer holds `inventory.manage`, which the receipt page requires. */
  canReceive: boolean
  orderedMicros: number
  receivedMicros: number
}

function formatQuantity(micros: number): string {
  return (micros / 1_000_000).toLocaleString('en-PH', { maximumFractionDigits: 6 })
}

export function ReceiveLineForm({
  purchaseOrderId,
  purchaseOrderStatus,
  canReceive,
  orderedMicros,
  receivedMicros,
}: ReceiveLineFormProps) {
  // Exact micros: the integer quantity/received_qty mirrors round differently.
  const fullyReceived = receivedMicros >= orderedMicros
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
        {formatQuantity(receivedMicros)} / {formatQuantity(orderedMicros)}
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
