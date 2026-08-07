'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CortexCitationList } from './cortex-citation-list'
import {
  CORTEX_CITATIONS_HEADER,
  decodeCortexCitationHeader,
  normalizeCortexCitations,
  type NavigableCortexCitation,
} from '@/lib/cortex/citation-header'
import {
  cortexAgentContextsMatch,
  cortexAgentContextHref,
  cortexAgentContextLabel,
  cortexConversationUrl,
  filterCortexConversations,
  type CortexAgentContext,
} from '@/lib/cortex/agent-context'
import { consumeCortexDraft } from '@/lib/cortex/draft-handoff'

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
  context: CortexAgentContext | null
}

const COMPANY_SUGGESTIONS = [
  'What changed recently?',
  'Which projects are active?',
  'Summarize the sales pipeline',
  'Any invoices outstanding?',
]

const RECORD_SUGGESTIONS = [
  'Summarize this record',
  'What changed on this record?',
  'Show linked records',
  'What needs attention?',
]

interface CortexAgentProps {
  initialContext: CortexAgentContext | null
  initialConversationId?: string | null
  initialDraftId?: string | null
  contextUnavailable?: boolean
}

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
export function CortexAgent({
  initialContext,
  initialConversationId = null,
  initialDraftId = null,
  contextUnavailable = false,
}: CortexAgentProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historySearchRef = useRef<HTMLInputElement>(null)
  const initialRestoreRef = useRef<string | null>(null)
  const initialDraftRef = useRef<string | null>(null)
  const restoreRequestRef = useRef(0)

  const syncConversationUrl = useCallback(
    (id: string | null) => {
      if (typeof window === 'undefined') return
      const nextUrl = cortexConversationUrl(window.location.href, id)
      window.history.replaceState(window.history.state, '', nextUrl)
    },
    []
  )

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
    const log = logRef.current
    if (!log) return
    log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (historyOpen) historySearchRef.current?.focus()
  }, [historyOpen])

  const restoreConversation = useCallback(async (id: string) => {
    const requestId = ++restoreRequestRef.current
    setError('')
    setIsRestoring(true)
    try {
      const res = await fetch(`/api/cortex/conversations/${id}`)
      if (res.status === 404) {
        throw new Error('Conversation not found or no longer available.')
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = (await res.json()) as {
        context: CortexAgentContext | null
        messages: Array<Message & { citations?: unknown }>
      }
      if (!cortexAgentContextsMatch(initialContext, data.context)) {
        throw new Error(
          'Conversation context changed. Reload Cortex and try again.'
        )
      }
      if (requestId !== restoreRequestRef.current) return
      setMessages(
        data.messages.map((message) => ({
          role: message.role,
          content: message.content,
          citations: normalizeCortexCitations(message.citations),
        }))
      )
      setConversationId(id)
      syncConversationUrl(id)
      setHistoryOpen(false)
    } catch (err) {
      if (requestId !== restoreRequestRef.current) return
      setError(
        err instanceof Error ? err.message : 'Could not load that conversation'
      )
    } finally {
      if (requestId === restoreRequestRef.current) setIsRestoring(false)
    }
  }, [initialContext, syncConversationUrl])

  function loadConversation(conversation: Conversation) {
    setError('')
    if (!cortexAgentContextsMatch(initialContext, conversation.context)) {
      setError(
        'This saved chat belongs to a different record. Open that context before continuing.'
      )
      return
    }
    void restoreConversation(conversation.id)
  }

  useEffect(() => {
    if (
      !initialConversationId ||
      contextUnavailable ||
      initialRestoreRef.current === initialConversationId
    ) {
      return
    }
    initialRestoreRef.current = initialConversationId
    void restoreConversation(initialConversationId)
  }, [contextUnavailable, initialConversationId, restoreConversation])

  useEffect(() => {
    if (!initialDraftId || initialDraftRef.current === initialDraftId) return
    initialDraftRef.current = initialDraftId
    const draft = consumeCortexDraft(window.sessionStorage, initialDraftId)
    window.history.replaceState(window.history.state, '', '/cortex')
    if (!draft || contextUnavailable) return
    setInput(draft)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [contextUnavailable, initialDraftId])

  function newChat() {
    restoreRequestRef.current += 1
    setIsRestoring(false)
    setMessages([])
    setConversationId(null)
    syncConversationUrl(null)
    setError('')
    setHistoryOpen(false)
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isStreaming || isRestoring || contextUnavailable) return

    const next: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setIsStreaming(true)

    try {
      const res = await fetch('/api/cortex/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          conversationId,
          context: initialContext
            ? {
                refTable: initialContext.refTable,
                refId: initialContext.refId,
              }
            : undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const cid = res.headers.get('X-Conversation-Id')
      if (cid) {
        setConversationId(cid)
        syncConversationUrl(cid)
      }
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

  const contextLabel = initialContext
    ? cortexAgentContextLabel(initialContext)
    : 'Company-wide'
  const suggestions = initialContext
    ? RECORD_SUGGESTIONS
    : COMPANY_SUGGESTIONS
  const filteredConversations = useMemo(
    () => filterCortexConversations(conversations, historyQuery),
    [conversations, historyQuery]
  )

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

      <div
        className={`cortex-agent__context${contextUnavailable ? ' is-unavailable' : ''}`}
        {...(initialContext
          ? { 'data-cortex-agent-context': initialContext.refTable }
          : {})}
      >
        <div className="cortex-agent__context-copy">
          <span className="cortex-agent__context-eyebrow">
            {contextUnavailable
              ? 'Record unavailable'
              : initialContext
                ? 'Focused on'
                : 'Scope'}
          </span>
          <strong className="cortex-agent__context-title">
            {contextUnavailable ? 'Cannot use this record' : contextLabel}
          </strong>
        </div>
        <span className="cortex-agent__context-note">
          {contextUnavailable
            ? 'Clear focus to continue'
            : initialContext
              ? 'New chats stay with this record'
              : 'Across records you can access'}
        </span>
      </div>

      {historyOpen ? (
        <div className="cortex-agent__history">
          <div className="cortex-agent__history-head">
            <span>Saved conversations</span>
            <span>{conversations.length} recent</span>
          </div>
          <div className="cortex-agent__history-search">
            <input
              ref={historySearchRef}
              type="search"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search recent chats"
              maxLength={100}
              aria-label="Search saved conversations"
            />
            {historyQuery && (
              <button
                type="button"
                onClick={() => {
                  setHistoryQuery('')
                  historySearchRef.current?.focus()
                }}
                aria-label="Clear conversation search"
              >
                Clear
              </button>
            )}
          </div>
          {conversations.length === 0 && (
            <p className="cortex-agent__history-empty">
              No saved chats yet.
            </p>
          )}
          {conversations.length > 0 &&
            filteredConversations.length === 0 && (
              <p className="cortex-agent__history-empty">
                No recent chats match “{historyQuery.trim()}”.
              </p>
            )}
          <ul>
            {filteredConversations.map((c) => (
              <li key={c.id}>
                {cortexAgentContextsMatch(initialContext, c.context) ? (
                  <button
                    type="button"
                    className={`cortex-agent__history-row${c.id === conversationId ? ' is-active' : ''}`}
                    onClick={() => loadConversation(c)}
                  >
                    <span className="cortex-agent__history-copy">
                      <span className="cortex-agent__history-title">
                        {c.title || 'Untitled'}
                      </span>
                      <span className="cortex-agent__history-scope">
                        {c.context
                          ? cortexAgentContextLabel(c.context)
                          : 'Company-wide'}
                      </span>
                    </span>
                    <span className="cortex-agent__history-time">
                      {relativeTime(c.updated_at)}
                    </span>
                  </button>
                ) : (
                  <a
                    className="cortex-agent__history-row is-other-context"
                    href={cortexAgentContextHref(c.context, c.id)}
                    aria-label={`Open ${c.context ? cortexAgentContextLabel(c.context) : 'company-wide'} context for ${c.title || 'Untitled'}`}
                  >
                    <span className="cortex-agent__history-copy">
                      <span className="cortex-agent__history-title">
                        {c.title || 'Untitled'}
                      </span>
                      <span className="cortex-agent__history-scope">
                        {c.context
                          ? cortexAgentContextLabel(c.context)
                          : 'Company-wide'}
                      </span>
                    </span>
                    <span className="cortex-agent__history-open">
                      Open context
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          ref={logRef}
          className="cortex-agent__log"
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="cortex-agent__empty">
              <p>
                {isRestoring
                  ? 'Loading saved conversation…'
                  : contextUnavailable
                  ? 'This focused record is unavailable. Clear focus before starting a chat.'
                  : initialContext
                    ? 'Ask about this record, its changes, evidence, and linked work.'
                    : 'Ask anything across your projects, pipeline, BOMs, POs and invoices.'}
              </p>
              {!contextUnavailable && !isRestoring && (
                <div className="cortex-agent__suggestions">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="cortex-agent__chip"
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
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
        </div>
      )}

      {!historyOpen && (
        <div className="cortex-agent__input">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Cortex…"
            rows={1}
            disabled={isStreaming || isRestoring || contextUnavailable}
            aria-label="Message to Cortex"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={
              isStreaming ||
              isRestoring ||
              contextUnavailable ||
              !input.trim()
            }
          >
            {isStreaming ? '…' : 'Send'}
          </button>
        </div>
      )}
    </section>
  )
}
