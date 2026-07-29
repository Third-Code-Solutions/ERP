'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { CortexCitationList } from './cortex-citation-list'
import {
  CORTEX_CITATIONS_HEADER,
  decodeCortexCitationHeader,
  normalizeCortexCitations,
  type NavigableCortexCitation,
} from '@/lib/cortex/citation-header'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  citations?: NavigableCortexCitation[]
}
interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

const SUGGESTIONS = [
  'What changed recently?',
  'Which projects are active?',
  'Summarize the sales pipeline',
  'Any invoices outstanding?',
]

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime()
  const s = Math.max(0, (Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/**
 * Third Code ERP Cortex — graph-grounded chat with persistent memory. Every
 * turn is stored in the user's DB (cortex_conversations / cortex_messages);
 * past threads load from the history panel so the brain remembers.
 */
export function CortexAgent() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/cortex/conversations')
      if (!res.ok) return
      const data = (await res.json()) as { conversations: Conversation[] }
      setConversations(data.conversations)
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversation(id: string) {
    setError('')
    try {
      const res = await fetch(`/api/cortex/conversations/${id}`)
      if (!res.ok) return
      const data = (await res.json()) as {
        messages: Array<Message & { citations?: unknown }>
      }
      setMessages(
        data.messages.map((message) => ({
          role: message.role,
          content: message.content,
          citations: normalizeCortexCitations(message.citations),
        }))
      )
      setConversationId(id)
      setHistoryOpen(false)
    } catch {
      setError('Could not load that conversation')
    }
  }

  function newChat() {
    setMessages([])
    setConversationId(null)
    setError('')
    setHistoryOpen(false)
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    const next: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setIsStreaming(true)

    try {
      const res = await fetch('/api/cortex/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, conversationId }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const cid = res.headers.get('X-Conversation-Id')
      if (cid) setConversationId(cid)
      const citations = decodeCortexCitationHeader(
        res.headers.get(CORTEX_CITATIONS_HEADER)
      )

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages([
          ...next,
          { role: 'assistant', content: acc, citations },
        ])
      }
      void loadHistory()
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
    <section className="cortex-agent" aria-label="Third Code ERP Cortex">
      <div className="cortex-agent__head">
        <span className="cortex-agent__spark" aria-hidden>✦</span>
        <div className="cortex-agent__headtext">
          <h2 className="cortex-agent__title">Cortex</h2>
          <p className="cortex-agent__sub">Graph-grounded · remembers every chat</p>
        </div>
        <div className="cortex-agent__headbtns">
          <button
            type="button"
            className="cortex-agent__iconbtn"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-pressed={historyOpen}
            title="Conversation history"
          >
            ☰
          </button>
          <button type="button" className="cortex-agent__iconbtn" onClick={newChat} title="New chat">
            ✎
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div className="cortex-agent__history">
          <div className="cortex-agent__history-head">Saved conversations</div>
          {conversations.length === 0 && <p className="cortex-agent__history-empty">No saved chats yet.</p>}
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cortex-agent__history-row${c.id === conversationId ? ' is-active' : ''}`}
                  onClick={() => void loadConversation(c.id)}
                >
                  <span className="cortex-agent__history-title">{c.title || 'Untitled'}</span>
                  <span className="cortex-agent__history-time">{relativeTime(c.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
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
              {m.role === 'assistant' &&
                m.citations &&
                m.citations.length > 0 && (
                  <div className="cortex-msg__sources">
                    <span className="cortex-msg__sources-label">
                      Sources
                    </span>
                    <CortexCitationList
                      citations={m.citations}
                      limit={8}
                    />
                  </div>
                )}
            </div>
          ))}
          {error && (
            <p className="cortex-agent__error" role="alert">
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}

      {!historyOpen && (
        <div className="cortex-agent__input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Cortex…"
            rows={1}
            disabled={isStreaming}
            aria-label="Message to Cortex"
          />
          <button type="button" onClick={() => void send(input)} disabled={isStreaming || !input.trim()}>
            {isStreaming ? '…' : 'Send'}
          </button>
        </div>
      )}
    </section>
  )
}
