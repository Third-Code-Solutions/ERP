import type { Metadata } from 'next'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Create Account' }

export default function SignupPage() {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        padding: '40px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--color-navy-800)',
            margin: 0,
          }}
        >
          BuildOps
        </h1>
        <p style={{ color: 'var(--color-neutral-500)', marginTop: '4px', fontSize: '0.875rem' }}>
          Create your workspace
        </p>
      </div>
      <SignupForm />
    </div>
  )
}
