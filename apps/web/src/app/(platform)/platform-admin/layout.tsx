import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ThemeToggle } from '@/components/nav/theme-toggle'
import { PlatformSupportBanner } from './_support-banner'
import { PlatformNavigation } from './_platform-nav'

export const metadata: Metadata = {
  title: 'Platform Control',
  robots: { index: false, follow: false },
}

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('erp_theme')?.value === 'dark' ? 'dark' : 'light'
  return (
    <div className="platform-layout" data-theme={theme}>
      <a href="#platform-main" className="skip-link">
        Skip to platform content
      </a>
      <PlatformNavigation />
      <main id="platform-main" className="platform-main" tabIndex={-1}>
        <div className="platform-topline">
          <span>ABI OPS <span aria-hidden="true"> / </span> Platform Control</span>
          <ThemeToggle initialTheme={theme} />
          <span className="platform-owner-chip">Platform owner</span>
        </div>
        <div className="platform-content">
          <details className="platform-session-note"><summary>Protected administration</summary><p>Platform changes require a sign-in within the last 15 minutes. If prompted, return to the tenant workspace, sign out, and sign in again. Refreshing a token does not renew this window.</p></details>
          <PlatformSupportBanner />{children}
        </div>
      </main>
    </div>
  )
}
