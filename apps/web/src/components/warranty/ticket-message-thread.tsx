'use client'

/**
 * Ticket message thread (REFACTOR.md US-WA-002 #2-#3).
 *
 * Internal-vs-client messages get distinct styling. The compose form has an
 * internal toggle — internal messages are not mirrored to the client email.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { postTicketMessage } from '@/app/(dashboard)/warranty/actions'

interface ThreadMessage {
  id: string
  body: string
  is_internal: boolean
  sender_label: string
  created_at: string
}

interface Props {
  ticketId: string
  messages: ThreadMessage[]
  canManage: boolean
}

export function TicketMessageThread({ ticketId, messages, canManage }: Props) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const trimmed = body.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await postTicketMessage(ticketId, trimmed, isInternal)
      if (result?.error) {
        setError(result.error)
      } else {
        setBody('')
        setIsInternal(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Conversation ({messages.length})</h2>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--color-neutral-600)', fontSize: 13 }}>
            No messages yet — be the first to reach out.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: m.is_internal ? '#f4f6f9' : '#ffffff',
                border: m.is_internal ? '1px dashed #c4cdd9' : '1px solid #e1e4ea',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{m.sender_label}</strong>
                  {m.is_internal && (
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: 0.08,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#525866',
                        color: 'white',
                        fontWeight: 600,
                      }}
                    >
                      Internal
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>
                  {new Date(m.created_at).toLocaleString('en-PH')}
                </span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.55 }}>
                {m.body}
              </div>
            </div>
          ))
        )}

        {canManage && (
          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingTop: 12,
              borderTop: '1px solid #e1e4ea',
            }}
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                isInternal
                  ? 'Internal note — not visible to the client.'
                  : 'Reply to the client. They will receive an email update.'
              }
              rows={3}
              maxLength={8000}
              style={{
                width: '100%',
                border: '1px solid #d0d5dd',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13.5,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                Internal note (CX/PM only)
              </label>
              <button
                type="submit"
                disabled={isPending || !body.trim()}
                style={{
                  background: 'var(--color-navy-700, #0F2D4A)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: isPending || !body.trim() ? 'not-allowed' : 'pointer',
                  opacity: isPending || !body.trim() ? 0.6 : 1,
                }}
              >
                {isPending ? 'Sending…' : 'Send message'}
              </button>
            </div>
            {error && (
              <div style={{ color: 'var(--color-danger, #b42318)', fontSize: 12.5 }}>{error}</div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
