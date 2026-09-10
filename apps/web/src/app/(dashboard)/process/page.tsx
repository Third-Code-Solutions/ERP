import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import type {
  ProcessTaskQueueResult,
  ProcessTaskQueueStatus,
} from '@third-code-erp/shared-types'
import {
  getApprovalRoutePreviewThroughCoreApi,
  getProcessHealthThroughCoreApi,
  getProcessTaskQueueThroughCoreApi,
} from '@/lib/erp-core-client'
import { IconActivity, IconArrowUpRight, IconClock } from '@/components/ui/icons'
import { ProcessRetry } from './retry'
import styles from './process.module.css'
import { ProcessTaskActions } from './process-task-actions'

export const metadata: Metadata = { title: 'Process Health' }

const PURCHASE_ORDER_OBJECT_TYPE = 'purchase_order'
const CENTAVO_PATTERN = /^(0|[1-9][0-9]*)$/
const PROCESS_TASK_QUEUE_STATUS_VALUES: readonly ProcessTaskQueueStatus[] = [
  'pending',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
]
const PROCESS_TASK_QUEUE_LIMIT_OPTIONS = [25, 50, 100] as const

type SearchParamValue = string | string[] | undefined
type QueueFilterValues = {
  status?: string
  responsibleBu?: string
  page?: string
  limit?: string
}
type PreviewSearchParams = {
  objectType?: string
  amountCentavos?: string
}
type ProcessTaskQueueRow = ProcessTaskQueueResult['rows'][number]

interface ProcessHealthPageProps {
  searchParams?: Promise<Record<string, SearchParamValue>>
}

function number(value: number): string {
  return value.toLocaleString('en-PH')
}

function firstSearchParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function optionalSearchParam(value: SearchParamValue): string | undefined {
  const first = firstSearchParam(value)
  return first?.trim() ? first : undefined
}

function centavos(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function label(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

function processHref(
  filters: QueueFilterValues,
  preview: PreviewSearchParams,
  page: number,
  limit: number
): string {
  const params = new URLSearchParams()
  if (preview.objectType) params.set('objectType', preview.objectType)
  if (preview.amountCentavos) {
    params.set('amountCentavos', preview.amountCentavos)
  }
  if (filters.status) params.set('status', filters.status)
  if (filters.responsibleBu) {
    params.set('responsibleBu', filters.responsibleBu)
  }
  params.set('page', String(page))
  params.set('limit', String(limit))
  return `?${params.toString()}`
}

const PREVIEW_STATUS_COPY = {
  unconfigured: 'No active approval rules are configured for this object type.',
  no_match: 'No configured approval rule matches this amount.',
  incomplete: 'The configured route is incomplete for this amount.',
  ambiguous: 'More than one configured rule matches at one or more steps.',
  matched: 'Every configured step has one matching rule for this amount.',
} as const

const PREVIEW_STEP_STATUS_COPY = {
  matched: 'Matched',
  missing: 'Missing',
  ambiguous: 'Ambiguous',
} as const

function ProcessTaskQueueClockCell({
  clock,
}: {
  clock: ProcessTaskQueueRow['clock']
}) {
  if (!clock) {
    return <span className="muted">No active clock</span>
  }

  return (
    <div>
      <div>
        {clock.clockScope === 'external'
          ? 'External / track only'
          : 'Internal'}
      </div>
      <div>{clock.observeMode ? 'Observe mode' : 'Enforce mode'}</div>
      <div className="muted">
        {label(clock.clockType)} · Core status: {label(clock.status)}
      </div>
      <div className="muted">Due {dateTime(clock.dueAt)}</div>
    </div>
  )
}

interface ProcessTaskQueueSectionProps {
  canManage: boolean
  data: ProcessTaskQueueResult | null
  error: string | null
  filters: QueueFilterValues
  preview: PreviewSearchParams
}

function ProcessTaskQueueSection({
  canManage,
  data,
  error,
  filters,
  preview,
}: ProcessTaskQueueSectionProps) {
  return (
    <section className="card" aria-labelledby="process-task-queue">
      <div className="card-header">
        <div>
          <h2 id="process-task-queue" className="card-title">
            Process task queue
          </h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Core-owned process tasks. Subject references and assignee UUIDs
            remain opaque; clock labels are displayed exactly from Core.
          </p>
        </div>
        {data ? (
          <span className="badge">
            {number(data.total)} task{data.total === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {!canManage ? (
        <div className="card-empty" role="status">
          You do not have permission to view the process task queue.
        </div>
      ) : (
        <>
          <form
            method="get"
            aria-describedby="process-task-queue-filters-help"
          >
            {preview.objectType ? (
              <input
                type="hidden"
                name="objectType"
                value={preview.objectType}
              />
            ) : null}
            {preview.amountCentavos ? (
              <input
                type="hidden"
                name="amountCentavos"
                value={preview.amountCentavos}
              />
            ) : null}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <div>
                <label className="form-label" htmlFor="process-task-status">
                  Status
                </label>
                <select
                  id="process-task-status"
                  className="form-input"
                  name="status"
                  defaultValue={filters.status ?? ''}
                >
                  <option value="">All statuses</option>
                  {PROCESS_TASK_QUEUE_STATUS_VALUES.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="form-label"
                  htmlFor="process-task-responsible-bu"
                >
                  Responsible BU
                </label>
                <input
                  id="process-task-responsible-bu"
                  className="form-input"
                  name="responsibleBu"
                  type="text"
                  maxLength={120}
                  defaultValue={filters.responsibleBu ?? ''}
                  placeholder="e.g. Commercial"
                />
              </div>
              <input type="hidden" name="page" value="1" />
              <div>
                <label className="form-label" htmlFor="process-task-limit">
                  Rows per page
                </label>
                <select
                  id="process-task-limit"
                  className="form-input"
                  name="limit"
                  defaultValue={filters.limit ?? data?.limit ?? 25}
                >
                  {(() => {
                    const currentLimit = Number(filters.limit ?? data?.limit)
                    const options = PROCESS_TASK_QUEUE_LIMIT_OPTIONS.includes(
                      currentLimit as (typeof PROCESS_TASK_QUEUE_LIMIT_OPTIONS)[number]
                    )
                      ? PROCESS_TASK_QUEUE_LIMIT_OPTIONS
                      : Number.isInteger(currentLimit) &&
                          currentLimit >= 1 &&
                          currentLimit <= 100
                        ? [currentLimit, ...PROCESS_TASK_QUEUE_LIMIT_OPTIONS]
                            .filter(
                              (value, index, values) =>
                                values.indexOf(value) === index
                            )
                            .sort((left, right) => left - right)
                        : PROCESS_TASK_QUEUE_LIMIT_OPTIONS
                    return options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))
                  })()}
                </select>
              </div>
              <button type="submit" className="button-primary">
                Apply filters
              </button>
            </div>
            <p
              id="process-task-queue-filters-help"
              className="form-help"
              style={{ marginTop: 8 }}
            >
              Filters and pagination are stored in the URL for shareable,
              repeatable views.
            </p>
          </form>

          {error ? (
            <div className="card-empty" role="alert" style={{ marginTop: 16 }}>
              <strong>Verified task queue unavailable.</strong>{' '}
              {error} No synthetic tasks are shown.
            </div>
          ) : data?.rows.length === 0 ? (
            <>
              <div className="card-empty" role="status" style={{ marginTop: 16 }}>
                {data.total > 0
                  ? `No tasks are on page ${number(data.page)}. Use the recovery link below to return to the available results.`
                  : 'No process tasks match the selected filters.'}
              </div>
              {data.total > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginTop: 16,
                  }}
                >
                  <p className="muted" style={{ margin: 0 }}>
                    {number(data.total)} task{data.total === 1 ? '' : 's'} match
                    the selected filters.
                  </p>
                  <a
                    className="button-secondary"
                    href={processHref(filters, preview, 1, data.limit)}
                  >
                    Return to first page
                  </a>
                </div>
              ) : null}
            </>
          ) : data ? (
            <>
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table className="data-table">
                  <caption className="sr-only">
                    Core process task queue with statuses, ownership, blocked
                    reasons, and nullable SLA-clock evidence
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Process step</th>
                      <th scope="col">Responsible BU</th>
                      <th scope="col">Subject reference</th>
                      <th scope="col">Status</th>
                      <th scope="col">Assignee UUID</th>
                      <th scope="col">Blocked reason</th>
                      <th scope="col">Clock</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <div>{row.processStepCode}</div>
                          <div className="muted">{row.processStepName}</div>
                        </th>
                        <td>{row.responsibleBu}</td>
                        <td>
                          <div>{row.subjectType}</div>
                          <code style={{ wordBreak: 'break-all' }}>
                            {row.subjectId}
                          </code>
                        </td>
                        <td>{label(row.status)}</td>
                        <td>
                          {row.assignedTo ? (
                            <code style={{ wordBreak: 'break-all' }}>
                              {row.assignedTo}
                            </code>
                          ) : (
                            <span className="muted">Unassigned</span>
                          )}
                        </td>
                        <td>
                          {row.blockedReason ? (
                            row.blockedReason
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <ProcessTaskQueueClockCell clock={row.clock} />
                        </td>
                        <td>
                          <ProcessTaskActions
                            taskId={row.id}
                            status={row.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginTop: 16,
                }}
              >
                <p className="muted" style={{ margin: 0 }}>
                  Page {number(data.page)} of {number(data.totalPages)} ·{' '}
                  {number(data.total)} total task
                  {data.total === 1 ? '' : 's'}
                </p>
                {data.totalPages > 1 ? (
                  <nav aria-label="Process task queue pagination">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {data.page > 1 ? (
                        <a
                          className="button-secondary"
                          href={processHref(
                            filters,
                            preview,
                            data.page - 1,
                            data.limit
                          )}
                        >
                          Previous
                        </a>
                      ) : null}
                      {data.page < data.totalPages ? (
                        <a
                          className="button-secondary"
                          href={processHref(
                            filters,
                            preview,
                            data.page + 1,
                            data.limit
                          )}
                        >
                          Next
                        </a>
                      ) : null}
                    </div>
                  </nav>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  )
}

export default async function ProcessHealthPage({
  searchParams,
}: ProcessHealthPageProps) {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) {
    return (
      <div className="page-header">
        <h1 className="page-title">Process Health</h1>
        <p className="page-subtitle">You must be signed in to view process health.</p>
      </div>
    )
  }

  const result = await getProcessHealthThroughCoreApi()
  const health = result.ok ? result.data : null
  const resolvedSearch = searchParams ? await searchParams : {}
  const queueFilters: QueueFilterValues = {
    status: optionalSearchParam(resolvedSearch.status),
    responsibleBu: optionalSearchParam(resolvedSearch.responsibleBu),
    page: optionalSearchParam(resolvedSearch.page),
    limit: optionalSearchParam(resolvedSearch.limit),
  }
  const previewSearch: PreviewSearchParams = {
    objectType: optionalSearchParam(resolvedSearch.objectType),
    amountCentavos: optionalSearchParam(resolvedSearch.amountCentavos),
  }
  const canManageTaskQueue = can(profile.role, 'process.task.manage')
  const queueResult = canManageTaskQueue
    ? await getProcessTaskQueueThroughCoreApi(queueFilters)
    : null
  const taskQueue = queueResult?.ok ? queueResult.data ?? null : null
  const taskQueueError =
    queueResult && !queueResult.ok
      ? queueResult.error ?? 'Process task queue is unavailable.'
      : null
  const requestedAmount = firstSearchParam(resolvedSearch.amountCentavos)
  const previewResult =
    requestedAmount === undefined
      ? null
      : !CENTAVO_PATTERN.test(requestedAmount) || requestedAmount.length > 18
        ? {
            ok: false as const,
            status: 400,
            error:
              'Enter a non-negative integer amount in centavos (up to 18 digits).',
        }
        : await getApprovalRoutePreviewThroughCoreApi(requestedAmount)
  const previewData = previewResult?.ok ? previewResult.data : undefined
  const hasActivity = Boolean(health?.byBu.length)
  const totals = health?.byBu.reduce(
    (summary, bu) => ({
      openTasks: summary.openTasks + bu.openTasks,
      atRiskClocks: summary.atRiskClocks + bu.atRiskClocks,
      breachedClocks: summary.breachedClocks + bu.breachedClocks,
      escalatedClocks: summary.escalatedClocks + bu.escalatedClocks,
      externalBreachedClocks:
        summary.externalBreachedClocks + bu.externalBreachedClocks,
    }),
    {
      openTasks: 0,
      atRiskClocks: 0,
      breachedClocks: 0,
      escalatedClocks: 0,
      externalBreachedClocks: 0,
    },
  )

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Operations</p>
          <h1 className={styles.pageTitle}>Process Health</h1>
          <p className={styles.introduction}>
            Track workflow deadlines and the work that needs your team’s attention.
          </p>
        </div>
        {health && (
          <div className={styles.refresh}>
            <ProcessRetry label="Refresh" pendingLabel="Refreshing…" />
            <time
              className={styles.timestamp}
              dateTime={health.generatedAt}
              title={new Date(health.generatedAt).toLocaleString('en-PH', {
                dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
              })}
            >
              Updated {new Date(health.generatedAt).toLocaleTimeString('en-PH', {
                hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
              })} PHT
            </time>
          </div>
        )}
      </header>

      {!health ? (
        <section className={styles.panel} aria-labelledby="process-health-unavailable">
          <div className={styles.header}>
            <h2 id="process-health-unavailable" className="card-title">
              Process health could not be loaded
            </h2>
          </div>
          <div className={styles.failure} role="alert">
            <p>We could not retrieve the latest workflow deadlines. Try again; if the problem continues, contact your workspace administrator.</p>
            <ProcessRetry />
          </div>
        </section>
      ) : (
        <>
          {hasActivity && (
            <dl className={styles.summary} aria-label="Process health summary">
              {[
                { label: 'Open tasks', value: totals?.openTasks ?? 0 },
                { label: 'At risk', value: totals?.atRiskClocks ?? 0 },
                { label: 'Breached', value: totals?.breachedClocks ?? 0 },
                { label: 'Escalated', value: totals?.escalatedClocks ?? 0 },
                {
                  label: 'External breaches',
                  value: totals?.externalBreachedClocks ?? 0,
                },
              ].map((metric) => (
                <div className={styles.metric} key={metric.label}>
                  <dt className={styles.metricLabel}>{metric.label}</dt>
                  <dd className={styles.metricValue}>{number(metric.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className={styles.layout}>
            <section className={styles.panel} aria-labelledby="process-health-by-bu">
              <div className={styles.header}>
                <IconActivity size={18} />
                <div className={styles.sectionHeading}>
                  <h2 id="process-health-by-bu" className="card-title">
                    Health by business unit
                  </h2>
                </div>
              </div>

              {health.byBu.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <IconClock size={26} />
                  </div>
                  <div className={styles.emptyContent}>
                    <h3>No open workflow tasks</h3>
                    <p>
                      Workflow deadlines appear here by business unit.
                      Daily site tasks are available in My Tasks.
                    </p>
                    <div className={styles.actions}>
                      <Link className="button-primary" href="/tasks">
                        Open my tasks
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={`data-table ${styles.table}`}>
                    <caption className="sr-only">
                      Process health metrics grouped by responsible business unit
                    </caption>
                    <thead>
                      <tr>
                        <th>Business unit</th>
                        <th className="numeric">Open tasks</th>
                        <th className="numeric">At risk</th>
                        <th className="numeric">Breached</th>
                        <th className="numeric">Escalated</th>
                        <th className="numeric">External breach</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.byBu.map((bu) => (
                        <tr key={bu.responsibleBu}>
                          <th scope="row">{bu.responsibleBu}</th>
                          <td className="numeric">{number(bu.openTasks)}</td>
                          <td className="numeric">{number(bu.atRiskClocks)}</td>
                          <td className="numeric">{number(bu.breachedClocks)}</td>
                          <td className="numeric">{number(bu.escalatedClocks)}</td>
                          <td className="numeric">
                            {number(bu.externalBreachedClocks)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {hasActivity && (
                <p className={styles.mode}>
                  {health.observeMode
                    ? 'Deadlines are being monitored. Automatic escalation is off.'
                    : 'Automatic escalation is enabled for eligible internal deadlines.'}
                  {' '}External delays do not trigger escalation against your team.
                </p>
              )}
            </section>
            <aside className={styles.guide} aria-labelledby="process-status-guide">
              <h2 id="process-status-guide">Reading this view</h2>
              <dl className={styles.definitions}>
                <div>
                  <dt><span className={styles.riskMark} />At risk</dt>
                  <dd>A tracked deadline is approaching its target.</dd>
                </div>
                <div>
                  <dt><span className={styles.breachMark} />Breached</dt>
                  <dd>A tracked deadline has passed its due time.</dd>
                </div>
                <div>
                  <dt><span className={styles.externalMark} />External delays</dt>
                  <dd>Tracked separately. These do not trigger escalation against your team.</dd>
                </div>
              </dl>
              <Link className={styles.projectLink} href="/projects">
                View projects <IconArrowUpRight size={16} />
              </Link>
            </aside>
          </div>
        </>
      )}

      <ProcessTaskQueueSection
        canManage={canManageTaskQueue}
        data={taskQueue}
        error={taskQueueError}
        filters={queueFilters}
        preview={previewSearch}
      />

      <section className="card" aria-labelledby="approval-route-preview">
        <div className="card-header">
          <div>
            <h2 id="approval-route-preview" className="card-title">
              Approval route preview
            </h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Read-only diagnostics for the configured purchase-order rules.
              Enter the amount in integer PHP centavos.
            </p>
          </div>
          {previewData ? (
            <span className="badge">{previewData.status}</span>
          ) : null}
        </div>

        <form method="get" aria-describedby="approval-route-preview-help">
          <input
            type="hidden"
            name="objectType"
            value={PURCHASE_ORDER_OBJECT_TYPE}
          />
          {queueFilters.status ? (
            <input type="hidden" name="status" value={queueFilters.status} />
          ) : null}
          {queueFilters.responsibleBu ? (
            <input
              type="hidden"
              name="responsibleBu"
              value={queueFilters.responsibleBu}
            />
          ) : null}
          {queueFilters.page ? (
            <input type="hidden" name="page" value={queueFilters.page} />
          ) : null}
          {queueFilters.limit ? (
            <input type="hidden" name="limit" value={queueFilters.limit} />
          ) : null}
          <div className="form-row-2col">
            <div>
              <label className="form-label" htmlFor="approval-route-amount">
                Purchase-order amount (centavos)
              </label>
              <input
                id="approval-route-amount"
                className="form-input"
                name="amountCentavos"
                type="text"
                inputMode="numeric"
                pattern="^(0|[1-9][0-9]*)$"
                maxLength={18}
                required
                defaultValue={requestedAmount ?? ''}
                aria-describedby="approval-route-preview-help"
              />
              <p id="approval-route-preview-help" className="form-help">
                Use a non-negative integer; no peso or decimal conversion is
                performed in this diagnostic.
              </p>
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="button-primary">
                Preview route
              </button>
            </div>
          </div>
        </form>

        {previewResult === null ? (
          <div className="card-empty" style={{ marginTop: 16 }}>
            Enter an amount to inspect the configured route. No approval route
            has been requested yet.
          </div>
        ) : !previewData ? (
          <div className="card-empty" role="alert" style={{ marginTop: 16 }}>
            <strong>
              {previewResult.status === 400
                ? 'Approval route preview request is invalid.'
                : 'Approval route preview is unavailable.'}
            </strong>{' '}
            {previewResult.error ?? 'No verified preview was returned.'} No
            synthetic route is shown.
          </div>
        ) : (
          <div style={{ marginTop: 16 }} aria-live="polite">
            <div
              className="card"
              style={{ background: 'var(--color-neutral-50)' }}
            >
              <p style={{ margin: 0 }}>
                <strong>Status:</strong> {previewData.status}
              </p>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {PREVIEW_STATUS_COPY[previewData.status]}
              </p>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content 1fr',
                  gap: '6px 16px',
                  margin: '16px 0 0',
                  fontSize: '0.8rem',
                }}
              >
                <dt className="muted">Object type</dt>
                <dd style={{ margin: 0 }}>{previewData.objectType}</dd>
                <dt className="muted">Amount</dt>
                <dd style={{ margin: 0 }}>
                  {centavos(previewData.amountCentavos)} centavos
                </dd>
                <dt className="muted">Mode</dt>
                <dd style={{ margin: 0 }}>
                  {previewData.mode} (preview only)
                </dd>
                <dt className="muted">Authority</dt>
                <dd style={{ margin: 0 }}>
                  {previewData.authority} (configured rules only)
                </dd>
              </dl>
            </div>

            {previewData.steps.length === 0 ? (
              <div className="card-empty" style={{ marginTop: 16 }}>
                No configured approval steps are available for this object
                type and amount.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table className="data-table">
                  <caption className="sr-only">
                    Approval route preview steps and configured matching rules
                  </caption>
                  <thead>
                    <tr>
                      <th>Sequence</th>
                      <th>Status</th>
                      <th>Configured approver rules</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.steps.map((step) => (
                      <tr key={step.sequence}>
                        <th scope="row">{step.sequence}</th>
                        <td>{PREVIEW_STEP_STATUS_COPY[step.status]} ({step.status})</td>
                        <td>
                          {step.rules.length === 0 ? (
                            <span className="muted">No matching rule</span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                              {step.rules.map((rule) => (
                                <li key={rule.id}>
                                  {rule.approverRole} ·{' '}
                                  {centavos(rule.amountBandLow)}–
                                  {rule.amountBandHigh === null
                                    ? '∞'
                                    : centavos(rule.amountBandHigh)}{' '}
                                  centavos
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p
              className="form-warning"
              role="note"
              style={{ marginTop: 16 }}
            >
              This is a preview only. It is not approval policy and does not
              create, approve, or execute a purchase order.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
