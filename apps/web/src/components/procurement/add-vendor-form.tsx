'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createVendor } from '@/app/(dashboard)/procurement/actions'

export function AddVendorForm() {
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createVendor(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setShowForm(false)
        router.refresh()
      }
    })
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={{
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 14px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + Add Vendor
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--color-neutral-50)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        {[
          { label: 'Vendor Name *', name: 'name', required: true },
          { label: 'Contact Person', name: 'contact_name' },
          { label: 'Email', name: 'email', type: 'email' },
          { label: 'Phone', name: 'phone' },
          { label: 'BIR TIN', name: 'bir_tin' },
          { label: 'Address', name: 'address' },
        ].map(({ label, name, required, type }) => (
          <div key={name}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-neutral-500)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {label}
            </label>
            <input
              type={type ?? 'text'}
              name={name}
              required={required}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {error && <span style={{ fontSize: '0.8rem', color: '#ef4444', marginRight: 'auto' }}>{error}</span>}
        <button
          type="button"
          onClick={() => { setShowForm(false); setError('') }}
          style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-neutral-600)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? 'Saving…' : 'Save Vendor'}
        </button>
      </div>
    </form>
  )
}
