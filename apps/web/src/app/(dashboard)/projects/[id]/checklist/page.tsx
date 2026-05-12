import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, asc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  preConChecklists,
  preConChecklistItems,
  projects,
} from '@buildops/database/schema'
import { ChecklistItemRow } from '@/components/checklist/checklist-item-row'

export const metadata: Metadata = { title: 'Pre-Con Checklist' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Checklist', href: '/checklist' },
  { label: 'Permits', href: '/permits' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

type ChecklistItemStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'

const STATUS_GROUPS: Array<{ key: ChecklistItemStatus; label: string }> = [
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'not_started', label: 'Not started' },
  { key: 'done', label: 'Done' },
]

export default async function ProjectChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return notFound()

  const [checklist] = await db
    .select({ id: preConChecklists.id, created_at: preConChecklists.created_at })
    .from(preConChecklists)
    .where(
      and(
        eq(preConChecklists.project_id, id),
        eq(preConChecklists.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  const items = checklist
    ? await db
        .select({
          id: preConChecklistItems.id,
          title: preConChecklistItems.title,
          owner_role: preConChecklistItems.owner_role,
          sla_days: preConChecklistItems.sla_days,
          status: preConChecklistItems.status,
          blocker_reason: preConChecklistItems.blocker_reason,
          sla_clock_started_at: preConChecklistItems.sla_clock_started_at,
          completed_at: preConChecklistItems.completed_at,
          depends_on_item_id: preConChecklistItems.depends_on_item_id,
          sort_order: preConChecklistItems.sort_order,
        })
        .from(preConChecklistItems)
        .where(
          and(
            eq(preConChecklistItems.checklist_id, checklist.id),
            eq(preConChecklistItems.tenant_id, profile.tenantId)
          )
        )
        .orderBy(asc(preConChecklistItems.sort_order))
    : []

  const titleById = new Map<string, string>()
  for (const it of items) titleById.set(it.id, it.title)

  const grouped: Record<ChecklistItemStatus, typeof items> = {
    not_started: [],
    in_progress: [],
    blocked: [],
    done: [],
  }
  for (const it of items) grouped[it.status as ChecklistItemStatus].push(it)

  const baseHref = `/projects/${id}`
  const totalDone = grouped.done.length
  const total = items.length
  const progressPct = total > 0 ? Math.round((totalDone / total) * 100) : 0

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link href={baseHref} style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Pre-Con Checklist</span>
      </div>

      {/* Tab nav */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--color-border)',
          marginTop: '16px',
          overflowX: 'auto',
        }}
      >
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/checklist'
          return (
            <Link
              key={label}
              href={fullHref}
              style={{
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-navy-700)' : 'var(--color-neutral-500)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--color-navy-700)' : '2px solid transparent',
                marginBottom: '-1px',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            Pre-Construction Checklist
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
            12-item handoff from Won to break-ground. Each item has an SLA clock and an owner role.
          </p>
        </div>
        {checklist && (
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--color-neutral-900)',
              }}
            >
              {progressPct}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
              {totalDone} of {total} complete
            </div>
          </div>
        )}
      </div>

      {!checklist ? (
        <div
          style={{
            background: 'white',
            border: '1px dashed var(--color-border)',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            color: 'var(--color-neutral-500)',
          }}
        >
          No Pre-Construction checklist for this project yet. It is generated automatically
          when a won opportunity is converted into a project.
        </div>
      ) : (
        STATUS_GROUPS.map(({ key, label }) => {
          const group = grouped[key]
          if (group.length === 0) return null
          return (
            <section key={key} style={{ marginBottom: '24px' }}>
              <h3
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-neutral-500)',
                  margin: '0 0 10px',
                }}
              >
                {label} ({group.length})
              </h3>
              {group.map((it) => (
                <ChecklistItemRow
                  key={it.id}
                  projectId={id}
                  item={it}
                  dependencyTitle={it.depends_on_item_id ? titleById.get(it.depends_on_item_id) ?? null : null}
                />
              ))}
            </section>
          )
        })
      )}
    </div>
  )
}
