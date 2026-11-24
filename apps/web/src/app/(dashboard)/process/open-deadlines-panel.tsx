import Link from 'next/link'
import { IconClock } from '@/components/ui/icons'
import {
  formatDeadlineRemaining,
  summarizeDeadlines,
  type DeadlineStatus,
  type OpenDeadline,
} from '@/lib/operations/sla-clock-deadlines'
import { ProcessRetry } from './retry'
import type { OpenDeadlinesResult } from './open-deadlines'
import styles from './process.module.css'

const STATUS_TEXT: Record<DeadlineStatus, string> = {
  overdue: 'Overdue',
  at_risk: 'At risk',
  on_track: 'On track',
}

const STATUS_MARK: Record<DeadlineStatus, string | undefined> = {
  overdue: styles.breachMark,
  at_risk: styles.riskMark,
  on_track: styles.onTrackMark,
}

const DAY_MS = 24 * 60 * 60 * 1000

function dueText(deadline: OpenDeadline): string {
  // A business-day clock breaches at the midnight that ends its last day: show that day.
  const due =
    deadline.unit === 'business_days' ? new Date(deadline.dueAt.getTime() - DAY_MS) : deadline.dueAt
  return due.toLocaleString('en-PH', {
    dateStyle: 'medium',
    ...(deadline.unit === 'calendar_hours' ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Manila',
  })
}

export function OpenDeadlinesPanel({ result }: { result: OpenDeadlinesResult }) {
  return (
    <section
      className={`${styles.panel} ${styles.deadlines}`}
      aria-labelledby="open-deadlines"
    >
      <div className={styles.header}>
        <IconClock size={18} />
        <div className={styles.sectionHeading}>
          <h2 id="open-deadlines" className="card-title">
            Open deadlines
          </h2>
        </div>
      </div>

      {!result.ok ? (
        <div className={styles.failure} role="alert">
          <p>
            We could not load your open deadlines. Try again; if the problem
            continues, contact your workspace administrator.
          </p>
          <ProcessRetry />
        </div>
      ) : result.total === 0 ? (
        <p className={styles.deadlineEmpty} role="status">
          {result.truncated
            ? 'More open deadlines exist than can be listed here, and none of those read could be shown. Contact your workspace administrator.'
            : 'No open deadlines. A deadline starts when an opportunity changes stage, a permit or checklist item is opened, a punchlist item is raised or a warranty ticket comes in.'}
        </p>
      ) : (
        <>
          <DeadlineSummary deadlines={result.deadlines} total={result.total} truncated={result.truncated} />
          <div className={styles.tableScroll}>
            <table className={`data-table ${styles.table}`}>
              <caption className="sr-only">
                Open deadlines, most urgent first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Deadline</th>
                  <th scope="col">Item</th>
                  <th scope="col">Due</th>
                  <th scope="col">Time</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.deadlines.map((deadline) => (
                  <tr key={deadline.id}>
                    <td>
                      <span className={styles.deadlineStatus}>
                        <span className={STATUS_MARK[deadline.status]} />
                        {STATUS_TEXT[deadline.status]}
                      </span>
                    </td>
                    <th scope="row">{deadline.label}</th>
                    <td>
                      <div>{deadline.subject}</div>
                      {deadline.subjectName ? (
                        <div className="muted">{deadline.subjectName}</div>
                      ) : null}
                    </td>
                    <td>{dueText(deadline)}</td>
                    <td>{formatDeadlineRemaining(deadline)}</td>
                    <td>
                      {deadline.href ? (
                        <Link href={deadline.href}>
                          Open<span className="sr-only"> {deadline.subject}</span>
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function DeadlineSummary({
  deadlines,
  total,
  truncated,
}: {
  deadlines: readonly OpenDeadline[]
  total: number
  truncated: boolean
}) {
  const counts = summarizeDeadlines(deadlines)
  const summary =
    total === deadlines.length
      ? `${total} open ${total === 1 ? 'deadline' : 'deadlines'}: ${counts.overdue} overdue, ${counts.at_risk} at risk, ${counts.on_track} on track.`
      : `Showing the ${deadlines.length} most urgent of ${total} open deadlines.`
  return (
    <p className={styles.deadlineSummary}>
      {summary}
      {truncated ? ' More open deadlines exist than can be listed here.' : ''}
    </p>
  )
}
