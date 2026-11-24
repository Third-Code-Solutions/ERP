import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { requireRouteAccess } from '@/lib/require-route-access'
import { NewProjectForm } from './new-project-form'

export const metadata: Metadata = { title: 'New Project' }

export default async function NewProjectPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'project.create')) {
    redirect('/projects?error=forbidden')
  }
  requireRouteAccess(profile.role, '/projects/new')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Project</h1>
        <p className="page-subtitle">Create a new project workspace</p>
      </div>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '600px',
        }}
      >
        <NewProjectForm />
      </div>
    </div>
  )
}
