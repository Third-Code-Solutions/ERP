import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getUserProfile } from '@buildops/auth'
import { Sidebar } from '@/components/nav/sidebar'
import { Topbar } from '@/components/nav/topbar'
import { canViewPath } from '@/lib/abi/nav-config'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getUserProfile()

  if (!profile) {
    redirect('/auth/login')
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
        </main>
      </div>
    </div>
  )
}
