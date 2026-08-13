import Link from 'next/link'

export default function DashboardNotFound() {
  return (
    <main className="route-state" role="status">
      <p className="page-eyebrow">Record unavailable</p>
      <h1 className="page-title">We could not find that workspace record</h1>
      <p className="page-subtitle">
        Check the link, tenant, or record identifier, then try again.
      </p>
      <div className="route-state-actions">
        <Link className="button button-primary" href="/dashboard">
          Go to Dashboard
        </Link>
        <Link className="button button-secondary" href="/projects">
          Browse Projects
        </Link>
      </div>
    </main>
  )
}
