import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOwnerAdmin } from '@/lib/owner-admin'
import { getOwnerConsoleData } from '@/lib/owner-console-data'
import { formatDemoRequestStatus } from '@/lib/platform-demo-status'
import { DemoRequestReviewForm } from './demo-request-review-form'
import { OrganizationForm } from './organization-form'
import styles from './owner-console.module.css'

export const metadata: Metadata = {
  title: 'Owner console',
  robots: { index: false, follow: false },
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(value)
}

function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(value)
}

export default async function OwnerConsolePage() {
  const owner = await requireOwnerAdmin()
  const data = await getOwnerConsoleData()

  const metrics = [
    { label: 'Organizations', value: data.metrics.organizations, detail: 'Provisioned workspaces' },
    { label: 'Users', value: data.metrics.users, detail: 'Across all organizations' },
    { label: 'Active projects', value: data.metrics.activeProjects, detail: 'Not retired or closed' },
    { label: 'Open pipeline', value: data.metrics.openOpportunities, detail: 'Unwon opportunities' },
    { label: 'Demo requests', value: data.metrics.demoRequests, detail: `${data.metrics.newDemoRequests} new` },
  ]

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ABI OPS · platform control</p>
          <h1>Owner console</h1>
          <p>Cross-organization visibility and controlled workspace provisioning.</p>
        </div>
        <div className={styles.headerActions}>
          <span>{owner.email}</span>
          <Link className={styles.secondaryLink} href="/dashboard">Open workspace</Link>
        </div>
      </header>

      <section aria-label="Platform analytics" className={styles.metricGrid}>
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <p>{metric.label}</p>
            <strong>{metric.value.toLocaleString('en-PH')}</strong>
            <span>{metric.detail}</span>
          </article>
        ))}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Provisioning</p>
              <h2>Create an organization</h2>
            </div>
            <span className={styles.lockNotice}>Owner-only</span>
          </div>
          <p className={styles.panelDescription}>
            This creates a company workspace only. User invitations remain separate while the ERP keeps its current single-tenant session model.
          </p>
          <OrganizationForm />
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Platform activity</p>
              <h2>Recent owner actions</h2>
            </div>
          </div>
          {data.platformActivity.length ? (
            <ol className={styles.activityList}>
              {data.platformActivity.map((activity) => (
                <li key={activity.id}>
                  <div>
                    <strong>{activity.entityType.replaceAll('_', ' ')} · {activity.action}</strong>
                    <span>{activity.actorEmail ?? 'Public request'} · {formatTimestamp(activity.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className={styles.emptyState}>No platform actions have been recorded yet.</p>}
        </article>
      </section>

      <section className={styles.panel} aria-labelledby="organization-analytics-heading">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Organization analytics</p>
            <h2 id="organization-analytics-heading">Every workspace at a glance</h2>
          </div>
          <span className={styles.tableMeta}>{data.organizations.length} total</span>
        </div>
        {data.organizations.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr><th scope="col">Organization</th><th scope="col">Type</th><th scope="col">Users</th><th scope="col">Active projects</th><th scope="col">Open pipeline</th><th scope="col">Created</th></tr>
              </thead>
              <tbody>
                {data.organizations.map((organization) => (
                  <tr key={organization.id}>
                    <th scope="row"><strong>{organization.name}</strong><span>{organization.slug}</span></th>
                    <td>{organization.organization_type.replaceAll('-', ' ')}</td>
                    <td>{organization.users}</td>
                    <td>{organization.activeProjects}</td>
                    <td>{organization.openOpportunities}</td>
                    <td>{formatDate(organization.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.emptyState}>No organizations are provisioned yet.</p>}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Tenant activity</p>
              <h2>Recent ERP events</h2>
            </div>
          </div>
          {data.tenantActivity.length ? (
            <ol className={styles.activityList}>
              {data.tenantActivity.map((activity) => (
                <li key={activity.id}>
                  <div>
                    <strong>{activity.tenantName}</strong>
                    <span>{activity.entityType} · {activity.action} · {formatTimestamp(activity.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className={styles.emptyState}>No tenant audit activity is available yet.</p>}
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Demo funnel</p>
              <h2>Requests needing attention</h2>
            </div>
            <Link className={styles.secondaryLink} href="/book-demo">Open public page</Link>
          </div>
          <p className={styles.panelDescription}>
            {data.metrics.newDemoRequests} new request{data.metrics.newDemoRequests === 1 ? '' : 's'} out of {data.metrics.demoRequests} total.
          </p>
          <div className={styles.statusSummary}>
            {data.demoRequests.slice(0, 4).map((request) => (
              <span key={request.id}>{request.company_name} · {formatDemoRequestStatus(request.status)}</span>
            ))}
            {!data.demoRequests.length ? <span>No requests yet.</span> : null}
          </div>
        </article>
      </section>

      <section className={styles.demoSection} aria-labelledby="demo-requests-heading">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Inbound interest</p>
          <h2 id="demo-requests-heading">Demo requests</h2>
          <p>Review the contact, company, operational need, and next action in one place.</p>
        </div>
        {data.demoRequests.length ? (
          <div className={styles.demoList}>
            {data.demoRequests.map((request) => <DemoRequestReviewForm key={request.id} request={request} />)}
          </div>
        ) : <p className={styles.emptyState}>No one has requested a demo yet.</p>}
      </section>
    </main>
  )
}
