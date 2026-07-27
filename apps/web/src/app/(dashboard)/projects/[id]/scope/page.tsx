import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { documents, projects, scopeItems, users } from '@third-code-erp/database/schema'
import { and, asc, eq } from 'drizzle-orm'
import { AddScopeItemForm, DeleteScopeItemButton, EditableUnitCost } from '@/components/scope/scope-item-controls'
import { CadDropZone } from '@/components/cad/cad-dropzone'

export const metadata: Metadata = { title: 'Scope' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

const UNIT_LABELS: Record<string, string> = {
  unit: 'unit',
  sqm: 'm²',
  lm: 'lm',
  set: 'set',
  lot: 'lot',
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function ProjectScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return notFound()

  const items = await db
    .select()
    .from(scopeItems)
    .where(and(eq(scopeItems.project_id, id), eq(scopeItems.tenant_id, userRow.tenant_id)))
    .orderBy(asc(scopeItems.sort_order), asc(scopeItems.description))

  // Map documents → file names so each item can be attributed to its source upload
  const projectDocuments = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(and(eq(documents.project_id, id), eq(documents.tenant_id, userRow.tenant_id)))

  const docNameById = new Map(projectDocuments.map((d) => [d.id, d.file_name]))
  const docCreatedById = new Map(projectDocuments.map((d) => [d.id, d.created_at]))

  // Parse `document:<uuid>` from the notes field; items without it are manual
  const DOC_NOTE_RE = /document:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  function sourceDocId(notes: string | null): string | null {
    if (!notes) return null
    const m = DOC_NOTE_RE.exec(notes)
    return m?.[1] ?? null
  }

  // Bucket scope items by source document so multiple drawings in the same
  // project render as their own visible sections.
  type Bucket = {
    docId: string | null
    docName: string
    docCreatedAt: Date | null
    rows: typeof items
  }
  const buckets = new Map<string, Bucket>()
  for (const item of items) {
    const docId = sourceDocId(item.notes)
    const key = docId ?? '__manual__'
    if (!buckets.has(key)) {
      buckets.set(key, {
        docId,
        docName: docId ? docNameById.get(docId) ?? `Document ${docId.slice(0, 8)}` : 'Manual entries',
        docCreatedAt: docId ? docCreatedById.get(docId) ?? null : null,
        rows: [],
      })
    }
    buckets.get(key)!.rows.push(item)
  }
  const orderedBuckets = Array.from(buckets.values()).sort((a, b) => {
    if (a.docId === null) return 1
    if (b.docId === null) return -1
    const ta = a.docCreatedAt ? new Date(a.docCreatedAt).getTime() : 0
    const tb = b.docCreatedAt ? new Date(b.docCreatedAt).getTime() : 0
    return tb - ta
  })

  const baseHref = `/projects/${id}`

  // Whole-project rollup for the KPI bar
  const equipment = items.filter((i) => i.unit === 'unit' || i.unit === 'set')
  const areas = items.filter((i) => i.unit === 'sqm' || i.unit === 'lm')

  const totalLineCents = items.reduce((sum, i) => sum + i.line_total_cents, 0)

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
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Scope</span>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/scope'
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
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Summary bar */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Scope Items
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {items.length}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Equipment
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {equipment.length}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Areas
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {areas.length}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Est. Cost
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {totalLineCents > 0 ? formatPHP(totalLineCents) : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AddScopeItemForm projectId={id} />
          <Link
            href={`/projects/${id}/bom`}
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: 'none',
              border: '1px solid var(--color-border)',
              color: 'var(--color-navy-700)',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            View BOM →
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div>
          <CadDropZone projectId={id} />
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-neutral-400)',
              textAlign: 'center',
              margin: '12px 0 0',
            }}
          >
            Or manage all uploads in the{' '}
            <Link href={`/projects/${id}/documents`} style={{ color: 'var(--color-navy-700)' }}>
              Documents tab
            </Link>
            .
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <CadDropZone
            projectId={id}
            compact
            title="Drop another CAD drawing"
            subtitle="Each upload becomes its own section below — existing files stay untouched."
          />
          {orderedBuckets.map((bucket) => {
            const rows = bucket.rows
            const dateStr = bucket.docCreatedAt
              ? new Date(bucket.docCreatedAt).toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : null
            return (
              <div key={bucket.docId ?? '__manual__'}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    margin: '0 0 8px',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--color-neutral-900)',
                      letterSpacing: '-0.005em',
                      margin: 0,
                      display: 'inline-flex',
                      alignItems: 'baseline',
                      gap: 8,
                    }}
                  >
                    {bucket.docId ? (
                      <Link
                        href={`/projects/${id}/documents`}
                        style={{
                          color: 'var(--color-navy-700)',
                          textDecoration: 'none',
                        }}
                      >
                        {bucket.docName}
                      </Link>
                    ) : (
                      <span>{bucket.docName}</span>
                    )}
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--color-neutral-500)',
                        background: 'var(--color-neutral-100)',
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      {rows.length} item{rows.length === 1 ? '' : 's'}
                    </span>
                  </h3>
                  {dateStr ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>
                      Uploaded {dateStr}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    background: 'white',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Code
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Description
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Qty
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Unit
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Unit Cost
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Line Total
                        </th>
                        <th style={{ padding: '10px 8px', width: '36px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item, idx) => (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: idx < rows.length - 1 ? '1px solid var(--color-border)' : 'none',
                          }}
                        >
                          <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                            {item.code ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--color-neutral-800)', fontWeight: 500 }}>
                            {item.description}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-900)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {item.quantity.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)' }}>
                            {UNIT_LABELS[item.unit] ?? item.unit}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <EditableUnitCost
                              projectId={id}
                              itemId={item.id}
                              unitCostCents={item.unit_cost_cents}
                            />
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-900)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                            {item.line_total_cents > 0 ? formatPHP(item.line_total_cents) : '—'}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <DeleteScopeItemButton projectId={id} itemId={item.id} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
