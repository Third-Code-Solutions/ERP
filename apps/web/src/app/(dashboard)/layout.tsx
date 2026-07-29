import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getUserProfile } from '@third-code-erp/auth'
import { Sidebar } from '@/components/nav/sidebar'
import { Topbar } from '@/components/nav/topbar'
import { AccountNotProvisioned } from '@/components/auth/account-not-provisioned'
import { CortexRouteContext } from '@/components/cortex/cortex-route-context'
import { canViewPath } from '@/lib/operations/nav-config'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getUserProfile()

  // Middleware already redirects unauthenticated users to /auth/login before
  // this layout runs, so a null profile here means: session is valid but the
  // user has no public.users row. We must NOT redirect to /auth/login — the
  // middleware would bounce the authenticated user straight back here, causing
  // an infinite redirect loop. Render a terminal screen with a sign-out path.
  if (!profile) {
    return <AccountNotProvisioned />
  }

  // Defense-in-depth: even if a user types a forbidden URL, the layout
  // refuses to render the protected page. The sidebar already hides
  // these links, but this catches direct navigation, copy-pasted links,
  // and any internal `router.push` to a route the role can't view.
  //
  // Middleware sets `x-pathname` on the request — see `apps/web/src/middleware.ts`.
  const hdrs = await headers()
  const pathname = hdrs.get('x-pathname') ?? ''
  if (pathname && !canViewPath(profile.role, pathname)) {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar
        user={profile.user}
        role={profile.role}
        fullName={profile.fullName}
      />
      <div className="app-main">
        <Topbar
          user={profile.user}
          role={profile.role}
          fullName={profile.fullName}
          tenantId={profile.tenantId}
        />
        <main id="main-content" className="app-content">
          {children}
          <CortexRouteContext pathname={pathname} />
        </main>
      </div>
    </div>
  )
}
