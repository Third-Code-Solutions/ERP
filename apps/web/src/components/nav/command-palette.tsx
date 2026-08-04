'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRouter } from 'next/navigation'
import type { SearchHitType } from '@/app/api/search/search-policy'
import { stageCortexDraft } from '@/lib/cortex/draft-handoff'
import {
  commandPaletteOptionCount,
  resolveCommandPaletteSelection,
} from './command-palette-selection'
import {
  activeCommandPaletteIndex,
  nextCommandPaletteIndex,
} from './command-palette-navigation'

interface SearchHit {
  type: SearchHitType
  id: string
  title: string
  subtitle?: string
  href: string
}

const TYPE_LABEL: Record<SearchHit['type'], string> = {
  account: 'Account',
  project: 'Project',
  opportunity: 'Opportunity',
  bom: 'BOM',
  po: 'Purchase order',
  invoice: 'Invoice',
  claim: 'Progress claim',
  document: 'Document',
  task: 'My task',
  permit: 'Permit',
  punchlist: 'Punchlist',
  warranty: 'Warranty ticket',
  delivery: 'Delivery',
  rfq: 'RFQ',
  ledger_account: 'Ledger account',
  journal_entry: 'Journal entry',
}

const TYPE_TONE: Record<SearchHit['type'], string> = {
  account: 'var(--color-navy-700)',
  project: 'var(--color-navy-600)',
  opportunity: 'var(--color-gold-600)',
  bom: 'var(--color-success)',
  po: 'var(--color-info)',
  invoice: 'var(--color-warning)',
  claim: 'var(--color-danger)',
  document: 'var(--color-neutral-600)',
  task: 'var(--color-success)',
  permit: 'var(--color-warning)',
  punchlist: 'var(--color-danger)',
  warranty: 'var(--color-gold-600)',
  delivery: 'var(--color-info)',
  rfq: 'var(--color-navy-600)',
  ledger_account: 'var(--color-navy-700)',
  journal_entry: 'var(--color-success)',
}

interface Props {
  open: boolean
  onClose: () => void
}

type CommandMode = 'search' | 'ask'

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<CommandMode>('search')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const debounceRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const term = q.trim()
  const visibleHits = mode === 'search' ? hits : []
  const canAskCortex = mode === 'ask' && term.length >= 2
  const optionCount = commandPaletteOptionCount(
    visibleHits.length,
    canAskCortex
  )

  useGSAP(
    () => {
      if (
        !open ||
        !panelRef.current ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return
      }
      gsap.fromTo(
        panelRef.current,
        { y: -12, scale: 0.985, opacity: 0 },
        {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.24,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      )
    },
    { dependencies: [open], scope: panelRef, revertOnUpdate: true }
  )

  // Focus the input when the modal opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Reset when closed.
  useEffect(() => {
    if (!open) {
      setQ('')
      setMode('search')
      setHits([])
      setActiveIdx(0)
      setHint(null)
    }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()
    const requestSeq = ++requestSeqRef.current

    if (!open || mode !== 'search') {
      setHits([])
      setHint(null)
      setLoading(false)
      return
    }

    if (term.length < 2) {
      setHits([])
      setHint(term.length === 0 ? null : 'Type at least 2 characters.')
      setLoading(false)
      return
    }

    // Do not leave results for the previous term visible while the next
    // request is waiting on its debounce window.
    setHits([])
    setActiveIdx(0)
    setHint(null)
    debounceRef.current = window.setTimeout(async () => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      setHint(null)
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term)}`,
          { signal: ctrl.signal, headers: { Accept: 'application/json' } }
        )
        if (requestSeq !== requestSeqRef.current) return
        if (!res.ok) {
          setHits([])
          setHint(`Search failed (${res.status})`)
          return
        }
        const data = (await res.json()) as { hits: SearchHit[]; hint?: string }
        if (requestSeq !== requestSeqRef.current) return
        setHits(data.hits ?? [])
        setHint(data.hint ?? (data.hits.length === 0 ? 'No matches.' : null))
        setActiveIdx(0)
      } catch (err) {
        if (
          requestSeq === requestSeqRef.current &&
          (err as Error).name !== 'AbortError'
        ) {
          setHits([])
          setHint('Network error.')
        }
      } finally {
        if (requestSeq === requestSeqRef.current) setLoading(false)
      }
    }, 180)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [term, open, mode])

  const selectHit = useCallback(
    (hit: SearchHit) => {
      onClose()
      router.push(hit.href)
    },
    [onClose, router]
  )

  const askCortex = useCallback(() => {
    const handoffId = window.crypto.randomUUID()
    if (!stageCortexDraft(window.sessionStorage, handoffId, term)) {
      setHint('Could not prepare Cortex. Try again.')
      return
    }
    onClose()
    router.push(`/cortex?handoff=${encodeURIComponent(handoffId)}`)
  }, [onClose, router, term])

  useEffect(() => {
    setActiveIdx((index) =>
      Math.min(index, Math.max(0, optionCount - 1))
    )
  }, [optionCount])

  // Keyboard nav.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => nextCommandPaletteIndex(i, optionCount, 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => nextCommandPaletteIndex(i, optionCount, -1))
      return
    }
    if (e.key === 'Enter') {
      const selection = resolveCommandPaletteSelection(
        activeIdx,
        visibleHits.length,
        canAskCortex
      )
      if (selection) {
        e.preventDefault()
        if (selection.kind === 'hit') {
          selectHit(visibleHits[selection.index]!)
        } else {
          askCortex()
        }
      }
    }
  }

  if (!open) return null

  const activeOptionIndex = activeCommandPaletteIndex(activeIdx, optionCount)
  const activeOptionId =
    activeOptionIndex >= 0
      ? activeOptionIndex < visibleHits.length
        ? `cmdpal-option-hit-${activeOptionIndex}`
        : 'cmdpal-option-cortex'
      : undefined

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      aria-modal="true"
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '12vh 16px 16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'white',
          borderRadius: 12,
          boxShadow:
            '0 24px 64px -16px rgba(15, 45, 74, 0.32), 0 4px 12px rgba(15, 45, 74, 0.08)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--color-neutral-500)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              mode === 'search'
                ? 'Search projects, documents, tasks, records…'
                : 'Ask across records you can access…'
            }
            aria-label={mode === 'search' ? 'Search' : 'Ask Cortex'}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={optionCount > 0}
            aria-controls="cmdpal-results"
            aria-haspopup="listbox"
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            style={{
              flex: 1,
              border: 0,
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: 15,
              color: 'var(--color-neutral-900)',
              background: 'transparent',
            }}
          />
          <kbd
            style={{
              fontFamily: 'inherit',
              fontSize: 10.5,
              padding: '3px 6px',
              background: 'var(--color-neutral-100)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              color: 'var(--color-neutral-500)',
            }}
          >
            ESC
          </kbd>
        </div>
        <div
          role="tablist"
          aria-label="Command mode"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            padding: '6px 8px',
            background: 'var(--color-neutral-50)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {(
            [
              ['search', 'Search records'],
              ['ask', 'Ask Cortex'],
            ] as const
          ).map(([value, label]) => {
            const selected = mode === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setMode(value)
                  setActiveIdx(0)
                  window.setTimeout(() => inputRef.current?.focus(), 0)
                }}
                style={{
                  minHeight: 44,
                  border: selected
                    ? '1px solid var(--color-navy-100)'
                    : '1px solid transparent',
                  borderRadius: 7,
                  background: selected ? 'white' : 'transparent',
                  boxShadow: selected
                    ? '0 1px 3px rgba(15, 45, 74, 0.08)'
                    : 'none',
                  color: selected
                    ? 'var(--color-navy-700)'
                    : 'var(--color-neutral-500)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: selected ? 650 : 550,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div
          id="cmdpal-results"
          role="listbox"
          aria-label={mode === 'search' ? 'Search results' : 'Cortex actions'}
          style={{ maxHeight: '60vh', overflowY: 'auto' }}
        >
          {mode === 'search' && loading && (
            <div
              role="status"
              aria-live="polite"
              style={{ padding: 20, fontSize: 13, color: 'var(--color-neutral-500)' }}
            >
              Searching…
            </div>
          )}
          {mode === 'search' && !loading && hits.length === 0 && hint && (
            <div
              role={
                hint.startsWith('Search failed') || hint === 'Network error.'
                  ? 'alert'
                  : 'status'
              }
              aria-live="polite"
              style={{ padding: 20, fontSize: 13, color: 'var(--color-neutral-500)' }}
            >
              {hint}
            </div>
          )}
          {mode === 'search' &&
            !loading &&
            hits.length === 0 &&
            !hint &&
            q.length < 2 && (
              <div
                style={{
                  padding: 20,
                  fontSize: 13,
                  color: 'var(--color-neutral-500)',
                }}
              >
                <p style={{ margin: 0 }}>
                  Start typing to search across every module you have access
                  to.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                  Use <kbd style={kbd}>↑</kbd> <kbd style={kbd}>↓</kbd> to
                  navigate, <kbd style={kbd}>Enter</kbd> to open.
                </p>
              </div>
            )}
          {mode === 'ask' && term.length < 2 && (
            <div
              style={{
                padding: 20,
                color: 'var(--color-neutral-500)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Ask about records you can access. Opening Cortex drafts your
              question; nothing is sent until you press Send.
            </div>
          )}
          {visibleHits.map((hit, i) => (
            <button
              type="button"
              key={`${hit.type}-${hit.id}`}
              id={`cmdpal-option-hit-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => selectHit(hit)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: i === activeIdx ? 'var(--color-neutral-50)' : 'white',
                border: 0,
                borderBottom: '1px solid var(--color-border)',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '3px 7px',
                  borderRadius: 4,
                  background: 'var(--color-neutral-100)',
                  color: TYPE_TONE[hit.type],
                  minWidth: 72,
                  textAlign: 'center',
                }}
              >
                {TYPE_LABEL[hit.type]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: 'var(--color-neutral-900)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hit.title}
                </div>
                {hit.subtitle && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-neutral-500)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hit.subtitle}
                  </div>
                )}
              </div>
              <span aria-hidden style={{ color: 'var(--color-neutral-300)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          ))}
          {canAskCortex && (
            <button
              type="button"
              id="cmdpal-option-cortex"
              role="option"
              aria-selected={activeIdx === visibleHits.length}
              aria-label={`Ask Cortex: ${term}`}
              onMouseEnter={() => setActiveIdx(visibleHits.length)}
              onClick={askCortex}
              style={{
                width: '100%',
                minHeight: 60,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background:
                  activeIdx === visibleHits.length
                    ? 'var(--color-navy-50)'
                    : 'white',
                border: 0,
                borderTop: '1px solid var(--color-border)',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  flex: '0 0 32px',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 8,
                  background: 'var(--color-navy-700)',
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                AI
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    color: 'var(--color-navy-700)',
                    fontSize: 13.5,
                    fontWeight: 650,
                  }}
                >
                  Ask Cortex
                </span>
                <span
                  title={term}
                  style={{
                    display: 'block',
                    marginTop: 2,
                    color: 'var(--color-neutral-500)',
                    fontSize: 11.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Draft “{term}” in the permissioned AI Brain
                </span>
              </span>
              <span
                aria-hidden
                style={{
                  flex: '0 0 auto',
                  color: 'var(--color-navy-500)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Open
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const kbd: React.CSSProperties = {
  display: 'inline-block',
  padding: '0 5px',
  background: 'var(--color-neutral-100)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  fontFamily: 'inherit',
  fontSize: 10.5,
  color: 'var(--color-neutral-500)',
  minWidth: 14,
  textAlign: 'center',
}
