'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateTenantSettings } from '@/app/(dashboard)/settings/actions'

interface Tenant {
  name: string
  bir_tin: string | null
  pcab_license: string | null
  dpo_contact: string | null
}

export function EditTenantForm({ tenant }: { tenant: Tenant }) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateTenantSettings(data)
      if (result.error) {
        setError(result.error)
      } else {
        setIsOpen(false)
        router.refresh()
      }
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '7px 14px',
          fontSize: '0.8125rem',
          fontWeight: 500,
          cursor: 'pointer',
          color: 'var(--color-neutral-700)',
        }}
      >
        Edit
      </button>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ background: 'white', borderRadius: '10px', padding: '24px', width: '480px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--color-neutral-900)' }}>
          Edit Workspace Settings
        </h2>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Company Name *</label>
            <input name="name" required defaultValue={tenant.name} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>BIR TIN</label>
            <input
              name="bir_tin"
              defaultValue={tenant.bir_tin ?? ''}
              placeholder="000-000-000-000"
              style={inputStyle}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--color-neutral-400)', margin: '3px 0 0' }}>
              Shown on invoices and purchase orders for BIR compliance.
            </p>
          </div>
          <div>
            <label style={labelStyle}>PCAB License No.</label>
            <input
              name="pcab_license"
              defaultValue={tenant.pcab_license ?? ''}
              placeholder="e.g. PCAB-SP-12345"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>DPO Contact (RA 10173)</label>
            <input
              name="dpo_contact"
              defaultValue={tenant.dpo_contact ?? ''}
              placeholder="dpo@yourcompany.com"
              style={inputStyle}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 14px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '0.8125rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--color-neutral-500)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
