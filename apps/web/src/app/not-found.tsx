import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="route-state" role="status">
      <p className="page-eyebrow">404 · Not found</p>
      <h1 className="page-title">That record or view does not exist</h1>
      <p className="page-subtitle">
        It may have moved, or your workspace may not have access to it.
      </p>
      <div className="route-state-actions">
        <Link className="button button-primary" href="/">
          Return home
        </Link>
        <Link className="button button-secondary" href="/dashboard">
          Open Dashboard
        </Link>
      </div>
    </main>
  )
}
