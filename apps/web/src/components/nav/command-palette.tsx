'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchHitType } from '@/app/api/search/search-policy'

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

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const debounceRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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
      setHits([])
      setActiveIdx(0)
      setHint(null)
    }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      setHint(term.length === 0 ? null : 'Type at least 2 characters.')
      setLoading(false)
      return
    }

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
        if (!res.ok) {
          setHits([])
          setHint(`Search failed (${res.status})`)
          return
        }
        const data = (await res.json()) as { hits: SearchHit[]; hint?: string }
        setHits(data.hits ?? [])
        setHint(data.hint ?? (data.hits.length === 0 ? 'No matches.' : null))
        setActiveIdx(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setHits([])
          setHint('Network error.')
        }
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [q, open])

  const selectHit = useCallback(
    (hit: SearchHit) => {
      onClose()
      router.push(hit.href)
    },
    [onClose, router]
  )

  // Keyboard nav.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' && hits[activeIdx]) {
      e.preventDefault()
      selectHit(hits[activeIdx])
      return
    }
  }

  if (!open) return null

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
        role="combobox"
        aria-expanded
        aria-controls="cmdpal-results"
        aria-haspopup="listbox"
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
            placeholder="Search projects, documents, tasks, records…"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
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
          id="cmdpal-results"
          role="listbox"
          style={{ maxHeight: '60vh', overflowY: 'auto' }}
        >
          {loading && (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--color-neutral-500)' }}>
              Searching…
            </div>
          )}
          {!loading && hits.length === 0 && hint && (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--color-neutral-500)' }}>
              {hint}
            </div>
          )}
          {!loading && hits.length === 0 && !hint && q.length < 2 && (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--color-neutral-500)' }}>
              <p style={{ margin: 0 }}>Start typing to search across every module you have access to.</p>
              <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                Use <kbd style={kbd}>↑</kbd> <kbd style={kbd}>↓</kbd> to navigate,{' '}
                <kbd style={kbd}>Enter</kbd> to open.
              </p>
            </div>
          )}
          {hits.map((hit, i) => (
            <button
              type="button"
              key={`${hit.type}-${hit.id}`}
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
