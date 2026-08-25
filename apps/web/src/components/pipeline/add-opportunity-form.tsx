import Link from 'next/link'

interface Project {
  id: string
  name: string
  client: string
}

interface AddOpportunityFormProps {
  projects: Project[]
}

/**
 * Compatibility entry point for older coverage surfaces. New opportunities
 * belong to Sales and must start as Leads, so this component intentionally
 * routes users to the canonical Sales board instead of accepting a project ID.
 */
export function AddOpportunityForm({ projects: _projects }: AddOpportunityFormProps) {
  return (
    <Link
      href="/pipeline/board"
      style={{
        display: 'inline-block',
        background: 'var(--color-navy-700)',
        color: 'white',
        borderRadius: '6px',
        padding: '7px 14px',
        fontSize: '0.8125rem',
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      + New Sales Lead
    </Link>
  )
}
