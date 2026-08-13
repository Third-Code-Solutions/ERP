'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { RegressionReasonDialog } from './regression-reason-dialog'
import {
  AddOpportunityWithAccountForm,
  type AccountOption,
  type ProjectOption,
} from './add-opportunity-with-account-form'

interface PipelineBoardProps {
  cards: KanbanCardData[]
  accounts: AccountOption[]
  projects: ProjectOption[]
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

interface PendingRegression {
  cardId: string
  fromStage: PipelineStage
  toStage: PipelineStage
}

export function PipelineBoard({ cards, accounts, projects }: PipelineBoardProps) {
  const router = useRouter()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)
  const [banner, setBanner] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [pendingRegression, setPendingRegression] = useState<PendingRegression | null>(null)
  const [quickAddStage, setQuickAddStage] = useState<PipelineStage | null>(null)
  const [isPending, startTransition] = useTransition()
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    for (const c of cards) {
      const pipelineStage = STAGE_LEGACY_MAP[c.stage as OpportunityStage] ?? 'lead'
      buckets[pipelineStage].push(c)
    }
    return buckets
  }, [cards])

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
        }
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

  function performAdvance(cardId: string, toStage: PipelineStage, reason?: string) {
    startTransition(async () => {
      const res = await advanceOpportunityStage(cardId, toStage, reason)
      if (res.error) {
        if (res.error === 'reason_required') {
          // Server insisted on a reason — open the dialog as a fallback.
          const card = cards.find((c) => c.id === cardId)
          if (card) {
            const fromStage =
              STAGE_LEGACY_MAP[card.stage as OpportunityStage] ?? 'lead'
            setPendingRegression({ cardId, fromStage, toStage })
          }
          return
        }
        showBanner('error', res.error)
        return
      }
      router.refresh()
    })
  }

  function handleDrop(toStage: PipelineStage) {
    setDragOverStage(null)
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
      const kycOk =
        card.account_kyc_status === 'approved' ||
        card.account_kyc_status === 'not_required'
      if (!kycOk) {
        showBanner('error', 'Account KYC must be Approved before this stage')
        return
      }
    }

    // ── Regression detection ──────────────────────────────────────────────
    const isRegression =
      PIPELINE_STAGES.indexOf(toStage) < PIPELINE_STAGES.indexOf(fromStage) &&
      toStage !== 'lost'
    if (isRegression) {
      setPendingRegression({ cardId, fromStage, toStage })
      return
    }

    performAdvance(cardId, toStage)
  }

  function handleRegressionConfirm(reason: string) {
    const pr = pendingRegression
    if (!pr) return
    setPendingRegression(null)
    performAdvance(pr.cardId, pr.toStage, reason)
  }

  return (
    <>
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

      <div
        style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '12px',
          opacity: isPending ? 0.85 : 1,
          transition: 'opacity 120ms ease',
        }}
      >
        {PIPELINE_STAGES.map((stage) => {
          const items = columns[stage]
          const subtotal = items.reduce((acc, c) => acc + c.tcv_cents, 0)
          const isOver = dragOverStage === stage
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverStage !== stage) setDragOverStage(stage)
              }}
              onDragLeave={(e) => {
                // Only clear if we actually left the column (not just a child).
                if (e.currentTarget === e.target) setDragOverStage(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(stage)
              }}
              style={{
                flex: '0 0 280px',
                background: isOver ? 'var(--color-neutral-100)' : 'var(--color-neutral-50)',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <button
                  type="button"
                  onClick={() => setQuickAddStage(stage)}
                  aria-label={`Add opportunity to ${STAGE_LABELS[stage]}`}
                  title={`Add opportunity to ${STAGE_LABELS[stage]}`}
                  style={{
                    background: 'white',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    width: '22px',
                    height: '22px',
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
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
                    Drop here
                  </div>
                ) : (
                  items.map((card) => (
                    <OpportunityKanbanCard
                      key={card.id}
                      card={card}
                      isDragging={draggingId === card.id}
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
        open={pendingRegression !== null}
        fromLabel={pendingRegression ? STAGE_LABELS[pendingRegression.fromStage] : ''}
        toLabel={pendingRegression ? STAGE_LABELS[pendingRegression.toStage] : ''}
        isSubmitting={isPending}
        onCancel={() => setPendingRegression(null)}
        onConfirm={handleRegressionConfirm}
      />

      <AddOpportunityWithAccountForm
        open={quickAddStage !== null}
        defaultStage={quickAddStage ?? 'lead'}
        accounts={accounts}
        projects={projects}
        onClose={() => setQuickAddStage(null)}
      />
    </>
  )
}
