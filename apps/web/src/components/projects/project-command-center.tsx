import React from 'react'
import Link from 'next/link'

import type { ProjectCommandCenterData } from '@/lib/project-queries'

import styles from './project-command-center.module.css'

interface ProjectCommandCenterProps {
  projectId: string
  data: ProjectCommandCenterData
}

function formatDate(value: string | null): string {
  if (!value) return 'Not reported yet'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

export function ProjectCommandCenter({ projectId, data }: ProjectCommandCenterProps) {
  const decisionCount = data.pendingDecisions + data.openPunchlist
  const progress = data.progressPercent
  const progressLabel = progress === null ? 'No progress report' : `${progress}% complete`

  const signals = [
    {
      label: 'Work queue',
      value: data.pendingTasks,
      detail: data.overdueTasks > 0 ? `${countLabel(data.overdueTasks, 'overdue task')}` : 'Nothing overdue',
      href: `/projects/${projectId}/checklist`,
      tone: data.overdueTasks > 0 ? 'alert' : 'normal',
    },
    {
      label: 'Evidence',
      value: data.documents,
      detail: countLabel(data.documents, 'project document'),
      href: `/projects/${projectId}/documents`,
      tone: 'normal',
    },
    {
      label: 'Decisions',
      value: decisionCount,
      detail: `${countLabel(data.pendingDecisions, 'variation')} · ${countLabel(data.openPunchlist, 'punchlist item')}`,
      href: `/projects/${projectId}/vos`,
      tone: decisionCount > 0 ? 'alert' : 'normal',
    },
    {
      label: 'Delivery watch',
      value: data.activeDeliveries,
      detail: countLabel(data.activeDeliveries, 'active delivery'),
      href: '/procurement/deliveries',
      tone: 'normal',
    },
  ] as const

  return (
    <section className={styles.shell} aria-labelledby="project-command-center-heading">
      <header className={styles.header}>
        <div className={styles.headingCopy}>
          <p className={styles.eyebrow}>Project command center</p>
          <h2 id="project-command-center-heading" className={styles.title}>
            Work, decisions, evidence.
          </h2>
          <p className={styles.subtitle}>
            One project view for the next move, with every signal linked back to its source record.
          </p>
        </div>
        <div className={styles.actions}>
          <Link
            className={styles.primaryAction}
            href={`/cortex?refTable=projects&refId=${encodeURIComponent(projectId)}`}
          >
            Ask Cortex
          </Link>
          <Link className={styles.secondaryAction} href={`/projects/${projectId}/audit`}>
            View audit
          </Link>
        </div>
      </header>

      <div className={styles.signalGrid}>
        {signals.map((signal) => (
          <Link
            className={`${styles.signalCard} ${signal.tone === 'alert' ? styles.signalCardAlert : ''}`}
            href={signal.href}
            key={signal.label}
          >
            <span className={styles.signalLabel}>{signal.label}</span>
            <strong className={styles.signalValue}>{signal.value.toLocaleString()}</strong>
            <span className={styles.signalDetail}>{signal.detail}</span>
          </Link>
        ))}
      </div>

      <div className={styles.detailGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Delivery pulse</p>
              <h3 className={styles.panelTitle}>{progressLabel}</h3>
            </div>
            <Link className={styles.panelLink} href={`/projects/${projectId}/progress`}>
              Open progress
            </Link>
          </div>
          <div className={styles.progressTrack} aria-label={`Project progress: ${progressLabel}`}>
            <span className={styles.progressFill} style={{ width: `${progress ?? 0}%` }} />
          </div>
          <p className={styles.panelHint}>
            {progress === null
              ? 'Add a weekly progress update to give delivery teams a shared baseline.'
              : `Latest report: ${formatDate(data.progressWeekEnding)}.`}
          </p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Next move</p>
              <h3 className={styles.panelTitle}>
                {data.overdueTasks > 0
                  ? 'Clear overdue work first.'
                  : decisionCount > 0
                    ? 'Resolve open decisions.'
                    : 'Keep project momentum.'}
              </h3>
            </div>
          </div>
          <p className={styles.panelHint}>
            {data.overdueTasks > 0
              ? `${countLabel(data.overdueTasks, 'task')} needs attention before the next handoff.`
              : decisionCount > 0
                ? `${countLabel(decisionCount, 'open item')} has a source record ready for review.`
                : 'No blockers surfaced in the current project read.'}
          </p>
          <div className={styles.panelActions}>
            <Link className={styles.inlineLink} href={`/projects/${projectId}/vos`}>
              Review decisions
            </Link>
            <Link className={styles.inlineLink} href={`/projects/${projectId}/comments`}>
              Open project notes
            </Link>
          </div>
        </article>
      </div>
    </section>
  )
}
