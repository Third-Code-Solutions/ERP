import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BOM Portal | ABI OPS',
  robots: { index: false, follow: false },
}

/**
 * Public, unauthenticated shell for client-facing BOM review/signature.
 * No sidebar, no app chrome — just a navy-branded header + content area
 * and a footer noting validity. Anti-template per design-quality rules:
 * editorial header with sharp accent CTA tone (gold).
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header-inner">
          <div>
            <p className="portal-eyebrow">Actuate Builders Inc.</p>
            <h1 className="portal-brand">ABI OPS · Client Portal</h1>
          </div>
          <span className="portal-pill">Secure link</span>
        </div>
      </header>
      <main className="portal-main">{children}</main>
      <footer className="portal-footer">
        <p>
          This portal is for the named recipient only. If you weren't expecting
          to receive a Bill of Materials from Actuate Builders Inc., please
          ignore this link.
        </p>
      </footer>
      <style>{`
        .portal-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, #f6f7f9 0%, #ebeef3 100%);
          color: #14213d;
          font-family: var(--font-inter), Inter, system-ui, sans-serif;
        }
        .portal-header {
          background: #0F2D4A;
          color: white;
          border-bottom: 4px solid #E07B2A;
        }
        .portal-header-inner {
          max-width: 1080px;
          margin: 0 auto;
          padding: 22px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .portal-eyebrow {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #d5b8a3;
          font-weight: 600;
        }
        .portal-brand {
          margin: 4px 0 0;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .portal-pill {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 5px 10px;
          border: 1px solid rgba(255,255,255,0.32);
          border-radius: 999px;
          color: rgba(255,255,255,0.86);
        }
        .portal-main {
          flex: 1;
          max-width: 1080px;
          width: 100%;
          margin: 0 auto;
          padding: 32px 28px 64px;
        }
        .portal-footer {
          max-width: 1080px;
          margin: 0 auto;
          padding: 16px 28px 32px;
          color: #6b7280;
          font-size: 12.5px;
          line-height: 1.6;
        }
      `}</style>
    </div>
  )
}
