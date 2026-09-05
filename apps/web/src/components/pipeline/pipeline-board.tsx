'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  PIPELINE_STAGES,
  STAGE_LEGACY_MAP,
  formatCentsCompact,
  type PipelineStage,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import { advanceOpportunityStage } from '@/app/(dashboard)/pipeline/actions'
import {
  OpportunityKanbanCard,
  type KanbanCardData,
} from './opportunity-kanban-card'
import styles from './pipeline-workspace.module.css'
import workspace from '@/components/projects/workspace.module.css'
import { LostReasonDialog } from './lost-reason-dialog'
import { RegressionReasonDialog } from './regression-reason-dialog'
import {
  createStageTransitionSubmitter,
  getStageTransitionReasonKind,
  type StageTransitionReasonKind,
} from './stage-transition-action'
import {
  AddOpportunityWithAccountForm,
  type AccountOption,
  type ProjectOption,
} from './add-opportunity-with-account-form'

interface PipelineBoardProps {
  cards: KanbanCardData[]
  accounts: AccountOption[]
  projects: ProjectOption[]
  canCreateOpportunity: boolean
  canAdvanceOpportunity: boolean
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  site_survey: 'Site Survey',
  design: 'Design',
  bom_submission: 'BOM Submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
  lost: 'Lost',
}

const STAGE_ACCENTS: Record<PipelineStage, string> = {
  lead: '#6b7280',
  site_survey: '#6366f1',
  design: '#8b5cf6',
  bom_submission: '#f59e0b',
  negotiation: '#10b981',
  contract: '#0ea5e9',
  won: '#16a34a',
  lost: '#ef4444',
}

const KYC_GATED_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
])

interface PendingStageReason {
  cardId: string
  fromStage: PipelineStage
  toStage: PipelineStage
  kind: StageTransitionReasonKind
}

export function PipelineBoard({
  cards,
  accounts,
  projects,
  canCreateOpportunity,
  canAdvanceOpportunity,
}: PipelineBoardProps) {
  const router = useRouter()
  const search = useSearchParams()
  const query = search.get('q') ?? ''
  const stageFilter = search.get('stage') ?? ''
  const repFilter = search.get('rep') ?? ''
  const listView = search.get('view') === 'list'
  const [queryDraft, setQueryDraft] = useState(query)
  useEffect(() => setQueryDraft(query), [query])
  function filter(updates: Record<string, string>) {
    const params = new URLSearchParams(search.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    router.replace('/pipeline' + (params.size ? '?' + params.toString() : ''), {
      scroll: false,
    })
  }
  const filteredCards = useMemo(
    () =>
      cards.filter(
        (card) =>
          (!stageFilter || STAGE_LEGACY_MAP[card.stage] === stageFilter) &&
          (!repFilter ||
            card.rep_id === repFilter ||
            (repFilter === 'unassigned' && !card.rep_id)) &&
          (!query ||
            [card.account_name, card.project_name, card.rep_email].some(
              (value) => value?.toLowerCase().includes(query.toLowerCase()),
            )),
      ),
    [cards, stageFilter, repFilter, query],
  )
  const reps = [
    ...new Map(
      cards
        .filter((card) => card.rep_id)
        .map((card) => [
          card.rep_id!,
          card.rep_email ?? 'Assigned representative',
        ]),
    ).entries(),
  ]

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)
  const [banner, setBanner] = useState<{
    kind: 'error' | 'info'
    text: string
  } | null>(null)
  const [pendingStageReason, setPendingStageReason] =
    useState<PendingStageReason | null>(null)
  const [quickAddStage, setQuickAddStage] = useState<PipelineStage | null>(null)
  const [isPending, startTransition] = useTransition()
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionSubmitterRef = useRef<ReturnType<
    typeof createStageTransitionSubmitter
  > | null>(null)
  transitionSubmitterRef.current ??= createStageTransitionSubmitter()

  // ── Group cards into canonical columns. Legacy stages route via STAGE_LEGACY_MAP. ─
  const columns = useMemo(() => {
    const buckets: Record<PipelineStage, KanbanCardData[]> = {
      lead: [],
      site_survey: [],
      design: [],
      bom_submission: [],
      negotiation: [],
      contract: [],
      won: [],
      lost: [],
    }
    for (const c of filteredCards) {
      const pipelineStage =
        STAGE_LEGACY_MAP[c.stage as OpportunityStage] ?? 'lead'
      buckets[pipelineStage].push(c)
    }
    return buckets
  }, [filteredCards])

  // ── Realtime: invalidate the route on any opportunities change. ─────────
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const channel = supabase.channel('pipeline-board-realtime')
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities' },
        () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => router.refresh(), 600)
        },
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showBanner(kind: 'error' | 'info', text: string) {
    setBanner({ kind, text })
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = setTimeout(() => setBanner(null), 4200)
  }

  function clearBanner() {
    setBanner(null)
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = null
  }

  function performAdvance(
    cardId: string,
    toStage: PipelineStage,
    reason?: string,
    reasonRequired = false,
  ) {
    clearBanner()
    startTransition(() =>
      transitionSubmitterRef
        .current!.submit(
          {
            execute: (normalizedReason) =>
              advanceOpportunityStage(cardId, toStage, normalizedReason),
            reason,
            reasonRequired,
          },
          {
            onStart: clearBanner,
            onError: (message) => {
              if (message === 'reason_required') {
                // Server insisted on a reason — open the dialog as a fallback.
                const card = cards.find((candidate) => candidate.id === cardId)
                if (card) {
                  const fromStage =
                    STAGE_LEGACY_MAP[card.stage as OpportunityStage] ?? 'lead'
                  const kind = getStageTransitionReasonKind(fromStage, toStage)
                  if (kind) {
                    setPendingStageReason({ cardId, fromStage, toStage, kind })
                    return
                  }
                }
              }
              showBanner('error', message)
            },
            onSuccess: () => router.refresh(),
          },
        )
        .then(() => undefined),
    )
  }

  function handleDrop(toStage: PipelineStage) {
    setDragOverStage(null)
    if (!canAdvanceOpportunity) return
    const cardId = draggingId
    setDraggingId(null)
    if (!cardId) return

    const card = cards.find((c) => c.id === cardId)
    if (!card) return

    const fromStage: PipelineStage =
      STAGE_LEGACY_MAP[card.stage as OpportunityStage] ?? 'lead'
    if (fromStage === toStage) return

    // ── Client-side KYC gate (mirrors server) ─────────────────────────────
    if (KYC_GATED_STAGES.has(toStage)) {
      const kycBlocked = card.opportunity_kyc_initialized
        ? Boolean(card.opportunity_kyc_gate)
        : Boolean(card.account_id) &&
          card.account_kyc_status !== 'approved' &&
          card.account_kyc_status !== 'not_required'
      if (kycBlocked) {
        showBanner(
          'error',
          card.opportunity_kyc_gate ??
            'Account KYC must be Approved before this stage',
        )
        return
      }
    }

    const reasonKind = getStageTransitionReasonKind(fromStage, toStage)
    if (reasonKind) {
      setPendingStageReason({ cardId, fromStage, toStage, kind: reasonKind })
      return
    }

    if (
      toStage === 'won' &&
      !window.confirm(
        'Mark this opportunity as won? This changes the sales outcome.',
      )
    )
      return
    performAdvance(cardId, toStage)
  }

  function handleReasonConfirm(reason: string) {
    const pending = pendingStageReason
    if (!pending) return
    setPendingStageReason(null)
    performAdvance(pending.cardId, pending.toStage, reason, true)
  }

  return (
    <section className={styles.workspace} aria-label="Pipeline workspace">
      {canCreateOpportunity && (
        <p style={{ margin: '0 0 16px' }}>
          <button className={workspace.primary} onClick={() => setQuickAddStage('lead')}>
            New opportunity
          </button>
        </p>
      )}
      <form
        className={workspace.toolbar}
        onSubmit={(event) => {
          event.preventDefault()
          filter({ q: queryDraft.trim() })
        }}
      >
        <label>
          Find opportunities
          <input
            type="search"
            placeholder="Account, project, or representative"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
          />
        </label>
        <label>
          Stage
          <select
            value={stageFilter}
            onChange={(event) => filter({ stage: event.target.value })}
          >
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            value={repFilter}
            onChange={(event) => filter({ rep: event.target.value })}
          >
            <option value="">All representatives</option>
            <option value="unassigned">Unassigned</option>
            {reps.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className={workspace.primary}>Search</button>
        <button
          className={workspace.secondary}
          type="button"
          onClick={() => {
            setQueryDraft('')
            filter({ q: '', stage: '', rep: '' })
          }}
        >
          Reset
        </button>
        <button
          className={workspace.secondary}
          type="button"
          aria-pressed={!listView}
          onClick={() => filter({ view: '' })}
        >
          Board
        </button>
        <button
          className={workspace.secondary}
          type="button"
          aria-pressed={listView}
          onClick={() => filter({ view: 'list' })}
        >
          List
        </button>
      </form>
      <div className={workspace.summary} role="status">
        <span>{filteredCards.length} matching opportunities</span>
        <span>
          Open an opportunity to review details and change its stage with the
          keyboard.
        </span>
      </div>
      {!filteredCards.length && (
        <div className={workspace.empty}>
          <h2>No matching opportunities</h2>
          <p>Try another search or reset the filters.</p>
        </div>
      )}
      {listView && (
        <div className={styles.list}>
          {filteredCards.map((card) => (
            <div key={card.id}>
              <span className={workspace.badge}>
                {STAGE_LABELS[STAGE_LEGACY_MAP[card.stage]]}
              </span>
              <OpportunityKanbanCard
                card={card}
                canAdvance={canAdvanceOpportunity}
                onDragStart={() => {}}
                onDragEnd={() => {}}
              />
            </div>
          ))}
        </div>
      )}
      {banner && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            background: banner.kind === 'error' ? '#fee2e2' : '#dbeafe',
            color: banner.kind === 'error' ? '#991b1b' : '#1e40af',
            border: `1px solid ${banner.kind === 'error' ? '#fecaca' : '#bfdbfe'}`,
          }}
        >
          {banner.text}
        </div>
      )}

      {!canCreateOpportunity && !canAdvanceOpportunity && (
        <div
          role="status"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            background: '#eff6ff',
            color: '#1e3a8a',
            border: '1px solid #bfdbfe',
          }}
        >
          Read-only pipeline access. You can inspect opportunities and project
          context, but cannot create or advance a stage.
        </div>
      )}

      <div
        className={styles.board}
        hidden={listView}
        aria-label="Pipeline stages"
        tabIndex={0}
        style={{
          display: listView ? 'none' : 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '12px',
          opacity: isPending ? 0.85 : 1,
          transition: 'opacity 120ms ease',
        }}
      >
        {PIPELINE_STAGES.filter(
          (stage) => !stageFilter || stage === stageFilter,
        ).map((stage) => {
          const items = columns[stage]
          const subtotal = items.reduce((acc, c) => acc + c.tcv_cents, 0)
          const isOver = dragOverStage === stage
          return (
            <div
              key={stage}
              className={styles.column}
              onDragOver={
                canAdvanceOpportunity
                  ? (e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverStage !== stage) setDragOverStage(stage)
                    }
                  : undefined
              }
              onDragLeave={
                canAdvanceOpportunity
                  ? (e) => {
                      // Only clear if we actually left the column (not just a child).
                      if (e.currentTarget === e.target) setDragOverStage(null)
                    }
                  : undefined
              }
              onDrop={
                canAdvanceOpportunity
                  ? (e) => {
                      e.preventDefault()
                      handleDrop(stage)
                    }
                  : undefined
              }
              style={{
                background: isOver
                  ? 'var(--color-neutral-100)'
                  : 'var(--color-neutral-50)',
                border: `1px solid ${isOver ? STAGE_ACCENTS[stage] : 'var(--color-border)'}`,
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'background 120ms ease, border-color 120ms ease',
                minHeight: '240px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: STAGE_ACCENTS[stage],
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--color-neutral-700)',
                    }}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                {canCreateOpportunity && (
                  <button
                    type="button"
                    onClick={() => setQuickAddStage(stage)}
                    aria-label={`Add opportunity to ${STAGE_LABELS[stage]}`}
                    title={`Add opportunity to ${STAGE_LABELS[stage]}`}
                    style={{
                      background: 'white',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      width: '36px',
                      height: '36px',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      lineHeight: 1,
                      cursor: 'pointer',
                      color: 'var(--color-neutral-600)',
                      padding: 0,
                    }}
                  >
                    +
                  </button>
                )}
              </div>

              <div
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-neutral-500)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {formatCentsCompact(subtotal)}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  flex: 1,
                }}
              >
                {items.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed var(--color-border)',
                      borderRadius: '6px',
                      padding: '16px 8px',
                      textAlign: 'center',
                      color: 'var(--color-neutral-400)',
                      fontSize: '0.75rem',
                    }}
                  >
                    {canAdvanceOpportunity ? 'Drop here' : 'No opportunities'}
                  </div>
                ) : (
                  items.map((card) => (
                    <OpportunityKanbanCard
                      key={card.id}
                      card={card}
                      isDragging={draggingId === card.id}
                      canAdvance={canAdvanceOpportunity}
                      onDragStart={(id) => setDraggingId(id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDragOverStage(null)
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <RegressionReasonDialog
        open={pendingStageReason?.kind === 'regression'}
        fromLabel={
          pendingStageReason ? STAGE_LABELS[pendingStageReason.fromStage] : ''
        }
        toLabel={
          pendingStageReason ? STAGE_LABELS[pendingStageReason.toStage] : ''
        }
        isSubmitting={isPending}
        onCancel={() => setPendingStageReason(null)}
        onConfirm={handleReasonConfirm}
      />

      <LostReasonDialog
        open={pendingStageReason?.kind === 'lost'}
        isSubmitting={isPending}
        onCancel={() => setPendingStageReason(null)}
        onConfirm={handleReasonConfirm}
      />

      {canCreateOpportunity && (
        <AddOpportunityWithAccountForm
          open={quickAddStage !== null}
          defaultStage={quickAddStage ?? 'lead'}
          accounts={accounts}
          projects={projects}
          onClose={() => setQuickAddStage(null)}
        />
      )}
    </section>
  )
}
