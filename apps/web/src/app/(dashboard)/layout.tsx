import { redirect } from 'next/navigation'
import { getUser } from '@buildops/auth'
import { Sidebar } from '@/components/nav/sidebar'
import { Topbar } from '@/components/nav/topbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="app-layout">
      <Sidebar user={user} />
      <div className="app-main">
        <Topbar user={user} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
