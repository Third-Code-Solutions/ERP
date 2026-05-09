import type { Metadata } from 'next'
import { NewProjectForm } from './new-project-form'

export const metadata: Metadata = { title: 'New Project' }

export default function NewProjectPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Project</h1>
        <p className="page-subtitle">Create a new project workspace</p>
      </div>

      <div
        style={{
          background: 'white',
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
