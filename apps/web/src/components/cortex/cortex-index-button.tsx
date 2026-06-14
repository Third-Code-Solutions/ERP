'use client'

import { useState } from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'running'; done: number }
  | { kind: 'done'; done: number }
  | { kind: 'error'; message: string }

const MAX_BATCHES = 80

/**
 * Admin control: builds the semantic index by embedding the tenant's graph
 * nodes in batches via POST /api/cortex/embed (uses the server's OpenAI key).
 * Loops until the backlog is drained. Enables semantic search + smarter agent.
 */
export function CortexIndexButton() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function run() {
    setState({ kind: 'running', done: 0 })
    let done = 0
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const res = await fetch('/api/cortex/embed', { method: 'POST' })
        if (res.status === 503) {
          setState({ kind: 'error', message: 'AI key not configured on the server' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error', message: `Indexing failed (${res.status})` })
          return
        }
        const data = (await res.json()) as { embedded: number; remaining: number }
        done += data.embedded
        setState({ kind: 'running', done })
        if (data.remaining === 0 || data.embedded === 0) break
      }
      setState({ kind: 'done', done })
    } catch {
      setState({ kind: 'error', message: 'Could not reach the indexer' })
    }
  }

  const label =
    state.kind === 'running'
      ? `Indexing… ${state.done}`
      : state.kind === 'done'
        ? `Indexed ${state.done} ✓`
        : 'Build semantic index'

  return (
    <div className="cortex-index-ctl">
      <button
        type="button"
        className="cortex-tool-btn"
        onClick={() => void run()}
        disabled={state.kind === 'running'}
        title="Embed records so the agent and search understand meaning, not just keywords"
      >
        {label}
      </button>
      {state.kind === 'error' && <span className="cortex-index-ctl__err">{state.message}</span>}
    </div>
  )
}
