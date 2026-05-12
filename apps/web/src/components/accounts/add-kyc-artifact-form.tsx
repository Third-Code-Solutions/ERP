'use client'

import { useState, useTransition } from 'react'
import { addKycArtifact } from '@/app/(dashboard)/crm/accounts/actions'
import { kycArtifactTypeValues } from '@buildops/shared-types'

const ARTIFACT_LABEL: Record<string, string> = {
  afs_year_1: 'AFS — Year 1',
  afs_year_2: 'AFS — Year 2',
  afs_year_3: 'AFS — Year 3',
  bir_2303: 'BIR 2303',
  vat_certificate: 'VAT certificate',
  top_suppliers: 'Top 10 suppliers',
  top_clients: 'Top 10 clients',
  other: 'Other',
}

// Phase 0 stub — accepts a manually entered document_id so Finance can
// record artifact metadata even before the full document-picker UI ships
// later in Phase 3. Document upload happens via the existing 3-step
// signed-URL pipeline (see /api/upload/sign) on the Documents page.
export function AddKycArtifactForm({ accountId }: { accountId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await addKycArtifact(formData)
      if (res?.error) setError(res.error)
      else {
        const form = document.getElementById('add-kyc-artifact') as HTMLFormElement
        form?.reset()
      }
    })
  }

  return (
    <form
      id="add-kyc-artifact"
      action={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <input type="hidden" name="account_id" value={accountId} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select
          name="artifact_type"
          required
          defaultValue="afs_year_1"
          style={{
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 8,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          {kycArtifactTypeValues.map((v) => (
            <option key={v} value={v}>
              {ARTIFACT_LABEL[v] ?? v}
            </option>
          ))}
        </select>
        <input
          name="document_id"
          placeholder="Document UUID (optional)"
          style={{
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 8,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        />
      </div>
      <input
        name="notes"
        placeholder="Notes (optional)…"
        style={{
          fontFamily: 'inherit',
          fontSize: 13,
          padding: 8,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm, 4px)',
        }}
      />
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="user-chip"
          style={{
            borderColor: 'var(--color-gold-500)',
            background: 'var(--color-gold-500)',
            color: 'white',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>{pending ? 'Adding…' : '+ Add artifact'}</span>
        </button>
      </div>
    </form>
  )
}
