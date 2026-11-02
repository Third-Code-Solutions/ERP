'use client'

import { useEffect, useRef, useState } from 'react'
import { NativeSubmitButton } from '@/components/forms/native-submit-button'

interface Tenant {
  name: string
  legal_name: string | null
  registered_address: string | null
  document_email: string | null
  document_phone: string | null
  bir_tin: string | null
  pcab_license: string | null
  dpo_contact: string | null
}

export function EditTenantForm({ tenant }: { tenant: Tenant }) {
  const [isOpen, setIsOpen] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isOpen) nameInput.current?.focus() }, [isOpen])
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
    <section aria-labelledby="edit-workspace-heading">
      <form
        method="post"
        action="/settings/submit"
        className="platform-form-card"
      >
        <h2 id="edit-workspace-heading" style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--color-neutral-900)' }}>
          Edit Workspace Settings
        </h2>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label htmlFor="workspace-name" style={labelStyle}>Workspace Name *</label>
            <input id="workspace-name" ref={nameInput} name="name" maxLength={255} required defaultValue={tenant.name} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="workspace-legal_name" style={labelStyle}>Registered Legal Name</label>
            <input id="workspace-legal_name" name="legal_name" maxLength={255} defaultValue={tenant.legal_name ?? ''} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="workspace-registered_address" style={labelStyle}>Registered Address</label>
            <textarea id="workspace-registered_address" name="registered_address" maxLength={1000} defaultValue={tenant.registered_address ?? ''} style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }} />
          </div>
          <div>
            <label htmlFor="workspace-document_email" style={labelStyle}>Document Contact Email</label>
            <input id="workspace-document_email" name="document_email" type="email" maxLength={255} defaultValue={tenant.document_email ?? ''} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="workspace-document_phone" style={labelStyle}>Document Contact Phone</label>
            <input id="workspace-document_phone" name="document_phone" maxLength={64} defaultValue={tenant.document_phone ?? ''} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="workspace-bir_tin" style={labelStyle}>BIR TIN</label>
            <input
              id="workspace-bir_tin" maxLength={20} name="bir_tin"
              defaultValue={tenant.bir_tin ?? ''}
              placeholder="000-000-000-000"
              style={inputStyle}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--color-neutral-400)', margin: '3px 0 0' }}>
              Printed with configured legal identity. ABI OPS does not certify BIR registration or form acceptance.
            </p>
          </div>
          <div>
            <label htmlFor="workspace-pcab_license" style={labelStyle}>PCAB License No.</label>
            <input
              id="workspace-pcab_license" maxLength={50} name="pcab_license"
              defaultValue={tenant.pcab_license ?? ''}
              placeholder="e.g. PCAB-SP-12345"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="workspace-dpo_contact" style={labelStyle}>DPO Contact (RA 10173)</label>
            <input
              id="workspace-dpo_contact" maxLength={255} name="dpo_contact"
              defaultValue={tenant.dpo_contact ?? ''}
              placeholder="dpo@yourcompany.com"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 14px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            Cancel
          </button>
          <NativeSubmitButton pendingLabel="Saving…" className="button button-primary">Save Changes</NativeSubmitButton>
        </div>
      </form>
    </section>
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
