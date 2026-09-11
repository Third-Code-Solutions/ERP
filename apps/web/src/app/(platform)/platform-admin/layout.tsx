import type { Metadata } from 'next'
import Link from 'next/link'
import { PlatformSupportBanner } from './_support-banner'
import { PlatformNavigation } from './_platform-nav'

export const metadata: Metadata = {
  title: 'Platform Control',
  robots: { index: false, follow: false },
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="platform-layout">
      <a href="#platform-main" className="skip-link">
        Skip to platform content
      </a>
      <aside className="platform-sidebar" aria-label="Platform administration">
        <div className="platform-brand">
          <span className="platform-brand-mark">A</span>
          <div>
            <strong>ABI OPS</strong>
            <span>Platform Control</span>
          </div>
        </div>
        <p className="platform-restricted">Restricted global authority</p>
        <PlatformNavigation />
        <div className="platform-sidebar-footer">
          <Link href="/dashboard">Return to tenant workspace</Link>
        </div>
      </aside>
      <main id="platform-main" className="platform-main">
        <div className="platform-topline">
          <span>Global administration</span>
          <span className="platform-owner-chip">Platform owner</span>
        </div>
        <p className="platform-flash">Platform changes require a sign-in within the last 15 minutes. If prompted, return to the tenant workspace, sign out, and sign in again. Refreshing a token does not renew this window.</p>
        <div className="platform-content"><PlatformSupportBanner />{children}</div>
      </main>
    </div>
  )
}
