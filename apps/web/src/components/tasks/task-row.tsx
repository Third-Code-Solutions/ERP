import React from 'react'
import Link from 'next/link'
import { completeTask } from '@/app/(dashboard)/tasks/actions'
import styles from '@/app/(dashboard)/tasks/tasks.module.css'
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
  assignee_id: string | null
  assignee_name?: string | null
  completion_notes?: string | null
  completed_at?: Date | string | null
}

interface TaskRowProps {
  task: TaskRowData
  /** Current instant (ms) used to classify overdue tasks. */
  now: number
  /** End of today in Manila (ms); pending tasks due before it are "Due today". */
  todayEnd: number
  /** Render the assignee column (team view). */
  showAssignee?: boolean
  /** When true, do not render the completion control. */
  readOnly?: boolean
}

export const ROLE_LABELS: Record<string, string> = {
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

const DAY_MS = 86_400_000
const MANILA_OFFSET_MS = 8 * 3_600_000

/** Whole Manila calendar days since the epoch, for "N days late". */
function manilaDayIndex(ms: number): number {
  return Math.floor((ms + MANILA_OFFSET_MS) / DAY_MS)
}

type DisplayStatus = 'overdue' | 'today' | 'open' | 'done' | 'skipped'

const STATUS_BADGE: Record<DisplayStatus, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'stage-badge stage-closed_lost' },
  today: { label: 'Due today', className: 'stage-badge stage-negotiation' },
  open: { label: 'Open', className: 'stage-badge stage-scoping' },
  done: { label: 'Done', className: 'stage-badge stage-closed_won' },
  skipped: { label: 'Skipped', className: 'stage-badge stage-opportunity_creation' },
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value
}

function formatDue(value: Date): string {
  return value.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDay(value: Date): string {
  return value.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })
}

export function displayStatus(task: Pick<TaskRowData, 'status' | 'due_date'>, now: number, todayEnd: number): DisplayStatus {
  if (task.status === 'done') return 'done'
  if (task.status === 'skipped') return 'skipped'
  const due = toDate(task.due_date).getTime()
  if (due < now) return 'overdue'
  if (due <= todayEnd) return 'today'
  return 'open'
}

export function TaskRow({ task, now, todayEnd, showAssignee = false, readOnly = false }: TaskRowProps) {
  const due = toDate(task.due_date)
  const status = displayStatus(task, now, todayEnd)
  const badge = STATUS_BADGE[status]
  const source = task.role ? `Daily cadence · ${ROLE_LABELS[task.role] ?? task.role}` : 'Manual task'
  const requiresToolboxLog = task.title.trim().toLowerCase() === 'toolbox meeting log'
  const daysLate = manilaDayIndex(now) - manilaDayIndex(due.getTime())

  let action: React.ReactNode = <span className="muted">—</span>
  if (task.status === 'pending' && readOnly) {
    action = (
      <span className="muted" title="Your role can view this task but not complete it.">
        View only
      </span>
    )
  } else if (task.status === 'pending') {
    const completeMountedTask = completeTask.bind(null, {
      taskId: task.id,
      projectId: task.project_id,
      assigneeId: task.assignee_id,
      requiresNotes: requiresToolboxLog,
    })
    action = (
      <CompleteTaskButton
        action={completeMountedTask}
        taskId={task.id}
        requiresNotes={requiresToolboxLog}
        notePlaceholder={requiresToolboxLog ? 'Attendees, safety topic, hazards, and action items' : 'Optional completion notes'}
      />
    )
  }

  return (
    <tr>
      <td>
        <div className={styles.taskCell}>
          <span className={styles.taskTitle}>{task.title}</span>
          <span className={styles.taskMeta}>{source}</span>
          {task.description && <span className={styles.taskDescription}>{task.description}</span>}
          {task.completion_notes && <span className={styles.taskNote}>“{task.completion_notes}”</span>}
        </div>
      </td>
      <td>
        <Link href={`/projects/${task.project_id}`} style={{ color: 'inherit' }}>
          {task.project_name}
        </Link>
      </td>
      {showAssignee && <td className="muted">{task.assignee_name ?? 'Unassigned'}</td>}
      <td className={styles.due}>
        {formatDue(due)}
        {status === 'overdue' && (
          <span className={styles.dueLate}>
            {daysLate >= 1 ? `${daysLate} day${daysLate === 1 ? '' : 's'} late` : 'Late today'}
          </span>
        )}
        {status === 'done' && task.completed_at && (
          <span className={styles.dueSub}>Completed {formatDay(toDate(task.completed_at))}</span>
        )}
      </td>
      <td>
        <span className={badge.className}>
          <span className="stage-badge-dot" />
          {badge.label}
        </span>
      </td>
      <td className={styles.actionCell}>{action}</td>
    </tr>
  )
}
