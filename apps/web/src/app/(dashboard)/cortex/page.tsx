import type { Metadata } from 'next'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { AccountNotProvisioned } from '@/components/auth/account-not-provisioned'
import { CortexBriefPanel } from '@/components/cortex/cortex-brief-panel'
import { CortexGraphView } from '@/components/cortex/cortex-graph-view'
import { CortexAgent } from '@/components/cortex/cortex-agent'
import { CortexIndexButton } from '@/components/cortex/cortex-index-button'
import { presentCortexBrief } from '@/lib/cortex/brief-presentation'
import { readCortexBrief } from '@/lib/cortex/brief-read'
import { authorizeCortexRecordContext } from '@/lib/cortex/record-context'
import { cortexSemanticIndexControlAccess } from '@/lib/cortex/semantic-index-control'
import styles from '@/components/cortex/cortex-workspace.module.css'

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

  const briefRead = await readCortexBrief({
    tenantId: profile.tenantId,
    role: profile.role,
    limit: 8,
  })
  const brief = briefRead.ok ? presentCortexBrief(briefRead.brief) : null
  const briefError = briefRead.ok ? null : briefRead.error
  const stats = brief?.stats
  const semanticIndexControl = cortexSemanticIndexControlAccess(
    profile.role,
    profile.tenantId
  )

  const kpis = brief
    ? [
        { label: 'Records', value: brief.stats.nodes },
        { label: 'Connections', value: brief.stats.edges },
        { label: 'Record types', value: brief.stats.byType.length },
        { label: 'Provenance events', value: brief.stats.provenance },
      ]
    : []

  return (
    <div className={`cortex-page ${styles.workspace}`}>
      <header className="cortex-page__head">
        <div>
          <h1 className="cortex-page__title">
            Cortex <span className="cortex-page__badge">AI Brain</span>
          </h1>
          <p className="cortex-page__sub">
            Explore connected work. Inspect the evidence. Ask questions with sources.
          </p>
        </div>
        {semanticIndexControl.visible && (
          <CortexIndexButton
            enabled={semanticIndexControl.enabled}
          />
        )}
      </header>

      {brief ? (
        <>
          <div className="cortex-kpis">
            {kpis.map((k) => (
              <div key={k.label} className="cortex-kpi">
                <span className="cortex-kpi__value">{k.value.toLocaleString()}</span>
                <span className="cortex-kpi__label">{k.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <section className="dashboard-data-notice" role="status" aria-label="Cortex brief notice">
          <strong>Cortex knowledge pulse is temporarily unavailable.</strong>
          <span>
            {briefError} No direct database fallback was used; retry later.
          </span>
        </section>
      )}

      <div className="cortex-layout">
        <nav className={styles.mobileNav} aria-label="Cortex workspace">
          <a href="#cortex-explore">Explore records</a><a href="#cortex-assistant">Ask Cortex</a>
        </nav>
        <div className="cortex-layout__graph" id="cortex-explore">
          <h2 className="cortex-section-title">Knowledge Graph</h2>
          {!stats ? (
            <p className="cortex-empty-note">
              Graph metrics are unavailable while the Cortex read authority is recovering.
            </p>
          ) : stats.nodes === 0 ? (
            <p className="cortex-empty-note">
              The graph is empty for now. As records are created they mirror in automatically.
            </p>
          ) : (
            <CortexGraphView focus={focus} />
          )}
        </div>
        <div className="cortex-layout__agent" id="cortex-assistant">
          <CortexAgent
            key={initialDraftId ?? 'default'}
            initialContext={agentContext}
            initialConversationId={initialConversationId}
            initialDraftId={initialDraftId}
            contextUnavailable={Boolean(focus && !agentContext)}
            canUseAssistant={can(profile.role, 'cortex.assistant.use')}
          />
        </div>
      </div>
      {brief && (
        <details className={styles.activity}>
          <summary>Knowledge pulse <span>Recent changes and graph coverage</span></summary>
          <CortexBriefPanel brief={brief} />
        </details>
      )}
    </div>
  )
}
