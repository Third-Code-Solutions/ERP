import Link from 'next/link'
import { CompleteTaskButton } from './complete-task-button'

export interface TaskRowData {
  id: string
  title: string
  description: string | null
  role: string | null
  due_date: Date | string
  status: 'pending' | 'done' | 'skipped'
  project_id: string
  project_name: string
  completion_notes?: string | null
  completed_at?: Date | string | null
}

interface TaskRowProps {
  task: TaskRowData
  /** When true, show a destructive "Overdue" badge. */
  overdue?: boolean
  /** When true, do not render the completion control (e.g. completed view). */
  readOnly?: boolean
}

const ROLE_LABELS: Record<string, string> = {
  sd_pm_pe: 'SD / PM / PE',
  safety: 'Safety',
  commercial: 'Commercial',
  procurement: 'Procurement',
  admin: 'Admin',
  sales: 'Sales',
  design: 'Design',
  finance: 'Finance',
  cx: 'CX',
  pm: 'PM',
  estimator: 'Estimator',
  owner: 'Owner',
  viewer: 'Viewer',
}

function formatDue(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function TaskRow({ task, overdue = false, readOnly = false }: TaskRowProps) {
  const roleLabel = task.role ? (ROLE_LABELS[task.role] ?? task.role) : null

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 500 }}>{task.title}</span>
          {task.description && (
            <span className="muted" style={{ fontSize: '0.75rem' }}>{task.description}</span>
          )}
          {task.completion_notes && (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-neutral-600)',
                fontStyle: 'italic',
              }}
            >
              “{task.completion_notes}”
            </span>
          )}
        </div>
      </td>
      <td>
        <Link href={`/projects/${task.project_id}`} style={{ color: 'inherit' }}>
          {task.project_name}
        </Link>
      </td>
      <td className="muted">{roleLabel ?? '—'}</td>
      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
        {formatDue(task.due_date)}
        {overdue && (
          <span
            style={{
              marginLeft: 8,
              padding: '2px 6px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              borderRadius: 4,
              background: 'color-mix(in oklab, var(--color-danger) 12%, white)',
              color: 'var(--color-danger)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Overdue
          </span>
        )}
      </td>
      <td>
        {readOnly || task.status === 'done' ? (
          <span className="muted" style={{ fontSize: '0.75rem' }}>
            {task.status === 'done' && task.completed_at
              ? `Done ${new Date(task.completed_at).toLocaleDateString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                })}`
              : task.status}
          </span>
        ) : (
          <CompleteTaskButton taskId={task.id} />
        )}
      </td>
    </tr>
  )
}
