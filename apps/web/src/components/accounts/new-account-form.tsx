'use client'

import { useState, useTransition } from 'react'
import { createAccount } from '@/app/(dashboard)/crm/accounts/actions'
import { accountIndustryValues } from '@third-code-erp/shared-types'

const INDUSTRY_LABELS: Record<string, string> = {
  retail: 'Retail',
  office: 'Office',
  food_and_beverage: 'Food & Beverage',
  healthcare: 'Healthcare',
  hospitality: 'Hospitality',
  industrial: 'Industrial',
  residential: 'Residential',
  mixed_use: 'Mixed-use',
  other: 'Other',
}

export function NewAccountForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await createAccount(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <form action={onSubmit} className="account-form">
      <div className="form-row">
        <label className="form-label" htmlFor="name">Company name *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={255}
          placeholder="Third Code Solutions Inc."
          className="form-input"
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="industry">Industry</label>
        <select id="industry" name="industry" className="form-input" defaultValue="other">
          {accountIndustryValues.map((v) => (
            <option key={v} value={v}>{INDUSTRY_LABELS[v] ?? v}</option>
          ))}
        </select>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="primary_email">Primary email</label>
          <input id="primary_email" name="primary_email" type="email" className="form-input" placeholder="contact@company.com" />
        </div>
        <div>
          <label className="form-label" htmlFor="primary_phone">Primary phone</label>
          <input id="primary_phone" name="primary_phone" type="tel" className="form-input" placeholder="+63 ..." />
        </div>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="billing_address">Billing address</label>
        <textarea id="billing_address" name="billing_address" rows={3} className="form-input" placeholder="Floor, Building, Street, City..." />
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 8 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="submit"
          disabled={pending}
          className="user-chip"
          style={{
            borderColor: 'var(--color-navy-700)',
            background: 'var(--color-navy-700)',
            color: 'white',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>{pending ? 'Creating…' : 'Create account'}</span>
        </button>
      </div>

      <style>{`
        .account-form { display: flex; flex-direction: column; gap: 14px; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .form-row-2col > div { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 12.5px; font-weight: 500; color: var(--color-neutral-700); }
        .form-input {
          font-family: inherit;
          font-size: 14px;
          padding: 8px 10px;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm, 4px);
          color: var(--color-neutral-900);
          transition: border-color var(--duration-fast);
        }
        .form-input:focus {
          outline: 0;
          border-color: var(--color-navy-500);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent);
        }
      `}</style>
    </form>
  )
}
