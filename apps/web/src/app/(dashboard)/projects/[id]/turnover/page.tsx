import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  documents,
  projects,
  turnoverPackages,
  certificatesOfCompletion,
} from '@buildops/database/schema'
import {
  attachTurnoverDocument,
  markTurnoverCompiled,
  type TurnoverSlot,
} from './actions'

export const metadata: Metadata = { title: 'Turnover Package' }

const SLOTS: { key: TurnoverSlot; label: string; helper: string }[] = [
  {
    key: 'as_built',
    label: 'As-built drawings',
    helper: 'Final DXF/PDF set reflecting installed conditions.',
  },
  {
    key: 'om_manual',
    label: 'O&M manuals',
    helper: 'Operations & maintenance documentation for installed equipment.',
  },
  {
    key: 'warranty_cert',
    label: 'Warranty certificates',
    helper: 'Manufacturer + contractor warranty paperwork.',
  },
  {
    key: 'keys_log',
    label: 'Keys log',
    helper: 'Signed key handover log with quantities and key IDs.',
  },
]

const SLOT_COLUMN: Record<TurnoverSlot, keyof typeof turnoverPackages.$inferSelect> = {
  as_built: 'as_built_document_id',
  om_manual: 'om_manual_document_id',
  warranty_cert: 'warranty_cert_document_id',
  keys_log: 'keys_log_document_id',
}

export default async function TurnoverPage({
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

  const [pkg] = await db
    .select()
    .from(turnoverPackages)
    .where(
      and(
        eq(turnoverPackages.project_id, id),
        eq(turnoverPackages.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  const [coc] = await db
    .select({ id: certificatesOfCompletion.id, status: certificatesOfCompletion.status })
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.project_id, id),
        eq(certificatesOfCompletion.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  // Last 50 project docs to choose from per slot.
  const projectDocs = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      document_type: documents.document_type,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(and(eq(documents.tenant_id, profile.tenantId), eq(documents.project_id, id)))
    .orderBy(desc(documents.created_at))
    .limit(50)

  const docById = new Map(projectDocs.map((d) => [d.id, d]))

  const slotsFilled = SLOTS.filter((s) =>
    pkg ? !!(pkg as Record<string, unknown>)[SLOT_COLUMN[s.key]] : false
  ).length
  const allAttached = slotsFilled === SLOTS.length
  const isCompiled = !!pkg?.compiled_at

  const baseHref = `/projects/${id}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/projects"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link
          href={baseHref}
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Turnover</span>
      </div>

      <div className="page-header">
        <p className="page-eyebrow">Post-Construction</p>
        <h1 className="page-title">Turnover package</h1>
        <p className="page-subtitle">
          Attach the four turnover artifacts. Once all are in place, compile the package and proceed to the Certificate of Completion.
        </p>
      </div>

      {/* Progress strip */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: 8,
              background: 'var(--color-neutral-100)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(slotsFilled / SLOTS.length) * 100}%`,
                height: '100%',
                background: isCompiled ? 'var(--color-success, #15803d)' : 'var(--color-navy-700)',
                transition: 'width 200ms',
              }}
            />
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-neutral-500)',
              marginTop: 6,
            }}
          >
            {slotsFilled} / {SLOTS.length} attached{' '}
            {isCompiled
              ? `· Compiled ${new Date(pkg!.compiled_at!).toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
          </div>
        </div>
        {!isCompiled ? (
          <form
            action={async () => {
              'use server'
              await markTurnoverCompiled(id)
            }}
          >
            <button
              type="submit"
              disabled={!allAttached}
              title={!allAttached ? 'Attach all four documents first' : undefined}
              style={{
                background: allAttached ? 'var(--color-navy-700)' : 'var(--color-neutral-200)',
                color: allAttached ? 'white' : 'var(--color-neutral-500)',
                border: 'none',
                borderRadius: 6,
                padding: '9px 16px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: allAttached ? 'pointer' : 'not-allowed',
              }}
            >
              Mark as compiled
            </button>
          </form>
        ) : (
          <Link
            href={`${baseHref}/coc`}
            style={{
              background: 'var(--color-navy-700)',
              color: 'white',
              padding: '9px 16px',
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {coc ? 'View COC →' : 'Draft COC →'}
          </Link>
        )}
      </div>

      {/* Slot checklist */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {SLOTS.map((slot, idx) => {
          const attachedDocId = pkg
            ? ((pkg as Record<string, unknown>)[SLOT_COLUMN[slot.key]] as string | null)
            : null
          const attachedDoc = attachedDocId ? docById.get(attachedDocId) : null
          return (
            <div
              key={slot.key}
              style={{
                padding: '16px 18px',
                borderBottom:
                  idx < SLOTS.length - 1 ? '1px solid var(--color-border)' : 'none',
                display: 'grid',
                gridTemplateColumns: '24px 1fr auto',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: attachedDoc
                    ? 'var(--color-success, #15803d)'
                    : 'var(--color-neutral-100)',
                  color: attachedDoc ? 'white' : 'var(--color-neutral-400)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {attachedDoc ? '✓' : idx + 1}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: 'var(--color-neutral-900)',
                  }}
                >
                  {slot.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', marginTop: 2 }}>
                  {slot.helper}
                </div>
                {attachedDoc ? (
                  <Link
                    href={`${baseHref}/documents`}
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--color-navy-700)',
                      textDecoration: 'none',
                      marginTop: 6,
                      display: 'inline-block',
                    }}
                  >
                    {attachedDoc.file_name}
                  </Link>
                ) : (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-danger, #dc2626)',
                      marginTop: 6,
                    }}
                  >
                    Missing — upload required
                  </div>
                )}
              </div>
              {!isCompiled ? (
                <SlotPicker
                  projectId={id}
                  slot={slot.key}
                  currentDocId={attachedDocId}
                  options={projectDocs.map((d) => ({ id: d.id, file_name: d.file_name }))}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      {projectDocs.length === 0 ? (
        <p
          style={{
            marginTop: 16,
            fontSize: '0.8125rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          No documents uploaded yet. Use the{' '}
          <Link href={`${baseHref}/documents`} style={{ color: 'var(--color-navy-700)' }}>
            Documents tab
          </Link>{' '}
          to upload the turnover artifacts, then attach them here.
        </p>
      ) : null}
    </div>
  )
}

// Inline server-action form per slot. Submits the chosen document id back
// to attachTurnoverDocument.
function SlotPicker({
  projectId,
  slot,
  currentDocId,
  options,
}: {
  projectId: string
  slot: TurnoverSlot
  currentDocId: string | null
  options: { id: string; file_name: string }[]
}) {
  async function action(formData: FormData) {
    'use server'
    const docId = formData.get('document_id') as string
    if (!docId) return
    await attachTurnoverDocument(projectId, slot, docId)
  }

  if (options.length === 0) {
    return (
      <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>
        No docs yet
      </span>
    )
  }

  return (
    <form action={action} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        name="document_id"
        defaultValue={currentDocId ?? ''}
        style={{
          padding: '6px 8px',
          fontSize: '0.75rem',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          background: 'white',
          minWidth: 180,
        }}
      >
        <option value="">— Choose document —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.file_name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          padding: '6px 10px',
          fontSize: '0.75rem',
          background: 'var(--color-neutral-100)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {currentDocId ? 'Replace' : 'Attach'}
      </button>
    </form>
  )
}
