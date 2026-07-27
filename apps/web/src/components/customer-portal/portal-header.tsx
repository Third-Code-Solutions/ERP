/**
 * Customer-portal project header.
 *
 * Sits at the top of every /portal/project/[token]/* page. Shows the Third Code
 * ERP mark, the project name, the project status pill, and (right side)
 * the viewer email + a friendly "forget this link" hint. No real auth —
 * the hint is purely visual; the actual revocation is admin-side.
 */

interface PortalHeaderProps {
  projectName: string
  status: string
  accountName?: string | null
  viewerEmail?: string | null
}

interface StatusTone {
  bg: string
  fg: string
  border: string
}

const DEFAULT_TONE: StatusTone = { bg: '#eef2f7', fg: '#3a4a63', border: '#cdd5e0' }

const STATUS_TONE: Record<string, StatusTone> = {
  lead: DEFAULT_TONE,
  qualified: DEFAULT_TONE,
  proposal: { bg: '#fff5e6', fg: '#9c6e15', border: '#f4d49a' },
  contract: { bg: '#e6f1ff', fg: '#1d4d8c', border: '#b8d3f0' },
  pre_construction: { bg: '#e6f1ff', fg: '#1d4d8c', border: '#b8d3f0' },
  in_progress: { bg: '#e7f5ec', fg: '#1f7a4d', border: '#bde1c8' },
  punchlist: { bg: '#fff5e6', fg: '#9c6e15', border: '#f4d49a' },
  turnover: { bg: '#e7f5ec', fg: '#1f7a4d', border: '#bde1c8' },
  closed: DEFAULT_TONE,
}

function statusLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function PortalHeader({
  projectName,
  status,
  accountName,
  viewerEmail,
}: PortalHeaderProps) {
  const tone: StatusTone = STATUS_TONE[status] ?? DEFAULT_TONE

  return (
    <header
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 20,
        boxShadow: '0 1px 2px rgba(15, 45, 74, 0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#0F2D4A',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.04em',
              border: '1px solid #0a233b',
              boxShadow: 'inset 0 -2px 0 #E07B2A',
            }}
          >
            TC
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#6b7280',
                fontWeight: 600,
              }}
            >
              Third Code ERP · Live project
            </p>
            <h1
              style={{
                margin: '6px 0 4px',
                fontSize: 22,
                fontWeight: 600,
                color: '#0F2D4A',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              {projectName}
            </h1>
            {accountName && (
              <p style={{ margin: 0, fontSize: 13, color: '#525866' }}>
                {accountName}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 999,
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
            }}
          >
            {statusLabel(status)}
          </span>
          {viewerEmail && (
            <div style={{ textAlign: 'right' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: '#6b7280',
                  letterSpacing: '0.04em',
                }}
              >
                Signed in as
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 13,
                  color: '#14213d',
                  fontWeight: 500,
                }}
              >
                {viewerEmail}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 11,
                  color: '#9aa1ad',
                }}
                title="Close this tab to forget the link. Contact your project team to revoke it."
              >
                Forget link · close this tab
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
