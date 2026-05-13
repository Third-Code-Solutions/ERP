/**
 * Empty-state card for customer-portal sections. Used for "no progress
 * update yet", "no upcoming milestones", "no weekly reports", etc. Keep
 * the surface calm — no scolding tone, no error coloration.
 */

interface PortalEmptyProps {
  title: string
  body?: string
}

export function PortalEmpty({ title, body }: PortalEmptyProps) {
  return (
    <div
      style={{
        padding: '24px 20px',
        textAlign: 'center',
        background: '#fafbfc',
        border: '1px dashed #d8dde6',
        borderRadius: 10,
        color: '#525866',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: '#14213d',
        }}
      >
        {title}
      </p>
      {body && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: '#6b7280',
            lineHeight: 1.55,
          }}
        >
          {body}
        </p>
      )}
    </div>
  )
}
