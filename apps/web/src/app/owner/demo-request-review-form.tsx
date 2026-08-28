'use client'

import { useActionState } from 'react'
import type { PlatformDemoRequest } from '@third-code-erp/database'
import {
  formatDemoRequestStatus,
  PLATFORM_DEMO_REQUEST_STATUSES,
} from '@/lib/platform-demo-status'
import { updateDemoRequestStatus } from './actions'
import styles from './owner-console.module.css'

const initialState: {
  message: string
  status: 'error' | 'idle' | 'success'
} = {
  message: '',
  status: 'idle',
}

function formatDate(value: Date | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(value)
}

export function DemoRequestReviewForm({
  request,
}: {
  request: PlatformDemoRequest
}) {
  const [state, formAction, isPending] = useActionState(
    updateDemoRequestStatus,
    initialState
  )

  return (
    <article className={styles.demoRequest}>
      <div className={styles.demoRequestHeader}>
        <div>
          <p className={styles.requestMeta}>{formatDate(request.created_at)}</p>
          <h3>{request.company_name}</h3>
          <p>{request.contact_name} · {request.job_title || 'Role not supplied'}</p>
        </div>
        <span className={styles.statusPill}>{formatDemoRequestStatus(request.status)}</span>
      </div>

      <dl className={styles.requestDetails}>
        <div><dt>Contact</dt><dd><a href={`mailto:${request.work_email}`}>{request.work_email}</a>{request.phone ? ` · ${request.phone}` : ''}</dd></div>
        <div><dt>Organization</dt><dd>{request.organization_type.replaceAll('-', ' ')}{request.company_size ? ` · ${request.company_size} people` : ''}</dd></div>
        <div><dt>Preferred time</dt><dd>{request.preferred_demo_window || 'Not supplied'}</dd></div>
        <div className={styles.requestUseCase}><dt>What they need</dt><dd>{request.use_case}</dd></div>
      </dl>

      <form action={formAction} className={styles.reviewForm}>
        <input name="requestId" type="hidden" value={request.id} />
        <label>
          Review status
          <select defaultValue={request.status} name="status">
            {PLATFORM_DEMO_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>{formatDemoRequestStatus(status)}</option>
            ))}
          </select>
        </label>
        <label>
          Review notes
          <textarea defaultValue={request.review_notes ?? ''} name="reviewNotes" rows={3} />
        </label>
        <div className={styles.formActionRow}>
          <button className={styles.secondaryButton} disabled={isPending} type="submit">
            {isPending ? 'Saving…' : 'Save review'}
          </button>
          {state.status !== 'idle' ? (
            <p className={state.status === 'success' ? styles.success : styles.error} role={state.status === 'error' ? 'alert' : 'status'}>
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </article>
  )
}
