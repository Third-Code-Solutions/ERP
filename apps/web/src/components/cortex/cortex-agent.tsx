'use client'

import { useEffect, useRef, useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'What changed recently?',
  'Which projects are active?',
  'Summarize the sales pipeline',
  'Any invoices outstanding?',
]

/**
 * BuildOps Agent (Atlas) — a full-height, graph-grounded chat panel for the
 * Cortex dashboard. Streams from /api/cortex/chat, which answers only from the
 * caller's tenant-scoped knowledge graph and cites the records it used.
 */
export function CortexAgent() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    const next: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setIsStreaming(true)

    const controller = new AbortController()
    try {
      const res = await fetch('/api/cortex/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages([...next, { role: 'assistant', content: acc }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach Cortex')
      setMessages(next)
    } finally {
      setIsStreaming(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  return (
    <section className="cortex-agent" aria-label="BuildOps Agent">
      <div className="cortex-agent__head">
        <span className="cortex-agent__spark" aria-hidden>
          ✦
        </span>
        <div>
          <h2 className="cortex-agent__title">BuildOps Agent</h2>
          <p className="cortex-agent__sub">Grounded in your knowledge graph · cites its sources</p>
        </div>
      </div>

      <div className="cortex-agent__log" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="cortex-agent__empty">
            <p>Ask anything across your projects, pipeline, BOMs, POs and invoices.</p>
            <div className="cortex-agent__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="cortex-agent__chip" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`cortex-msg cortex-msg--${m.role}`}>
            <div className="cortex-msg__bubble">
              {m.content || (isStreaming && i === messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
        {error && (
          <p className="cortex-agent__error" role="alert">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="cortex-agent__input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Cortex…"
          rows={1}
          disabled={isStreaming}
          aria-label="Message to Cortex"
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? '…' : 'Send'}
        </button>
      </div>
    </section>
  )
}
