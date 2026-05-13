import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUserProfile, can } from '@buildops/auth'
import { NewUserForm } from '@/components/admin/new-user-form'

export const metadata: Metadata = { title: 'New user' }

export default async function NewUserPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.users')) {
    redirect('/admin?error=forbidden')
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/admin/users" style={{ color: 'inherit', textDecoration: 'none' }}>
            Administration · Users ·
          </Link>{' '}
          New
        </p>
        <h1 className="page-title">Create user</h1>
        <p className="page-subtitle">
          Provision a new workspace account. Email + initial password are required;
          the user can change their password after signing in.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ padding: 20 }}>
          <NewUserForm />
        </div>
      </div>
    </div>
  )
}
