import Link from 'next/link'

export function PlatformPageHeader({
  eyebrow = 'Platform control',
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <header className="platform-page-header">
      <div>
        <p className="page-eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{description}</p>
      </div>
      {actions ? <div className="platform-header-actions">{actions}</div> : null}
    </header>
  )
}

export function PlatformFlash({
  notice,
  error,
}: {
  notice?: string
  error?: string
}) {
  if (!notice && !error) return null
  return (
    <div className={`platform-flash ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>
      {error || notice}
    </div>
  )
}

export function PlatformUnavailable({
  title = 'Platform data unavailable',
  message,
}: {
  title?: string
  message: string
}) {
  return (
    <section className="card platform-unavailable" role="alert">
      <p className="page-eyebrow">Fail-closed response</p>
      <h2>{title}</h2>
      <p>{message}</p>
      <Link href="/platform-admin" className="button button-secondary">
        Return to platform overview
      </Link>
    </section>
  )
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: number | string
  detail: string
}) {
  return (
    <article className="card platform-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone = ['active', 'available', 'configured', 'succeeded', 'accepted', 'sent'].includes(status)
    ? 'good'
    : ['suspended', 'pending', 'invited'].includes(status)
      ? 'warning'
      : 'danger'
  return <span className={`platform-status is-${tone}`}>{status.replaceAll('_', ' ')}</span>
}

export function EmptyPlatformState({ children }: { children: React.ReactNode }) {
  return <div className="card-empty">{children}</div>
}

export function PlatformDirectoryFilters({ path, q, status, statuses }: {
  path: string
  q?: string
  status?: string
  statuses: readonly string[]
}) {
  return <form method="get" action={path} className="platform-filter-form">
    <label>Search<input type="search" name="q" defaultValue={q} maxLength={120} /></label>
    <label>Status<select name="status" defaultValue={status || ''}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <button className="button button-secondary" type="submit">Filter</button>
    {q || status ? <Link href={path}>Clear filters</Link> : null}
  </form>
}

export function PlatformPagination({ path, page, totalPages, params, pageKey = 'page' }: {
  path: string
  page: number
  totalPages: number
  params: Record<string, string | undefined>
  pageKey?: string
}) {
  function href(target: number) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'notice' && key !== 'error') query.set(key, value)
    }
    query.set(pageKey, String(target))
    return `${path}?${query}`
  }
  return <nav className="platform-pagination" aria-label={`${pageKey === 'invitationPage' ? 'Invitation' : 'Directory'} pages`}>
    <span>Page {page} of {Math.max(1, totalPages)}</span>
    {page > 1 ? <Link className="button button-secondary" href={href(page - 1)}>Previous</Link> : null}
    {page < totalPages ? <Link className="button button-secondary" href={href(page + 1)}>Next</Link> : null}
  </nav>
}
