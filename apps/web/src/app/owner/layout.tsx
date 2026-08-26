import { redirect } from 'next/navigation'
import { getUser } from '@third-code-erp/auth'
import { isOwnerAdminUser } from '@/lib/owner-admin'

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) redirect('/auth/login')
  if (!isOwnerAdminUser(user)) redirect('/dashboard?error=owner-forbidden')

  return children
}
