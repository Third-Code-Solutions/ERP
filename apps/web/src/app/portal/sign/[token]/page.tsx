import type { Metadata } from 'next'
import { and, eq } from 'drizzle-orm'
import {
  signatureSessions,
  boms,
  contracts,
  variationOrders,
  certificatesOfCompletion,
  projects,
  accounts,
} from '@third-code-erp/database/schema'
import { createSupabaseAdminClient } from '@third-code-erp/auth'
import { hashToken, isExpired, isSigned } from '@/lib/operations/integrations/canvas-sign'
import { CanvasSigningForm } from '@/components/canvas-sign/signing-form'
import { db } from '@third-code-erp/database'

export const metadata: Metadata = {
  title: 'Sign document',
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function CanvasSignPage({ params }: PageProps) {
  const { token } = await params
  void createSupabaseAdminClient // ensure tree-shaking keeps the import

  const tokenHash = hashToken(token)
  const [session] = await db
    .select()
    .from(signatureSessions)
    .where(eq(signatureSessions.token_hash, tokenHash))
    .limit(1)

  if (!session) {
    return <StateCard title="Link not found" body="This signing link is invalid. Please contact the team that sent it." />
  }
  if (isSigned(session)) {
    return <StateCard title="Already signed" body="Thanks — this document was already signed. You can close this window." />
  }
  if (isExpired(session)) {
    return <StateCard title="Link expired" body="This signing link has expired. Please contact the team that sent it." />
  }

  // Load entity summary for display per type.
  const summary = await loadEntitySummary(session.tenant_id, session.entity_type, session.entity_id)

  return (
    <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-gold-500)', margin: 0 }}>
          {prettyEntity(session.entity_type)} signature
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: '4px 0 0', color: 'var(--color-navy-700)' }}>
          {summary.heading}
        </h1>
        <p style={{ color: 'var(--color-neutral-500)', margin: '8px 0 0' }}>{summary.subheading}</p>
      </header>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2 className="card-title">Document summary</h2>
        </div>
        <div style={{ padding: 16 }}>
          {summary.lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < summary.lines.length - 1 ? '1px solid var(--color-border)' : 'none', fontSize: 13 }}>
              <span style={{ color: 'var(--color-neutral-500)' }}>{line.label}</span>
              <span style={{ color: 'var(--color-neutral-900)', fontWeight: 500 }}>{line.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Sign below</h2>
        </div>
        <div style={{ padding: 16 }}>
          <CanvasSigningForm
            token={token}
            defaultSignerName={session.signer_name ?? ''}
            defaultSignerEmail={session.signer_email ?? ''}
          />
        </div>
      </div>
    </div>
  )
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-navy-700)', margin: 0 }}>{title}</h1>
      <p style={{ color: 'var(--color-neutral-500)', marginTop: 12 }}>{body}</p>
    </div>
  )
}

function prettyEntity(t: string) {
  if (t === 'bom') return 'BOM'
  if (t === 'contract') return 'Contract'
  if (t === 'variation_order') return 'Variation order'
  if (t === 'coc') return 'Certificate of completion'
  return t
}

interface SummaryShape {
  heading: string
  subheading: string
  lines: { label: string; value: string }[]
}

async function loadEntitySummary(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<SummaryShape> {
  if (entityType === 'bom') {
    const [row] = await db
      .select({
        version: boms.version,
        label: boms.label,
        tcv_cents: boms.tcv_cents,
        project_name: projects.name,
        account_name: accounts.name,
      })
      .from(boms)
      .leftJoin(projects, eq(projects.id, boms.project_id))
      .leftJoin(accounts, eq(accounts.id, projects.account_id))
      .where(and(eq(boms.id, entityId), eq(boms.tenant_id, tenantId)))
      .limit(1)
    return {
      heading: row?.label ?? 'Bill of Materials',
      subheading: row?.project_name ?? '',
      lines: [
        { label: 'Account', value: row?.account_name ?? '—' },
        { label: 'Version', value: String(row?.version ?? '—') },
        { label: 'Total Contract Value', value: row?.tcv_cents ? `₱${(row.tcv_cents / 100).toLocaleString('en-PH')}` : '—' },
      ],
    }
  }
  if (entityType === 'variation_order') {
    const [row] = await db
      .select({
        vo_number: variationOrders.vo_number,
        description: variationOrders.description,
        cost_impact_cents: variationOrders.cost_impact_cents,
        time_impact_days: variationOrders.time_impact_days,
        project_name: projects.name,
      })
      .from(variationOrders)
      .leftJoin(projects, eq(projects.id, variationOrders.project_id))
      .where(and(eq(variationOrders.id, entityId), eq(variationOrders.tenant_id, tenantId)))
      .limit(1)
    return {
      heading: row?.vo_number ?? 'Variation Order',
      subheading: row?.project_name ?? '',
      lines: [
        { label: 'Description', value: row?.description?.slice(0, 160) ?? '—' },
        { label: 'Cost impact', value: row?.cost_impact_cents != null ? `₱${(row.cost_impact_cents / 100).toLocaleString('en-PH')}` : '—' },
        { label: 'Time impact', value: row?.time_impact_days != null ? `${row.time_impact_days} days` : '—' },
      ],
    }
  }
  if (entityType === 'coc') {
    const [row] = await db
      .select({ project_name: projects.name })
      .from(certificatesOfCompletion)
      .leftJoin(projects, eq(projects.id, certificatesOfCompletion.project_id))
      .where(and(eq(certificatesOfCompletion.id, entityId), eq(certificatesOfCompletion.tenant_id, tenantId)))
      .limit(1)
    return {
      heading: 'Certificate of Completion',
      subheading: row?.project_name ?? '',
      lines: [{ label: 'Project', value: row?.project_name ?? '—' }],
    }
  }
  if (entityType === 'contract') {
    const [row] = await db
      .select({ project_name: projects.name })
      .from(contracts)
      .leftJoin(projects, eq(projects.id, contracts.project_id))
      .where(and(eq(contracts.id, entityId), eq(contracts.tenant_id, tenantId)))
      .limit(1)
    return {
      heading: 'Construction Contract',
      subheading: row?.project_name ?? '',
      lines: [{ label: 'Project', value: row?.project_name ?? '—' }],
    }
  }
  return { heading: 'Document', subheading: '', lines: [] }
}
