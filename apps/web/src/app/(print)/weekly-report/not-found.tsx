import Link from 'next/link'

/**
 * Keep an invalid or tenant-inaccessible report link inside the print shell.
 * This boundary gives shared links a clear, useful destination without
 * leaking whether a report exists in another tenant.
 */
export default function WeeklyReportNotFound() {
  return (
    <main className="route-state" role="status">
      <p className="page-eyebrow">Report unavailable</p>
      <h1 className="page-title">We could not find that weekly report</h1>
      <p className="page-subtitle">
        The report may have moved, or your workspace may not have access to it.
      </p>
      <div className="route-state-actions">
        <Link className="button button-primary" href="/reports">
          Open Reports
        </Link>
        <Link className="button button-secondary" href="/dashboard">
          Open Dashboard
        </Link>
      </div>
    </main>
  )
}
