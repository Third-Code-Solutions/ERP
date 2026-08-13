import React from 'react'

const authBrand = {
  mark: 'A',
  name: 'ABI OPS',
  organization: 'Actuate Builders Inc.',
} as const

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      {/* Skip link for keyboard users — appears on focus only */}
      <a href="#auth-main" className="skip-link">
        Skip to sign-in form
      </a>

      {/* Left — brand panel. Collapses to a slim header on mobile. */}
      <aside className="auth-panel-brand" aria-hidden="true">
        <div className="auth-brand-bg" />
        <div className="auth-brand-inner">
          <div className="auth-brand-top">
            <div className="auth-brand-mark">
              <span className="auth-brand-mark-letter">{authBrand.mark}</span>
            </div>
            <div className="auth-brand-text">
              <p className="auth-brand-name">{authBrand.name}</p>
              <p className="auth-brand-org">{authBrand.organization}</p>
            </div>
          </div>

          <div className="auth-brand-body">
            <p className="auth-brand-eyebrow">Operations platform</p>
            <h2 className="auth-brand-headline">
              One system from <em>blueprint</em> to <em>handover</em>.
            </h2>
            <p className="auth-brand-sub">
              Unified pipeline, BOM, procurement, construction, and warranty —
              built for Philippine fit-out and MEP contractors.
            </p>

            <ul className="auth-brand-features">
              <li>
                <span className="auth-brand-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>Auto-generated BOM from drawings and Togal exports</span>
              </li>
              <li>
                <span className="auth-brand-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>Real-time pipeline with SLA tracking and KYC gating</span>
              </li>
              <li>
                <span className="auth-brand-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>PH-ready progress billing controls with hash-chained audit</span>
              </li>
            </ul>
          </div>

          <footer className="auth-brand-foot">
            <span className="auth-brand-status">
              <span className="auth-brand-status-dot" /> Protected workspace access
            </span>
            <span className="auth-brand-copy">© 2026 {authBrand.organization}</span>
          </footer>
        </div>
      </aside>

      {/* Right — form panel. */}
      <main id="auth-main" className="auth-panel-form" aria-label="Sign-in panel">
        {/* Compact brand for mobile (brand panel is hidden) */}
        <div className="auth-form-mobile-brand">
          <div className="auth-brand-mark">
            <span className="auth-brand-mark-letter">{authBrand.mark}</span>
          </div>
          <div>
            <p className="auth-brand-name" style={{ color: 'var(--color-navy-700)' }}>{authBrand.name}</p>
            <p className="auth-brand-org" style={{ color: 'var(--color-neutral-500)' }}>{authBrand.organization}</p>
          </div>
        </div>

        <div className="auth-form-column">{children}</div>

        <p className="auth-form-legal">
          Use is governed by your organization&apos;s authorized-use and data
          policies.
        </p>
      </main>
    </div>
  )
}
