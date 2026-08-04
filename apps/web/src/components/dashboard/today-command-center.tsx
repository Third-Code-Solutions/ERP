import React from 'react'
import Link from 'next/link'
import type { AppRole } from '@third-code-erp/auth'

import type { TodayCommandCenterData, TodayTask } from '@/lib/dashboard-queries'
import { roleLabel } from '@/lib/operations/nav-config'

import styles from './today-command-center.module.css'

interface TodayCommandCenterProps {
  role: AppRole
  data: TodayCommandCenterData
}

const DUE_LABELS: Record<TodayTask['dueState'], string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Next',
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  active: 'Active',
  on_hold: 'On hold',
}

function taskHref(dueState: TodayTask['dueState']): string {
  if (dueState === 'overdue') return '/tasks?tab=overdue'
  if (dueState === 'upcoming') return '/tasks?tab=week'
  return '/tasks'
}

function formatDueDate(value: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

function formatUpdatedAt(value: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

export function TodayCommandCenter({ role, data }: TodayCommandCenterProps) {
  const { summary, tasks, projects } = data
  const cards = [
    {
      label: 'Due today',
      count: summary.dueToday,
      detail: 'Assigned work in your Manila-time queue.',
      tone: 'normal',
      href: '/tasks',
    },
    {
      label: 'Needs attention',
      count: summary.overdue,
      detail: 'Pending work past its due time.',
      tone: summary.overdue > 0 ? 'danger' : 'normal',
      href: '/tasks?tab=overdue',
    },
    {
      label: 'Coming next',
      count: summary.upcoming,
      detail: 'Assigned work through the next seven days.',
      tone: 'normal',
      href: '/tasks?tab=week',
    },
  ] as const

  return (
    <section className={styles.shell} aria-labelledby="today-command-center-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your operating view</p>
          <h2 id="today-command-center-heading" className={styles.title}>
            Today, {roleLabel(role)}
          </h2>
          <p className={styles.subtitle}>
            One calm queue for work that needs a decision, a handoff, or a next step.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/tasks">
            Open my tasks
          </Link>
          <Link className={styles.secondaryAction} href="/cortex">
            Ask Cortex
          </Link>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        {cards.map((card) => (
          <Link className={styles.summaryCard} href={card.href} key={card.label}>
            <span className={styles.cardLabel}>{card.label}</span>
            <strong
              className={`${styles.cardCount} ${card.tone === 'danger' ? styles.cardCountDanger : ''}`}
            >
              {card.count.toLocaleString()}
            </strong>
            <span className={styles.cardDetail}>{card.detail}</span>
          </Link>
        ))}
      </div>

      <div className={styles.bodyGrid}>
        <section className={styles.panel} aria-labelledby="today-queue-heading">
          <div className={styles.panelHeader}>
            <div>
              <h3 id="today-queue-heading" className={styles.panelTitle}>
                Work queue
              </h3>
              <p className={styles.panelHint}>Next assigned actions, ordered by due time.</p>
            </div>
            <Link className={styles.panelLink} href="/tasks">
              View all
            </Link>
          </div>

          {tasks.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Queue clear.</strong>
              <span>No pending tasks through the next seven days.</span>
            </div>
          ) : (
            <div className={styles.taskList}>
              {tasks.map((task) => (
                <Link className={styles.taskRow} href={taskHref(task.dueState)} key={task.id}>
                  <span className={styles.taskCopy}>
                    <strong>{task.title}</strong>
                    <span>{task.projectName}</span>
                  </span>
                  <span className={`${styles.due} ${task.dueState === 'overdue' ? styles.dueDanger : ''}`}>
                    <span>{DUE_LABELS[task.dueState]}</span>
                    <time dateTime={new Date(task.dueDate).toISOString()}>{formatDueDate(task.dueDate)}</time>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="project-command-center-heading">
          <div className={styles.panelHeader}>
            <div>
              <h3 id="project-command-center-heading" className={styles.panelTitle}>
                Project command center
              </h3>
              <p className={styles.panelHint}>Recent active workspaces with source context.</p>
            </div>
            {projects.length > 0 && (
              <Link className={styles.panelLink} href="/projects">
                All projects
              </Link>
            )}
          </div>

          {projects.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Project context stays private.</strong>
              <span>Open an authorized project workspace to see its linked records.</span>
            </div>
          ) : (
            <div className={styles.projectList}>
              {projects.map((project) => (
                <div className={styles.projectRow} key={project.id} style={{ minWidth: 0 }}>
                  <Link
                    className={styles.projectMain}
                    href={`/projects/${project.id}`}
                    style={{ flex: '1 1 auto', minWidth: 0, maxWidth: '100%', width: '100%' }}
                  >
                    <strong>{project.name}</strong>
                    <span>{project.client}</span>
                  </Link>
                  <div className={styles.projectMeta}>
                    <span className={styles.status}>{STATUS_LABELS[project.status] ?? project.status}</span>
                    <time dateTime={new Date(project.updatedAt).toISOString()}>
                      {formatUpdatedAt(project.updatedAt)}
                    </time>
                    <Link
                      className={styles.cortexLink}
                      href={`/cortex?refTable=projects&refId=${encodeURIComponent(project.id)}`}
                    >
                      Cortex context
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
