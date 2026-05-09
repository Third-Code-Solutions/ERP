'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ProjectChatProps {
  projectId: string
}

export function ProjectChat({ projectId }: ProjectChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isStreaming) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setError('')
    setIsStreaming(true)

    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, projectId }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? `Request failed: ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages([...newMessages, { role: 'assistant', content: accumulated }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
      setMessages(newMessages)
    } finally {
      setIsStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 50 }}>
      {/* Chat window */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '52px',
            right: 0,
            width: '360px',
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-navy-700)',
              color: 'white',
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Project Assistant</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Ask about costs, margins, billing</div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.125rem', lineHeight: 1, opacity: 0.7 }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              height: '320px',
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {messages.length === 0 && (
              <div style={{ color: 'var(--color-neutral-400)', fontSize: '0.8125rem', textAlign: 'center', marginTop: '40px' }}>
                <div style={{ marginBottom: '8px' }}>Ask anything about this project</div>
                {['What is the GP margin?', 'Show me the invoice summary', 'What are the biggest cost items?'].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus() }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      margin: '4px 0',
                      background: 'var(--color-neutral-50)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      color: 'var(--color-navy-700)',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? 'var(--color-navy-700)' : 'var(--color-neutral-100)',
                    color: msg.role === 'user' ? 'white' : 'var(--color-neutral-900)',
                    fontSize: '0.8125rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content || (isStreaming && i === messages.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
            {error && (
              <div style={{ fontSize: '0.75rem', color: '#ef4444', textAlign: 'center' }}>{error}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this project…"
              rows={1}
              disabled={isStreaming}
              style={{
                flex: 1,
                resize: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.8125rem',
                fontFamily: 'inherit',
                outline: 'none',
                lineHeight: 1.4,
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={isStreaming || !input.trim()}
              style={{
                background: 'var(--color-navy-700)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: isStreaming || !input.trim() ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {isStreaming ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}
        title="Ask AI about this project"
      >
        {isOpen ? '×' : '✦'}
      </button>
    </div>
  )
}
