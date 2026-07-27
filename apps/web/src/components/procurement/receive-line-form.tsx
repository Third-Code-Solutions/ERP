import Link from 'next/link'

interface ReceiveLineFormProps {
  quantity: number
  receivedQty: number
  disabled?: boolean
}

export function ReceiveLineForm({
  quantity,
  receivedQty,
  disabled = false,
}: ReceiveLineFormProps) {
  const fullyReceived = receivedQty >= quantity

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
      {!fullyReceived && !disabled && (
        <Link
          href="/inventory/receipts/new"
          className="finance-text-button"
          title="Create controlled Stock Receipt"
        >
          Receive
        </Link>
      )}
    </div>
  )
}
