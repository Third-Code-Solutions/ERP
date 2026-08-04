import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  getPurchaseOrderDuplicateGroups,
  type PurchaseOrderDuplicateGroup,
} from '@/lib/admin/data-quality-queries'
import styles from './data-quality.module.css'

export const metadata: Metadata = { title: 'Data quality' }

function formatDate(value: Date | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(value)
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function totalRecords(groups: PurchaseOrderDuplicateGroup[]) {
  return groups.reduce((total, group) => total + group.recordCount, 0)
}

export default async function DataQualityPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.system_config')) {
    redirect('/admin?error=forbidden')
  }

  const groups = await getPurchaseOrderDuplicateGroups(profile.tenantId)
  const affectedRecords = totalRecords(groups)
  const reviewRequired = groups.length > 0

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Release readiness</p>
          <h1 className={styles.title}>Data quality</h1>
          <p className={styles.subtitle}>
            Review tenant-scoped identifiers before a schema change reaches the
            official record of truth.
          </p>
        </div>
        <div className={`${styles.status} ${reviewRequired ? styles.statusReview : styles.statusClear}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          {reviewRequired ? 'Review required' : 'Clear to review'}
        </div>
      </header>

      <section className={styles.metrics} aria-label="Data quality summary">
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Duplicate groups</span>
          <strong>{groups.length}</strong>
          <span>Tenant-scoped Purchase Order numbers</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Affected records</span>
          <strong>{affectedRecords}</strong>
          <span>Review before uniqueness is enforced</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Authority</span>
          <strong>Read-only</strong>
          <span>No rename, delete, or repair action is available here</span>
        </div>
      </section>

      <section className={styles.notice} aria-label="Release gate note">
        <span className={styles.noticeMark} aria-hidden="true">!</span>
        <div>
          <strong>Protect the history first.</strong>
          <p>
            Export linked lines, documents, and audit evidence. Choose a
            canonical record with the owner before running any repair migration.
          </p>
        </div>
      </section>

      {groups.length === 0 ? (
        <section className={styles.empty} aria-live="polite">
          <span className={styles.emptyIcon} aria-hidden="true">✓</span>
          <h2>No duplicate Purchase Order numbers found</h2>
          <p>This tenant passes the identifier check used by the next migration gate.</p>
        </section>
      ) : (
        <section className={styles.groups} aria-label="Duplicate Purchase Order groups">
          {groups.map((group) => (
            <article className={styles.group} key={group.poNumber}>
              <header className={styles.groupHeader}>
                <div>
                  <p className={styles.groupEyebrow}>Purchase Order number</p>
                  <h2>{group.poNumber}</h2>
                </div>
                <div className={styles.groupMeta}>
                  <strong>{group.recordCount} records</strong>
                  <span>{group.projectCount} project{group.projectCount === 1 ? '' : 's'}</span>
                </div>
              </header>

              <div className={styles.groupSummary}>
                <span>Created {formatDate(group.firstCreatedAt)} → {formatDate(group.lastCreatedAt)}</span>
                <div className={styles.statuses} aria-label="Record status counts">
                  {Object.entries(group.statusCounts).map(([status, count]) => (
                    <span className={styles.statusChip} key={status}>
                      {count} {statusLabel(status)}
                    </span>
                  ))}
                </div>
              </div>

              <ol className={styles.records}>
                {group.records.map((record, index) => (
                  <li key={record.id} className={styles.record}>
                    <span className={styles.ordinal}>{String(index + 1).padStart(2, '0')}</span>
                    <div className={styles.recordCopy}>
                      <strong>{index === 0 ? 'Earliest-created candidate' : 'Later-created duplicate'}</strong>
                      <span>{statusLabel(record.status)} · {formatDate(record.createdAt)}</span>
                    </div>
                    <Link href={`/purchase-orders/${record.id}`} className={styles.recordLink}>
                      Open record <span aria-hidden="true">↗</span>
                    </Link>
                  </li>
                ))}
              </ol>
              {group.recordsOmitted > 0 && (
                <p className={styles.omitted}>{group.recordsOmitted} additional records omitted from this review view.</p>
              )}
            </article>
          ))}
        </section>
      )}

      <footer className={styles.footerNote}>
        <span>Tenant: {profile.email}</span>
        <span>Generated from the current database snapshot · no records changed</span>
      </footer>
    </main>
  )
}
