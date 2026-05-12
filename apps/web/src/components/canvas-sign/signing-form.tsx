'use client'

import { useState, useTransition } from 'react'
import { SignaturePad, getSignatureDataUrl } from './signature-pad'
import { recordCanvasSign } from '@/app/portal/sign/[token]/actions'

interface SigningFormProps {
  token: string
  defaultSignerName: string
  defaultSignerEmail: string
}

export function CanvasSigningForm({
  token,
  defaultSignerName,
  defaultSignerEmail,
}: SigningFormProps) {
  const [name, setName] = useState(defaultSignerName)
  const [email, setEmail] = useState(defaultSignerEmail)
  const [hasInk, setHasInk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const dataUrl = getSignatureDataUrl()
    if (!dataUrl) {
      setError('Signature pad not ready. Refresh and try again.')
      return
    }
    if (!hasInk) {
      setError('Please draw your signature first.')
      return
    }
    startTransition(async () => {
      const res = await recordCanvasSign({
        token,
        signerName: name.trim(),
        signerEmail: email.trim(),
        signatureDataUrl: dataUrl,
      })
      if (!res.ok) {
        setError(res.error ?? 'Could not record signature.')
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-success)' }}>
          Signed — thank you.
        </p>
        <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginTop: 8 }}>
          A copy has been saved to the project record. You can close this window.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label htmlFor="signer-name" style={labelStyle}>Full name *</label>
        <input
          id="signer-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          style={inputStyle}
          placeholder="Juan Dela Cruz"
        />
      </div>

      <div>
        <label htmlFor="signer-email" style={labelStyle}>Email (optional)</label>
        <input
          id="signer-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label style={labelStyle}>Signature *</label>
        <SignaturePad resetKey={resetKey} onChange={setHasInk} />
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="submit"
          disabled={pending || !hasInk}
          style={{
            padding: '10px 18px',
            background: hasInk && !pending ? 'var(--color-navy-700)' : 'var(--color-neutral-300)',
            color: 'white',
            fontWeight: 600,
            border: 0,
            borderRadius: 'var(--radius-md, 6px)',
            cursor: hasInk && !pending ? 'pointer' : 'not-allowed',
            fontSize: 14,
          }}
        >
          {pending ? 'Signing…' : 'Sign'}
        </button>
        <button
          type="button"
          onClick={() => setResetKey((k) => k + 1)}
          style={{
            padding: '10px 14px',
            background: 'transparent',
            color: 'var(--color-neutral-700)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md, 6px)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Reset
        </button>
      </div>
      <p style={{ color: 'var(--color-neutral-500)', fontSize: 11, margin: '4px 0 0' }}>
        By signing you confirm consent to RA 8792 (Electronic Commerce Act). A
        timestamped record of this signature is stored against the project file.
      </p>
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--color-neutral-700)',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'inherit',
  fontSize: 14,
  padding: '8px 10px',
  background: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm, 4px)',
  color: 'var(--color-neutral-900)',
  boxSizing: 'border-box',
}
