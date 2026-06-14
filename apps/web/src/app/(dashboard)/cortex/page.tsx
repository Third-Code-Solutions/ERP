import type { Metadata } from 'next'
import { getUserProfile } from '@buildops/auth'
import { getCortexGraphStats } from '@buildops/database'
import { AccountNotProvisioned } from '@/components/auth/account-not-provisioned'
import { CortexGraphView } from '@/components/cortex/cortex-graph-view'
import { CortexAgent } from '@/components/cortex/cortex-agent'

export const metadata: Metadata = { title: 'Cortex — AI Brain' }

export default async function CortexPage() {
  const profile = await getUserProfile()
  if (!profile) return <AccountNotProvisioned />

  const stats = await getCortexGraphStats(profile.tenantId)

  const kpis = [
    { label: 'Records', value: stats.nodes },
    { label: 'Connections', value: stats.edges },
    { label: 'Record types', value: stats.byType.length },
    { label: 'Provenance events', value: stats.provenance },
  ]

  return (
    <div className="cortex-page">
      <header className="cortex-page__head">
        <div>
          <h1 className="cortex-page__title">
            Cortex <span className="cortex-page__badge">AI Brain</span>
          </h1>
          <p className="cortex-page__sub">
            Every record in your company — projects, pipeline, BOMs, POs, invoices, people —
            linked into one permissioned, source-cited knowledge graph.
          </p>
        </div>
      </header>

      <div className="cortex-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cortex-kpi">
            <span className="cortex-kpi__value">{k.value.toLocaleString()}</span>
            <span className="cortex-kpi__label">{k.label}</span>
          </div>
        ))}
      </div>

      <div className="cortex-layout">
        <div className="cortex-layout__graph">
          <h2 className="cortex-section-title">Knowledge Graph</h2>
          {stats.nodes === 0 ? (
            <p className="cortex-empty-note">
              The graph is empty for now. As records are created they mirror in automatically.
            </p>
          ) : (
            <CortexGraphView />
          )}
        </div>
        <div className="cortex-layout__agent">
          <CortexAgent />
        </div>
      </div>
    </div>
  )
}
