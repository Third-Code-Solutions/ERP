'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export function CloseDateFilter() {
  const router = useRouter()
  const search = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const since = search?.get('since') ?? ''
  const until = search?.get('until') ?? ''

  function commit(next: { since?: string; until?: string }) {
    const params = new URLSearchParams(search?.toString() ?? '')
    if (next.since !== undefined) {
      if (next.since) params.set('since', next.since)
      else params.delete('since')
    }
    if (next.until !== undefined) {
      if (next.until) params.set('until', next.until)
      else params.delete('until')
    }
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `?${qs}` : '?')
    })
  }

  function reset() {
    startTransition(() => router.replace('?'))
  }

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid #d4d4d4',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#ffffff',
    color: '#171717',
  }

  return (
    <form
      style={{
        display: 'inline-flex',
        gap: 8,
        alignItems: 'center',
        fontSize: 13,
        color: 'var(--color-neutral-700, #404040)',
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 120ms ease',
      }}
      onSubmit={(e) => e.preventDefault()}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span>From</span>
        <input
          type="date"
          value={since}
          onChange={(e) => commit({ since: e.target.value })}
          style={inputStyle}
          aria-label="Closing date — from"
        />
      </label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span>To</span>
        <input
          type="date"
          value={until}
          onChange={(e) => commit({ until: e.target.value })}
          style={inputStyle}
          aria-label="Closing date — to"
        />
      </label>
      {(since || until) && (
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #d4d4d4',
            background: '#ffffff',
            color: '#404040',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      )}
    </form>
  )
}
