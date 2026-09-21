import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'

export const metadata: Metadata = { title: 'Roadmap operations' }

const workstreams = [
  {
    eyebrow: 'Procurement lifecycle',
    title: 'Requisition → payment',
    description: 'Raise a requisition, route approval, convert a selected quote to a PO, receive partial deliveries, and hand the evidence to payables.',
    links: [{ label: 'Procurement', href: '/procurement' }, { label: 'Payables', href: '/finance/payables' }],
    capability: 'procurement.read' as const,
  },
  {
    eyebrow: 'Inventory control',
    title: 'Reservations & landed cost',
    description: 'Protect available stock for a project and capitalize freight, duty, insurance, handling, or other receipt-level costs without rewriting the ledger.',
    links: [{ label: 'Inventory', href: '/inventory' }, { label: 'Receipts', href: '/inventory/receipts' }],
    capability: 'inventory.read' as const,
  },
  {
    eyebrow: 'Commercial controls',
    title: 'Price lists & currencies',
    description: 'Resolve quantity-tiered prices against an effective date and convert exact minor units through approved tenant exchange rates.',
    links: [{ label: 'Purchase orders', href: '/purchase-orders' }, { label: 'Finance', href: '/finance' }],
    capability: 'procurement.read' as const,
  },
  {
    eyebrow: 'Statutory finance',
    title: 'Tax profiles & period close',
    description: 'Keep Philippine VAT, withholding, retention, statutory payloads, and fiscal-period checks configurable and auditable.',
    links: [{ label: 'Finance center', href: '/finance' }, { label: 'Reports', href: '/reports' }],
    capability: 'finance.read' as const,
  },
  {
    eyebrow: 'Integrations',
    title: 'SAP & real delivery',
    description: 'Queue idempotent SAP postings and provider-neutral email/SMS deliveries with retry, response evidence, and dead-letter visibility.',
    links: [{ label: 'Notifications', href: '/settings' }, { label: 'Audit', href: '/audit' }],
    capability: 'notification.read' as const,
  },
]

export default async function RoadmapPage() {
  const profile = await requireUserProfile()
  const visible = workstreams.filter((workstream) => can(profile.role, workstream.capability))

  return (
    <div className="roadmap-hub">
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Roadmap operations · guarded release</p>
          <h1 className="page-title">Connected controls, one work queue</h1>
          <p className="page-subtitle">
            The next operating slices are implemented behind tenant feature flags. Existing ERP surfaces remain the source of truth while each slice earns its canary.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/dashboard" className="finance-secondary-link">Dashboard</Link>
          <Link href="/audit" className="finance-primary-link">Review audit trail</Link>
        </div>
      </div>

      <section className="roadmap-hub__notice" aria-label="Feature flag notice">
        <div>
          <p className="finance-eyebrow">Safe by default</p>
          <h2>Roadmap commands are dark until a tenant canary is approved.</h2>
          <p>Read-only links below continue to open the current ERP registers. No card on this page silently creates or posts data.</p>
        </div>
        <span className="finance-status finance-status-maintenance">Canary required</span>
      </section>

      <section className="roadmap-hub__grid" aria-label="Roadmap workstreams">
        {visible.map((workstream) => (
          <article key={workstream.title} className="roadmap-hub__card">
            <div className="roadmap-hub__card-topline">
              <p className="finance-eyebrow">{workstream.eyebrow}</p>
              <span className="finance-status finance-status-open">Read path</span>
            </div>
            <h2>{workstream.title}</h2>
            <p>{workstream.description}</p>
            <div className="roadmap-hub__links">
              {workstream.links.map((link) => <Link key={link.href} href={link.href} className="finance-secondary-link">{link.label} →</Link>)}
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
