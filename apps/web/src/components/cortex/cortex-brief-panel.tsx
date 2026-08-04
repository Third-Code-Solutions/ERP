'use client'

import Link from 'next/link'
import React, { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import type { CortexBriefView } from '@/lib/cortex/brief-presentation'
import styles from './cortex-brief-panel.module.css'

interface Props {
  brief: CortexBriefView
}

const BRIEF_TIME_FORMAT = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila',
})

function formatRecordedAt(iso: string): string {
  return BRIEF_TIME_FORMAT.format(new Date(iso))
}

function freshnessCopy(value: CortexBriefView['items'][number]['freshness']): string {
  return value === 'fresh' ? 'Fresh' : value === 'stale' ? 'Stale' : 'Unknown'
}

export function CortexBriefPanel({ brief }: Props) {
  const scope = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const items = scope.current?.querySelectorAll<HTMLElement>(
        '[data-brief-item]'
      )
      if (!items?.length) return

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(items, { clearProps: 'all' })
        return
      }

      gsap.fromTo(
        items,
        { autoAlpha: 0, y: 12, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.42,
          stagger: 0.045,
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
        }
      )
    },
    { scope }
  )

  const freshness = [
    { key: 'fresh', label: 'Fresh', value: brief.freshness.fresh },
    { key: 'stale', label: 'Stale', value: brief.freshness.stale },
    { key: 'unknown', label: 'Unknown', value: brief.freshness.unknown },
  ] as const

  return (
    <section
      ref={scope}
      className={styles.shell}
      aria-labelledby="cortex-brief-title"
    >
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.eyebrow}>Knowledge pulse</span>
          <h2 id="cortex-brief-title" className={styles.heading}>
            What Cortex knows now
          </h2>
          <p className={styles.supporting}>
            Recent source records, permission-scoped and ready to open.
          </p>
        </div>
        <div className={styles.generated}>
          <span className={styles.generatedLabel}>Snapshot</span>
          <time dateTime={brief.generatedAt}>
            {formatRecordedAt(brief.generatedAt)}
          </time>
        </div>
      </header>

      <div className={styles.grid} data-brief-grid>
        <div className={styles.list} data-brief-list>
          {brief.items.length === 0 ? (
            <p className={styles.empty}>No indexed records in your current scope.</p>
          ) : (
            brief.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={styles.item}
                data-brief-item
                aria-label={`${item.label}: ${item.title}`}
              >
                <span
                  className={styles.statusDot}
                  data-freshness={item.freshness}
                  aria-hidden="true"
                />
                <span className={styles.itemBody}>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.itemStatus}>
                      {freshnessCopy(item.freshness)}
                    </span>
                  </span>
                  <span className={styles.itemTitle}>{item.title}</span>
                  {item.summary && (
                    <span className={styles.itemSummary}>{item.summary}</span>
                  )}
                </span>
                <time className={styles.itemTime} dateTime={item.recordedAt}>
                  {formatRecordedAt(item.recordedAt)}
                </time>
              </Link>
            ))
          )}
        </div>

        <aside className={styles.aside} data-brief-aside>
          <div className={styles.scopeBlock}>
            <span className={styles.asideEyebrow}>Scope</span>
            <strong className={styles.scopeTitle}>Read-only evidence surface</strong>
            <p className={styles.scopeDetail}>
              Every link opens the canonical ERP record allowed for your role.
            </p>
          </div>

          <div className={styles.freshness} aria-label="Cortex freshness summary">
            {freshness.map((entry) => (
              <div className={styles.freshnessCell} key={entry.key}>
                <span className={styles.freshnessLabel}>{entry.label}</span>
                <span className={styles.freshnessValue}>{entry.value}</span>
              </div>
            ))}
          </div>

          <dl className={styles.metrics}>
            <div className={styles.metric}>
              <dt>Visible records</dt>
              <dd>{brief.items.length.toLocaleString()}</dd>
            </div>
            <div className={styles.metric}>
              <dt>Provenance events</dt>
              <dd>{brief.stats.provenance.toLocaleString()}</dd>
            </div>
            <div className={styles.metric}>
              <dt>Connections</dt>
              <dd>{brief.stats.edges.toLocaleString()}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  )
}
