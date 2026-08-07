import type { Metadata } from 'next'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { getCortexOperationalBrief } from '@third-code-erp/database'
import { AccountNotProvisioned } from '@/components/auth/account-not-provisioned'
import { CortexBriefPanel } from '@/components/cortex/cortex-brief-panel'
import { CortexGraphView } from '@/components/cortex/cortex-graph-view'
import { CortexAgent } from '@/components/cortex/cortex-agent'
import { CortexIndexButton } from '@/components/cortex/cortex-index-button'
import { canonicalRole } from '@/lib/operations/nav-config'
import { presentCortexBrief } from '@/lib/cortex/brief-presentation'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'
import { authorizeCortexRecordContext } from '@/lib/cortex/record-context'
import { cortexSemanticIndexJobsUseCoreApi } from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Cortex — AI Brain' }

interface CortexPageProps {
  searchParams: Promise<{
    refTable?: string | string[]
    refId?: string | string[]
    conversationId?: string | string[]
    handoff?: string | string[]
  }>
}

export default async function CortexPage({ searchParams }: CortexPageProps) {
  const profile = await getUserProfile()
  if (!profile) return <AccountNotProvisioned />
  const params = await searchParams
  const focus =
    typeof params.refTable === 'string' && typeof params.refId === 'string'
      ? { refTable: params.refTable, refId: params.refId }
      : null
  const agentContext = focus
    ? await authorizeCortexRecordContext(
        profile.tenantId,
        profile.role,
        focus
      )
    : null
  const parsedConversationId = z
    .string()
    .uuid()
    .safeParse(params.conversationId)
  const initialConversationId = parsedConversationId.success
    ? parsedConversationId.data
    : null
  const parsedHandoffId = z.string().uuid().safeParse(params.handoff)
  const initialDraftId =
    !focus && !initialConversationId && parsedHandoffId.success
      ? parsedHandoffId.data
      : null

  // RBAC: KPIs reflect only what this role may see (admin/owner = everything).
  const brief = await getCortexOperationalBrief(
    profile.tenantId,
    cortexNodeTypeScope(profile.role),
    8
  )
  const stats = brief.stats

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
        {canonicalRole(profile.role) === 'admin' && (
          <CortexIndexButton
            enabled={cortexSemanticIndexJobsUseCoreApi(profile.tenantId)}
          />
        )}
      </header>

      <div className="cortex-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cortex-kpi">
            <span className="cortex-kpi__value">{k.value.toLocaleString()}</span>
            <span className="cortex-kpi__label">{k.label}</span>
          </div>
        ))}
      </div>

      <CortexBriefPanel brief={presentCortexBrief(brief)} />

      <div className="cortex-layout">
        <div className="cortex-layout__graph">
          <h2 className="cortex-section-title">Knowledge Graph</h2>
          {stats.nodes === 0 ? (
            <p className="cortex-empty-note">
              The graph is empty for now. As records are created they mirror in automatically.
            </p>
          ) : (
            <CortexGraphView focus={focus} />
          )}
        </div>
        <div className="cortex-layout__agent">
          <CortexAgent
            key={initialDraftId ?? 'default'}
            initialContext={agentContext}
            initialConversationId={initialConversationId}
            initialDraftId={initialDraftId}
            contextUnavailable={Boolean(focus && !agentContext)}
          />
        </div>
      </div>
    </div>
  )
}
