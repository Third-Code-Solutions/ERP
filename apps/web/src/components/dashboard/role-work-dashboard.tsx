import React from 'react'
import Link from 'next/link'
import type { AppRole } from '@third-code-erp/auth'

import type { MyWorkSummary } from '@/lib/dashboard-queries'
import {
  canonicalRole,
  roleLabel,
  visibleNavSections,
} from '@/lib/operations/nav-config'
import type { NavItemDef } from '@/lib/operations/nav-config'

import styles from './role-work-dashboard.module.css'

interface RoleWorkDashboardProps {
  role: AppRole
  summary: MyWorkSummary
}

const QUICK_ACCESS_PRIORITY: Partial<Record<AppRole, readonly string[]>> = {
  safety: ['/tasks', '/permits', '/punchlist', '/projects', '/documents'],
  cx: [
    '/tasks',
    '/punchlist',
    '/warranty',
    '/warranty/cnps',
    '/projects',
    '/documents',
  ],
  viewer: [
    '/projects',
    '/pipeline',
    '/crm/accounts',
    '/documents',
    '/bom',
    '/finance',
    '/reports',
  ],
}

function prioritizeQuickLinks(role: AppRole, items: readonly NavItemDef[]) {
  const priority = QUICK_ACCESS_PRIORITY[canonicalRole(role)] ?? []
  const rank = new Map(priority.map((href, index) => [href, index]))

  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.href) ?? Number.POSITIVE_INFINITY
    const rightRank = rank.get(right.href) ?? Number.POSITIVE_INFINITY
    return leftRank - rightRank
  })
}

export function RoleWorkDashboard({
  role,
  summary,
}: RoleWorkDashboardProps) {
  const cards = [
    {
      label: 'Due today',
      count: summary.dueToday,
      detail: 'Assigned work due today in Manila time.',
      href: '/tasks',
      danger: false,
    },
    {
      label: 'Overdue',
      count: summary.overdue,
      detail: 'Pending work already past its due time.',
      href: '/tasks?tab=overdue',
      danger: summary.overdue > 0,
    },
    {
      label: 'Next seven days',
      count: summary.upcoming,
      detail: 'Assigned work due after today through next week.',
      href: '/tasks?tab=week',
      danger: false,
    },
  ]

  const quickLinks = prioritizeQuickLinks(role, visibleNavSections(role)
    .flatMap((section) => section.items)
    .filter((item) => item.href !== '/dashboard')
  ).slice(0, 7)

  return (
    <>
      <section className={styles.section} aria-labelledby="my-work-heading">
        <div className={styles.sectionHeader}>
          <h2 id="my-work-heading" className={styles.sectionTitle}>
            My work
          </h2>
          <p className={styles.sectionDescription}>
            Assigned actions for your {roleLabel(role)} workspace.
          </p>
        </div>

        <div className={styles.grid}>
          {cards.map((card) => (
            <Link
              className={styles.workCard}
              href={card.href}
              key={card.label}
            >
              <span className={styles.cardLabel}>{card.label}</span>
              <strong
                className={`${styles.cardCount} ${
                  card.danger ? styles.cardCountDanger : ''
                }`}
              >
                {card.count.toLocaleString()}
              </strong>
              <span className={styles.cardDetail}>{card.detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="quick-access-heading">
        <div className={styles.sectionHeader}>
          <h2 id="quick-access-heading" className={styles.sectionTitle}>
            Quick access
          </h2>
          <p className={styles.sectionDescription}>
            Workspaces currently available to your role.
          </p>
        </div>

        <div className={styles.quickLinks}>
          {quickLinks.map((item) => (
            <Link className={styles.quickLink} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
