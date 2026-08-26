'use client'

import { useActionState, useEffect, useRef } from 'react'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'
import { submitDemoRequest } from './actions'
import styles from './book-demo.module.css'

const initialState: {
  message: string
  status: 'error' | 'idle' | 'success'
} = {
  message: '',
  status: 'idle',
}

const ORGANIZATION_LABELS: Record<(typeof ORGANIZATION_TYPES)[number], string> = {
  construction: 'Construction contractor',
  developer: 'Developer or owner',
  'design-engineering': 'Design or engineering firm',
  'supply-manufacturing': 'Supplier or manufacturer',
  'professional-services': 'Professional services',
  other: 'Other project-driven business',
}

export function DemoRequestForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(
    submitDemoRequest,
    initialState
  )

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset()
  }, [state.status])

  return (
    <form action={formAction} className={styles.form} ref={formRef}>
      <div className={styles.formGrid}>
        <label>
          Your name <span aria-hidden="true">*</span>
          <input autoComplete="name" name="contactName" required minLength={2} />
        </label>
        <label>
          Work email <span aria-hidden="true">*</span>
          <input autoComplete="email" name="workEmail" required type="email" />
        </label>
        <label>
          Company <span aria-hidden="true">*</span>
          <input autoComplete="organization" name="companyName" required minLength={2} />
        </label>
        <label>
          Your role
          <input autoComplete="organization-title" name="jobTitle" />
        </label>
        <label>
          Organization type <span aria-hidden="true">*</span>
          <select defaultValue="" name="organizationType" required>
            <option disabled value="">Choose one</option>
            {ORGANIZATION_TYPES.map((type) => (
              <option key={type} value={type}>{ORGANIZATION_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label>
          Company size
          <select defaultValue="" name="companySize">
            <option value="">Prefer not to say</option>
            <option value="1-10">1–10 people</option>
            <option value="11-50">11–50 people</option>
            <option value="51-200">51–200 people</option>
            <option value="201-500">201–500 people</option>
            <option value="501+">501+ people</option>
          </select>
        </label>
        <label>
          Phone
          <input autoComplete="tel" inputMode="tel" name="phone" />
        </label>
        <label>
          Best time for a demo
          <input name="preferredDemoWindow" placeholder="e.g. Weekday mornings, PHT" />
        </label>
      </div>

      <label className={styles.fullWidth}>
        What would you like to improve? <span aria-hidden="true">*</span>
        <textarea
          name="useCase"
          required
          minLength={10}
          placeholder="Tell us about your current workflow, teams, or projects."
          rows={5}
        />
      </label>

      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input autoComplete="off" id="website" name="website" tabIndex={-1} />
      </div>

      <label className={styles.consent}>
        <input name="privacyConsent" required type="checkbox" />
        <span>I agree that Third Code Solutions may contact me about this request.</span>
      </label>

      {state.status !== 'idle' ? (
        <p
          className={state.status === 'success' ? styles.success : styles.error}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}

      <button className={styles.submit} disabled={isPending} type="submit">
        {isPending ? 'Sending request…' : 'Request a demo'}
      </button>
    </form>
  )
}
